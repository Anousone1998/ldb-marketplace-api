import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { User } from '../database/entities';
import { StorageService } from '../storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** How long a resolved identity is trusted before re-reading it from the database. */
const IDENTITY_CACHE_TTL_MS = 60 * 1000;
const IDENTITY_CACHE_MAX_ENTRIES = 5_000;

@Injectable()
export class UsersService {
  private readonly identityCache = new Map<string, { user: AuthUser; expiresAt: number }>();

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly storage: StorageService,
  ) {}

  findById(userId: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { userId } });
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException(`Employee ${userId} not found`);
    return user;
  }

  /** Public profile visible to other employees (e.g. to pay a seller via QR). */
  async getPublicProfile(userId: string) {
    const user = await this.getProfile(userId);
    return {
      userId: user.userId,
      fullName: user.fullName,
      department: user.department,
      phoneNumber: user.phoneNumber,
      qrPaymentUrl: user.qrPaymentUrl,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.getProfile(userId);

    if (dto.qrPaymentUrl) {
      this.storage.assertManagedUrls([dto.qrPaymentUrl]);
    }
    // The phone number is the login credential, so it can be changed but never cleared.
    if (dto.phoneNumber !== undefined) user.phoneNumber = dto.phoneNumber;
    if (dto.qrPaymentUrl !== undefined) user.qrPaymentUrl = dto.qrPaymentUrl;

    return this.usersRepo.save(user);
  }

  /**
   * Saves the device's FCM token for this employee. If another employee signed in on the same
   * device before, the token is moved so notifications never reach the previous account.
   */
  async updateFcmToken(userId: string, fcmToken: string): Promise<{ updated: true }> {
    await this.usersRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const exists = await repo.exists({ where: { userId } });
      if (!exists) throw new NotFoundException(`Employee ${userId} not found`);

      await repo.update({ fcmToken, userId: Not(userId) }, { fcmToken: null });
      await repo.update({ userId }, { fcmToken });
    });
    return { updated: true };
  }

  /** Call on logout so the device stops receiving this employee's notifications. */
  async clearFcmToken(userId: string): Promise<{ cleared: true }> {
    await this.usersRepo.update({ userId }, { fcmToken: null });
    return { cleared: true };
  }

  /** For push senders; the column is excluded from normal reads. */
  async getFcmToken(userId: string): Promise<string | null> {
    const row = await this.usersRepo.findOne({ where: { userId }, select: { userId: true, fcmToken: true } });
    return row?.fcmToken ?? null;
  }

  /** Resolves the employee behind a verified token; null if the account was deleted. */
  async resolveTokenSubject(userId: string): Promise<AuthUser | null> {
    const cached = this.identityCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    const row = await this.usersRepo.findOne({
      where: { userId },
      select: { userId: true, fullName: true, department: true },
    });
    if (!row) {
      this.identityCache.delete(userId);
      return null;
    }

    const user: AuthUser = { userId: row.userId, fullName: row.fullName, department: row.department };
    if (this.identityCache.size >= IDENTITY_CACHE_MAX_ENTRIES) {
      const oldestKey = this.identityCache.keys().next().value;
      if (oldestKey !== undefined) this.identityCache.delete(oldestKey);
    }
    this.identityCache.set(userId, { user, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
    return user;
  }
}
