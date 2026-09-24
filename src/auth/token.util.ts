import type { Socket } from 'socket.io';

export function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const [scheme, token] = value.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Accepts `auth: { token }` (preferred), an Authorization header, or `?token=` query. */
export function extractSocketToken(socket: Socket): string | null {
  const authToken = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken.replace(/^Bearer\s+/i, '');
  }

  const headerToken = extractBearerToken(socket.handshake.headers.authorization);
  if (headerToken) return headerToken;

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;

  return null;
}
