import express, { Request, Response } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { getDatabase } from './db.js';
import { extractItemDetails } from './ollama.js';
import { getActorKeys, getActorJSON, getWebFinger, sendDirectMessage, verifySignature } from './activitypub.js';
import { activityQueue } from './queue.js';

dotenv.config();

const app = express();
export { app };
const port = process.env.PORT || 3000;

// Security: Helmet with custom CSP for image proxy
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "http://localhost:8080"], 
      "script-src": ["'self'", "'unsafe-inline'"], 
      "style-src": ["'self'", "'unsafe-inline'"],
      "upgrade-insecure-requests": null,
    },
  },
}));

app.use(express.json({ type: ['application/json', 'application/activity+json'] }));
app.use(express.static('public'));

app.get('/', (req: Request, res: Response) => {
  res.send('GrepGoods Ingestion Listener is running.');
});

// ActivityPub Actor Profile
app.get('/users/market', async (req: Request, res: Response) => {
  const keys = await getActorKeys();
  res.json(getActorJSON(keys.public_key));
});

// WebFinger
app.get('/.well-known/webfinger', (req: Request, res: Response) => {
  const resource = req.query.resource as string;
  if (!resource) return res.status(400).send('Missing resource');
  
  const wf = getWebFinger(resource);
  if (wf) {
    res.json(wf);
  } else {
    res.status(404).send('Not found');
  }
});

// API: Get Listings with Pagination and Filtering
app.get('/api/listings', async (req: Request, res: Response) => {
  try {
    const db = await getDatabase();
    const query = req.query.q as string;
    const currency = req.query.currency as string;
    const tag = req.query.tag as string;
    const minPrice = parseFloat(req.query.minPrice as string);
    const maxPrice = parseFloat(req.query.maxPrice as string);
    const limit = parseInt(req.query.limit as string) || 12;
    const offset = parseInt(req.query.offset as string) || 0;
    
    let sql = "SELECT * FROM listings WHERE status = 'open'";
    const params: any[] = [];

    if (query) {
      sql += " AND (item_name LIKE ? OR content LIKE ?)";
      params.push(`%${query}%`, `%${query}%`);
    }

    if (currency) {
      sql += " AND currency = ?";
      params.push(currency);
    }

    if (tag) {
      sql += " AND tags LIKE ?";
      params.push(`%${tag}%`);
    }

    if (!isNaN(minPrice)) {
      sql += " AND price >= ?";
      params.push(minPrice);
    }

    if (!isNaN(maxPrice)) {
      sql += " AND price <= ?";
      params.push(maxPrice);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const listings = await db.all(sql, params);

    // Parse JSON strings back into arrays
    const formattedListings = listings.map(l => ({
      ...l,
      tags: JSON.parse(l.tags || '[]'),
      media_urls: JSON.parse(l.media_urls || '[]')
    }));

    res.json(formattedListings);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// ActivityPub Inbox Endpoint
app.post('/inbox', async (req: Request, res: Response) => {
  const activity = req.body;
  
  console.log('Received activity:', JSON.stringify(activity, null, 2));

  // Security: Verify HTTP Signature
  const isValid = await verifySignature(req);
  if (!isValid) {
    console.warn('Unauthorized activity: Signature verification failed.');
    return res.status(401).send('Unauthorized');
  }

  // Handle Delete Activity
  if (activity.type === 'Delete') {
    const objectId = typeof activity.object === 'string' ? activity.object : activity.object?.id;
    console.log(`Handling Delete for: ${objectId}`);
    try {
      const db = await getDatabase();
      await db.run("DELETE FROM listings WHERE activity_id = ? AND actor_id = ?", [objectId, activity.actor]);
      return res.status(200).send('Deleted');
    } catch (error) {
      console.error('Delete error:', error);
      return res.status(500).send('Internal Server Error');
    }
  }

  // Handle Undo Activity
  if (activity.type === 'Undo') {
    const object = activity.object;
    const targetActivityId = typeof object === 'string' ? object : object?.id;
    console.log(`Handling Undo for activity: ${targetActivityId}`);
    
    try {
      const db = await getDatabase();
      // If the object being undone was the original 'Create' activity, delete the listing
      await db.run("DELETE FROM listings WHERE activity_id = ? AND actor_id = ?", [targetActivityId, activity.actor]);
      return res.status(200).send('Undone');
    } catch (error) {
      console.error('Undo error:', error);
      return res.status(500).send('Internal Server Error');
    }
  }

  // Basic validation and Blocklist Check
  if (activity.type === 'Create' && activity.object?.type === 'Note') {
    try {
      const db = await getDatabase();
      const actorUrl = new URL(activity.actor);

      const isBlocked = await db.get(
        "SELECT 1 FROM blocks WHERE (type = 'domain' AND value = ?) OR (type = 'actor' AND value = ?)",
        [actorUrl.hostname, activity.actor]
      );

      if (isBlocked) {
        console.warn(`Ignoring activity from blocked source: ${activity.actor}`);
        return res.status(403).send('Source blocked');
      }

      // OFF-LOAD TO QUEUE
      await activityQueue.add(`process-${activity.id}`, { activity });
      
      console.log(`Activity ${activity.id} queued for processing.`);
      return res.status(202).send('Accepted and Queued');

    } catch (error) {
      console.error('Inbox error:', error);
      return res.status(500).send('Internal Server Error');
    }
  }

  res.status(400).send('Unsupported activity type');
});

let server: any;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
}

export { server };
