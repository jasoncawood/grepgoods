import request from 'supertest';
import { app } from '../src/index';
import { getDatabase } from '../src/db';
import { connection, worker, activityQueue } from '../src/queue';

describe('Listings API', () => {
  beforeAll(async () => {
    // Force use of a test database or clear current one if permissions allow
    // For local tests, we'll assume the environment is set up or mock the DB
    const db = await getDatabase();
    await db.run("DELETE FROM listings");
    await db.run(`
      INSERT INTO listings (activity_id, actor_id, item_name, price, currency, tags, status)
      VALUES 
      ('test-1', 'actor-1', 'Test Item A', 100, 'USD', '["#tag1"]', 'open'),
      ('test-2', 'actor-2', 'Test Item B', 200, 'EUR', '["#tag2"]', 'open'),
      ('test-3', 'actor-3', 'Test Item C', 300, 'USD', '["#tag1", "#tag3"]', 'open'),
      ('test-4', 'actor-4', 'Test Item D', 400, 'GBP', '[]', 'closed')
    `);
  });

  afterAll(async () => {
    // Close handles to allow Jest to exit
    const db = await getDatabase();
    await db.close();
    await worker.close();
    await activityQueue.close();
    await connection.quit();
  });

  it('should return all open listings', async () => {
    const res = await request(app).get('/api/listings');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(3);
  });

  it('should filter by search query', async () => {
    const res = await request(app).get('/api/listings?q=Item A');
    expect(res.body.length).toBe(1);
    expect(res.body[0].item_name).toBe('Test Item A');
  });

  it('should filter by currency', async () => {
    const res = await request(app).get('/api/listings?currency=EUR');
    expect(res.body.length).toBe(1);
    expect(res.body[0].currency).toBe('EUR');
  });

  it('should filter by tag', async () => {
    const res = await request(app).get('/api/listings?tag=tag1');
    expect(res.body.length).toBe(2);
  });

  it('should support pagination', async () => {
    const res = await request(app).get('/api/listings?limit=1&offset=1');
    expect(res.body.length).toBe(1);
    expect(res.body[0].item_name).toBe('Test Item B');
  });
});
