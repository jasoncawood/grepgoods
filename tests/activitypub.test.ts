import { getActorKeys, getActorJSON, getWebFinger, verifySignature } from '../src/activitypub';
import { getDatabase } from '../src/db';
import { connection, worker, activityQueue } from '../src/queue';
import nock from 'nock';
import crypto from 'crypto';

describe('ActivityPub Identity & Discovery', () => {
  beforeAll(async () => {
    const db = await getDatabase();
    await db.run("DELETE FROM keys");
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

  it('should generate and retrieve actor keys', async () => {
    const keys1 = await getActorKeys();
    expect(keys1.public_key).toContain('BEGIN PUBLIC KEY');
    expect(keys1.private_key).toContain('BEGIN RSA PRIVATE KEY');

    const keys2 = await getActorKeys();
    expect(keys2.public_key).toBe(keys1.public_key);
  });

  it('should return valid Actor JSON', async () => {
    const keys = await getActorKeys();
    const actor = getActorJSON(keys.public_key);
    expect(actor.type).toBe('Service');
    expect(actor.preferredUsername).toBe('market');
    expect(actor.publicKey.publicKeyPem).toBe(keys.public_key);
  });

  it('should handle WebFinger discovery', () => {
    const wf = getWebFinger('acct:market@grepgoods.space');
    expect(wf?.subject).toBe('acct:market@grepgoods.space');
    expect(wf?.links[0].href).toContain('/users/market');
  });

  it('should verify a valid incoming signature', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    
    const remoteActorId = 'https://remote.com/users/alice';
    const remoteKeyId = `${remoteActorId}#main-key`;

    nock('https://remote.com')
      .get('/users/alice')
      .reply(200, {
        id: remoteActorId,
        publicKey: {
          id: remoteKeyId,
          owner: remoteActorId,
          publicKeyPem: publicKeyPem
        }
      });

    const path = '/inbox';
    const date = new Date().toUTCString();
    const signingString = `(request-target): post ${path}\nhost: localhost:3000\ndate: ${date}`;
    const signature = crypto.sign('sha256', Buffer.from(signingString), privateKey).toString('base64');
    
    const mockReq = {
      path,
      headers: {
        host: 'localhost:3000',
        date,
        signature: `keyId="${remoteKeyId}",headers="(request-target) host date",signature="${signature}"`
      }
    };

    const isValid = await verifySignature(mockReq);
    expect(isValid).toBe(true);
  });
});
