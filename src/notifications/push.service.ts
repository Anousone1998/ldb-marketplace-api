import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { App, cert, getApps, initializeApp, ServiceAccount } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Repository } from 'typeorm';
import { EnvironmentVariables } from '../config/env.validation';
import { Notification, User } from '../database/entities';

/** FCM errors that mean the device token is dead and should be forgotten. */
const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/**
 * Sends push notifications through Firebase Cloud Messaging (free) — the only Firebase product
 * this app uses. No Firestore, Firebase Storage or other billable services.
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT_JSON (inline JSON) or FIREBASE_SERVICE_ACCOUNT_PATH.
 * Without either, push is disabled and notifications are still stored and sent over Socket.io.
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null = null;

  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  onModuleInit(): void {
    const credentials = this.loadServiceAccount();
    if (!credentials) {
      this.logger.warn('FCM disabled: set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON');
      return;
    }
    try {
      const app: App = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
      this.messaging = getMessaging(app);
      this.logger.log('FCM push enabled');
    } catch (err) {
      this.logger.error('FCM disabled: invalid Firebase service account', err instanceof Error ? err.message : err);
    }
  }

  /** Best effort: never throws. Clears the user's token if FCM says it is no longer valid. */
  async sendToUser(userId: string, notification: Notification): Promise<void> {
    if (!this.messaging) return;

    const row = await this.usersRepo.findOne({ where: { userId }, select: { userId: true, fcmToken: true } });
    const token = row?.fcmToken;
    if (!token) return;

    try {
      await this.messaging.send({
        token,
        notification: { title: notification.title, body: notification.body ?? undefined },
        // FCM data values must be strings.
        data: {
          notificationId: notification.notificationId,
          type: notification.type,
          itemId: notification.itemId ?? '',
          orderId: notification.orderId ?? '',
        },
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code && STALE_TOKEN_ERRORS.has(code)) {
        // Only clear if the token was not replaced in the meantime.
        await this.usersRepo.update({ userId, fcmToken: token }, { fcmToken: null });
        this.logger.debug(`Removed stale FCM token for ${userId} (${code})`);
        return;
      }
      this.logger.warn(`FCM send to ${userId} failed: ${code ?? (err instanceof Error ? err.message : err)}`);
    }
  }

  private loadServiceAccount(): ServiceAccount | null {
    const json = this.config.get('FIREBASE_SERVICE_ACCOUNT_JSON', { infer: true });
    const path = this.config.get('FIREBASE_SERVICE_ACCOUNT_PATH', { infer: true });
    try {
      if (json) return JSON.parse(json) as ServiceAccount;
      if (path) return JSON.parse(readFileSync(resolve(path), 'utf8')) as ServiceAccount;
    } catch (err) {
      this.logger.error('Could not read Firebase service account', err instanceof Error ? err.message : err);
    }
    return null;
  }
}
