import crypto from 'node:crypto';
import { testConfig } from '../../index';

export function internalHeaders(userId: string, requestId = 'tc-pokeapi-request'): Record<string, string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'pokemart-api',
    aud: 'pokemart-bff',
    sub: userId,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', testConfig.auth.jwtSecret).update(unsigned).digest('base64url');
  return { Authorization: `Bearer ${unsigned}.${signature}`, 'X-User-Id': userId, 'X-Request-Id': requestId };
}
