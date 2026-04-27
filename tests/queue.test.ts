import { activityQueue, worker, connection } from '../src/queue';
import { getDatabase } from '../src/db';
import nock from 'nock';
import { Ollama } from 'ollama';

// Mock the Ollama library
jest.mock('ollama', () => {
  return {
    Ollama: jest.fn().mockImplementation(() => ({
      generate: jest.fn().mockResolvedValue({
        response: JSON.stringify({
          itemName: 'Cool Gadget',
          price: 50,
          currency: 'USD',
          hashtags: ['#electronics'],
          isProhibited: false
        })
      })
    }))
  };
});

describe('Background Queue Worker', () => {
  beforeAll(async () => {
    const db = await getDatabase();
    await db.run("DELETE FROM listings");
    await worker.pause();
  });

  afterAll(async () => {
    const db = await getDatabase();
    await db.close();
    await worker.close();
    await activityQueue.close();
    await connection.quit();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should process a new listing activity', async () => {
    const activity = {
      type: 'Create',
      actor: 'https://remote.com/users/alice',
      object: {
        id: 'https://remote.com/posts/1',
        type: 'Note',
        content: 'Selling a cool gadget for 50 USD #electronics'
      }
    };

    // Mock remote actor lookup for DM sending
    nock('https://remote.com')
      .get('/users/alice')
      .reply(200, {
        id: 'https://remote.com/users/alice',
        inbox: 'https://remote.com/users/alice/inbox'
      });

    // Mock DM sending
    nock('https://remote.com')
      .post('/users/alice/inbox')
      .reply(202);

    const job = await activityQueue.add('test-job', { activity });
    
    await (worker as any).processFn(job);

    const db = await getDatabase();
    const listing = await db.get("SELECT * FROM listings WHERE activity_id = ?", ['https://remote.com/posts/1']);
    
    expect(listing).toBeDefined();
    expect(listing.item_name).toBe('Cool Gadget');
  });

  it('should handle #sold command', async () => {
    const db = await getDatabase();
    await db.run(
      "INSERT INTO listings (activity_id, actor_id, item_name, status) VALUES (?, ?, ?, ?)",
      ['https://remote.com/posts/2', 'https://remote.com/users/alice', 'Old Phone', 'open']
    );

    const activity = {
      type: 'Create',
      actor: 'https://remote.com/users/alice',
      object: {
        id: 'https://remote.com/posts/sold-msg',
        type: 'Note',
        inReplyTo: 'https://remote.com/posts/2',
        content: '@market@grepgoods.space #sold'
      }
    };

    nock('https://remote.com')
      .get('/users/alice')
      .reply(200, { inbox: 'https://remote.com/users/alice/inbox' });
    nock('https://remote.com')
      .post('/users/alice/inbox')
      .reply(202);

    const job = await activityQueue.add('test-sold', { activity });
    await (worker as any).processFn(job);

    const updated = await db.get("SELECT status FROM listings WHERE activity_id = ?", ['https://remote.com/posts/2']);
    expect(updated.status).toBe('closed');
  });
});
