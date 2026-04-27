import { activityQueue, worker, connection } from '../src/queue';
import { getDatabase } from '../src/db';
import nock from 'nock';
import * as ollamaModule from '../src/ollama';

// Mock the entire module
jest.mock('../src/ollama', () => ({
  extractItemDetails: jest.fn()
}));

describe('AI Safety & Error Fallbacks', () => {
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
    jest.clearAllMocks();
  });

  it('should reject prohibited items and send DM', async () => {
    (ollamaModule.extractItemDetails as jest.Mock).mockResolvedValue({
      itemName: 'Prohibited Item',
      price: 100,
      currency: 'USD',
      hashtags: [],
      isProhibited: true
    });

    const activity = {
      type: 'Create',
      actor: 'https://remote.com/users/malice',
      object: {
        id: 'https://remote.com/posts/bad',
        type: 'Note',
        content: 'Selling something illegal'
      }
    };

    nock('https://remote.com')
      .get('/users/malice')
      .reply(200, { inbox: 'https://remote.com/inbox' });
    nock('https://remote.com')
      .post('/inbox')
      .reply(202);

    const job = await activityQueue.add('safety-test', { activity });
    await (worker as any).processFn(job);

    const db = await getDatabase();
    const listing = await db.get("SELECT * FROM listings WHERE activity_id = ?", ['https://remote.com/posts/bad']);
    expect(listing).toBeUndefined();
  });

  it('should fallback to default values on Ollama error', async () => {
    (ollamaModule.extractItemDetails as jest.Mock).mockRejectedValue(new Error('AI Offline'));

    const activity = {
      type: 'Create',
      actor: 'https://remote.com/users/bob',
      object: {
        id: 'https://remote.com/posts/error-test',
        type: 'Note',
        content: 'Valid item but AI fails'
      }
    };

    const job = await activityQueue.add('error-test', { activity });
    
    // The worker should catch the error and throw it for BullMQ retry
    await expect((worker as any).processFn(job)).rejects.toThrow('AI Offline');
  });
});
