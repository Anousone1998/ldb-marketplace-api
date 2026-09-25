import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync } from 'node:crypto';
import { EnvironmentVariables } from '../config/env.validation';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Opaque, URL-safe stand-in for an employee ID in chat links, e.g. `/chats/2?peer=<token>`.
 *
 * Deterministic AES-256-GCM (IV = HMAC of the ID), so the same user always gets the same token
 * and links stay stable. The GCM tag makes tokens tamper-proof. This hides the ID only; access
 * is still enforced by ChatsService.resolveConversation. Keys derive from JWT_SECRET, so
 * rotating it invalidates old links.
 */
@Injectable()
export class PeerTokenService {
  private readonly encKey: Buffer;
  private readonly ivKey: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const secret = config.get('JWT_SECRET', { infer: true });
    this.encKey = Buffer.from(hkdfSync('sha256', secret, 'peer-token', 'enc', 32));
    this.ivKey = Buffer.from(hkdfSync('sha256', secret, 'peer-token', 'iv', 32));
  }

  encode(userId: string): string {
    const plain = Buffer.from(userId, 'utf8');
    const iv = createHmac('sha256', this.ivKey).update(plain).digest().subarray(0, IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64url');
  }

  /** Returns the employee ID, or null if the value is not a valid token. */
  decode(token: string): string | null {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length <= IV_LENGTH + TAG_LENGTH || raw.toString('base64url') !== token) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.encKey, raw.subarray(0, IV_LENGTH));
      decipher.setAuthTag(raw.subarray(raw.length - TAG_LENGTH));
      const plain = Buffer.concat([decipher.update(raw.subarray(IV_LENGTH, raw.length - TAG_LENGTH)), decipher.final()]);
      return plain.toString('utf8');
    } catch {
      return null;
    }
  }

  /** Accepts either a peer token or a plain employee ID (for existing clients). */
  resolve(value: string): string;
  resolve(value: string | undefined): string | undefined;
  resolve(value: string | undefined): string | undefined {
    if (!value) return value;
    return this.decode(value) ?? value;
  }
}
