import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { getDatabase } from './db.js';
import { extractItemDetails } from './ollama.js';
import { sendDirectMessage } from './activitypub.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

export const connection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: null,
});

export const activityQueue = new Queue('activity-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Wait 5s, then 10s, then 20s...
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const worker = new Worker(
  'activity-processing',
  async (job: Job) => {
    const { activity } = job.data;
    const object = activity.object;

    console.log(`[Queue] Processing job ${job.id} for activity: ${activity.type}`);

    try {
      const db = await getDatabase();

      // Check if this is a #sold command
      const content = (object.content || '').toLowerCase();
      if (object.inReplyTo && (content.includes('#sold') || content.includes('sold'))) {
        const originalListing = await db.get(
          'SELECT item_name, actor_id FROM listings WHERE activity_id = ?',
          [object.inReplyTo]
        );

        if (originalListing && originalListing.actor_id === activity.actor) {
          await db.run("UPDATE listings SET status = 'closed' WHERE activity_id = ?", [object.inReplyTo]);
          await sendDirectMessage(activity.actor, `Your listing for "${originalListing.item_name}" has been closed.`);
          console.log(`[Queue] Listing closed: ${object.inReplyTo}`);
        }
        return;
      }

      // Treat as new listing
      const extractedData = await extractItemDetails(object.content);
      
      if (extractedData.isProhibited) {
        await sendDirectMessage(activity.actor, `Sorry, your listing for "${extractedData.itemName}" was rejected because it violates our guidelines.`);
        return;
      }

      const mediaUrls = (object.attachment || [])
        .filter((a: any) => a.type === 'Document' && (a.mediaType || '').startsWith('image/'))
        .map((a: any) => a.url);

      await db.run(
        `INSERT OR IGNORE INTO listings (activity_id, actor_id, content, item_name, price, currency, tags, media_urls)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          object.id, 
          activity.actor, 
          object.content, 
          extractedData.itemName, 
          extractedData.price, 
          extractedData.currency,
          JSON.stringify(extractedData.hashtags),
          JSON.stringify(mediaUrls)
        ]
      );

      const confirmationMsg = `Indexed your item: ${extractedData.itemName} (${extractedData.price} ${extractedData.currency}).\nReply with #sold to close.`;
      await sendDirectMessage(activity.actor, confirmationMsg);
      console.log(`[Queue] Successfully indexed: ${object.id}`);

    } catch (error) {
      console.error(`[Queue] Error in job ${job.id}:`, error);
      throw error; // Throwing ensures BullMQ retries the job
    }
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error(`[Queue] Job ${job?.id} failed after attempts:`, err);
});
