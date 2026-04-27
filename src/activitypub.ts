import forge from 'node-forge';
import crypto from 'crypto';
import { getDatabase } from './db.js';

const DOMAIN = process.env.DOMAIN || 'grepgoods.space';
const ACTOR_NAME = 'market';

export async function getActorKeys() {
  const db = await getDatabase();
  const actor_id = `https://${DOMAIN}/users/${ACTOR_NAME}`;
  
  const existing = await db.get('SELECT * FROM keys WHERE actor_id = ?', [actor_id]);
  if (existing) {
    return existing;
  }

  console.log('Generating new keys for actor...');
  const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(2048);
  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const publicKeyPem = forge.pki.publicKeyToPem(publicKey);

  await db.run(
    'INSERT INTO keys (actor_id, public_key, private_key) VALUES (?, ?, ?)',
    [actor_id, publicKeyPem, privateKeyPem]
  );

  return { actor_id, public_key: publicKeyPem, private_key: privateKeyPem };
}

export function getActorJSON(publicKeyPem: string) {
  return {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1"
    ],
    "id": `https://${DOMAIN}/users/${ACTOR_NAME}`,
    "type": "Service",
    "preferredUsername": ACTOR_NAME,
    "name": "GrepGoods Market",
    "inbox": `https://${DOMAIN}/inbox`,
    "publicKey": {
      "id": `https://${DOMAIN}/users/${ACTOR_NAME}#main-key`,
      "owner": `https://${DOMAIN}/users/${ACTOR_NAME}`,
      "publicKeyPem": publicKeyPem
    }
  };
}

export function getWebFinger(resource: string) {
  if (resource === `acct:${ACTOR_NAME}@${DOMAIN}`) {
    return {
      "subject": `acct:${ACTOR_NAME}@${DOMAIN}`,
      "links": [
        {
          "rel": "self",
          "type": "application/activity+json",
          "href": `https://${DOMAIN}/users/${ACTOR_NAME}`
        }
      ]
    };
  }
  return null;
}

/**
 * Signs and sends a request with Authorized Fetch
 */
async function signedRequest(url: string, method: string = 'GET', body: any = null) {
  const keys = await getActorKeys();
  const actorId = `https://${DOMAIN}/users/${ACTOR_NAME}`;
  const targetUrl = new URL(url);
  const date = new Date().toUTCString();
  
  let digest = '';
  let headersToSign = `(request-target) host date`;
  
  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    digest = crypto.createHash('sha256').update(bodyStr).digest('base64');
    headersToSign += ' digest';
  }

  const signingString = `(request-target): ${method.toLowerCase()} ${targetUrl.pathname}${targetUrl.search}\nhost: ${targetUrl.host}\ndate: ${date}${digest ? `\ndigest: SHA-256=${digest}` : ''}`;
  
  const signer = crypto.createSign('sha256');
  signer.update(signingString);
  const signature = signer.sign(keys.private_key, 'base64');

  const header = `keyId="${actorId}#main-key",algorithm="rsa-sha256",headers="${headersToSign}",signature="${signature}"`;

  const fetchHeaders: any = {
    'Host': targetUrl.host,
    'Date': date,
    'Signature': header,
    'Accept': 'application/activity+json',
  };

  if (digest) {
    fetchHeaders['Digest'] = `SHA-256=${digest}`;
    fetchHeaders['Content-Type'] = 'application/activity+json';
  }

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null
  });
}

export async function verifySignature(req: any) {
  const signatureHeader = req.headers.signature;
  if (!signatureHeader) return false;

  const parts: any = {};
  signatureHeader.split(',').forEach((p: string) => {
    const [key, val] = p.split('=');
    if (key && val) parts[key] = val.replace(/"/g, '');
  });

  const { keyId, headers, signature } = parts;
  if (!keyId || !signature) return false;

  try {
    // Fetch the public key from the remote actor
    const keyResponse = await signedRequest(keyId);
    const keyData: any = await keyResponse.json();
    
    let publicKeyPem = '';
    if (keyData.publicKey?.publicKeyPem) {
        publicKeyPem = keyData.publicKey.publicKeyPem;
    } else if (keyData.publicKeyPem) {
        publicKeyPem = keyData.publicKeyPem;
    } else {
        return false;
    }

    // Reconstruct the signing string
    const headerList = headers.split(' ');
    const signingString = headerList.map((h: string) => {
      if (h === '(request-target)') return `(request-target): post ${req.path}`;
      return `${h}: ${req.headers[h]}`;
    }).join('\n');

    // Verify
    const verifier = crypto.createVerify('sha256');
    verifier.update(signingString);
    return verifier.verify(publicKeyPem, signature, 'base64');
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

export async function sendDirectMessage(toActorUri: string, message: string) {
  try {
    const actorResponse = await signedRequest(toActorUri);
    if (!actorResponse.ok) return;

    const actorData: any = await actorResponse.json();
    const inbox = actorData.sharedInbox || actorData.inbox;
    if (!inbox) return;

    const activityId = `https://${DOMAIN}/activities/${crypto.randomUUID()}`;
    const activity = {
      "@context": "https://www.w3.org/ns/activitystreams",
      "id": activityId,
      "type": "Create",
      "actor": `https://${DOMAIN}/users/${ACTOR_NAME}`,
      "to": [toActorUri],
      "object": {
        "id": `${activityId}/note`,
        "type": "Note",
        "published": new Date().toISOString(),
        "attributedTo": `https://${DOMAIN}/users/${ACTOR_NAME}`,
        "to": [toActorUri],
        "content": `<p>${message}</p>`,
        "visibility": "direct"
      }
    };

    const response = await signedRequest(inbox, 'POST', activity);
    console.log(`DM sent to ${toActorUri}, status: ${response.status}`);
  } catch (error) {
    console.error(`Failed to send DM to ${toActorUri}:`, error);
  }
}
