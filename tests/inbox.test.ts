import request from 'supertest';
import { app } from '../src/index';
import { getDatabase } from '../src/db';
import * as activitypub from '../src/activitypub';
import { activityQueue, connection, worker } from '../src/queue';

// Mock verifySignature to avoid complex crypto/nock setup in every test
jest.mock('../src/activitypub', () => ({
  ...jest.requireActual('../src/activitypub'),
  verifySignature: jest.fn()
}));

// Mock the queue add method
jest.spyOn(activityQueue, 'add').mockImplementation(() => Promise.resolve({ id: 'mock-job-id' } as any));

describe('ActivityPub Inbox', () => {
  beforeAll(async () => {
    const db = await getDatabase();
    await db.run("DELETE FROM listings");
    await db.run("DELETE FROM blocks");
  });

  afterAll(async () => {
    const db = await getDatabase();
    await db.close();
    await worker.close();
    await activityQueue.close();
    await connection.quit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if signature is invalid', async () => {
    (activitypub.verifySignature as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/inbox')
      .send({ type: 'Create', actor: 'https://remote.com/users/alice' });

    expect(res.status).toBe(401);
  });

  it('should queue a valid Create activity and return 202', async () => {
    (activitypub.verifySignature as jest.Mock).mockResolvedValue(true);

    const activity = {
      type: 'Create',
      id: 'https://remote.com/act/1',
      actor: 'https://remote.com/users/alice',
      object: { type: 'Note', content: 'Selling stuff' }
    };

    const res = await request(app)
      .post('/inbox')
      .send(activity);

    expect(res.status).toBe(202);
    expect(activityQueue.add).toHaveBeenCalledWith(
      expect.stringContaining('process-'),
      expect.objectContaining({ activity })
    );
  });

  it('should handle Delete activity immediately', async () => {
    (activitypub.verifySignature as jest.Mock).mockResolvedValue(true);
    const db = await getDatabase();
    
    // Seed a listing to delete
    await db.run("INSERT INTO listings (activity_id, actor_id) VALUES (?, ?)", ['post-to-delete', 'https://remote.com/users/alice']);

    const res = await request(app)
      .post('/inbox')
      .send({
        type: 'Delete',
        actor: 'https://remote.com/users/alice',
        object: 'post-to-delete'
      });

    expect(res.status).toBe(200);
    const listing = await db.get("SELECT * FROM listings WHERE activity_id = ?", ['post-to-delete']);
    expect(listing).toBeUndefined();
  });

  it('should reject activities from blocked domains', async () => {
    (activitypub.verifySignature as jest.Mock).mockResolvedValue(true);
    const db = await getDatabase();
    
    // Block a domain
    await db.run("INSERT INTO blocks (type, value) VALUES ('domain', 'evil.com')");

    const res = await request(app)
      .post('/inbox')
      .send({
        type: 'Create',
        actor: 'https://evil.com/users/badguy',
        object: { type: 'Note', content: 'spam' }
      });

    expect(res.status).toBe(403);
    expect(res.text).toBe('Source blocked');
  });

  it('should handle Undo activity', async () => {
    (activitypub.verifySignature as jest.Mock).mockResolvedValue(true);
    const db = await getDatabase();
    
    await db.run("INSERT INTO listings (activity_id, actor_id) VALUES (?, ?)", ['undone-id', 'https://remote.com/users/alice']);

    const res = await request(app)
      .post('/inbox')
      .send({
        type: 'Undo',
        actor: 'https://remote.com/users/alice',
        object: { id: 'undone-id' }
      });

    expect(res.status).toBe(200);
    const listing = await db.get("SELECT * FROM listings WHERE activity_id = ?", ['undone-id']);
    expect(listing).toBeUndefined();
  });
});
