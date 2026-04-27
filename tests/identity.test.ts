import request from 'supertest';
import { app } from '../src/index';
import { getDatabase } from '../src/db';
import { connection, worker, activityQueue } from '../src/queue';
import nock from 'nock';
import crypto from 'crypto';

describe('Actor Identity & Signature Failures', () => {
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

  it('should serve the Actor Profile (GET /users/market)', async () => {
    const res = await request(app).get('/users/market');
    expect(res.status).toBe(200);
    expect(res.body.type).toBe('Service');
    expect(res.body.preferredUsername).toBe('market');
    expect(res.body.publicKey.publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('should return 400 for WebFinger without resource', async () => {
    const res = await request(app).get('/.well-known/webfinger');
    expect(res.status).toBe(400);
  });

  it('should return 404 for unknown WebFinger resource', async () => {
    const res = await request(app).get('/.well-known/webfinger?resource=acct:nobody@grepgoods.space');
    expect(res.status).toBe(404);
  });

  describe('Complex Signature Failures', () => {
    it('should reject requests with missing signature header', async () => {
      const res = await request(app)
        .post('/inbox')
        .send({ type: 'Create' });
      expect(res.status).toBe(401);
    });

    it('should reject malformed signature headers', async () => {
      const res = await request(app)
        .post('/inbox')
        .set('Signature', 'this is not a valid signature header')
        .send({ type: 'Create' });
      expect(res.status).toBe(401);
    });

    it('should reject signature with missing keyId', async () => {
      const res = await request(app)
        .post('/inbox')
        .set('Signature', 'headers="(request-target) host date",signature="aaaa"')
        .send({ type: 'Create' });
      expect(res.status).toBe(401);
    });

    it('should reject if remote key fetch fails', async () => {
      const remoteKeyId = 'https://remote.com/users/alice#main-key';
      
      nock('https://remote.com')
        .get('/users/alice')
        .reply(404); // Key not found

      const res = await request(app)
        .post('/inbox')
        .set('Signature', `keyId="${remoteKeyId}",headers="(request-target) host date",signature="aaaa"`)
        .send({ type: 'Create' });

      expect(res.status).toBe(401);
    });

    it('should reject if signature is invalid for the content', async () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      
      const remoteActorId = 'https://remote.com/users/bob';
      const remoteKeyId = `${remoteActorId}#main-key`;

      nock('https://remote.com')
        .get('/users/bob')
        .reply(200, { publicKey: { publicKeyPem } });

      const date = new Date().toUTCString();
      const signature = crypto.sign('sha256', Buffer.from('wrong string'), privateKey).toString('base64');
      
      const res = await request(app)
        .post('/inbox')
        .set('Date', date)
        .set('Signature', `keyId="${remoteKeyId}",headers="(request-target) host date",signature="${signature}"`)
        .send({ type: 'Create' });

      expect(res.status).toBe(401);
    });
  });
});
