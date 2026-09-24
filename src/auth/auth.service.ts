import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, timingSafeEqual } from 'node:crypto';
import { EnvironmentVariables } from '../config/env.validation';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/auth.dto';
import { AuthUser, JwtPayload, LoginResponse } from './interfaces/auth-user.interface';

const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
const INVALID_CREDENTIALS = 'Invalid employee ID or phone number';

/** "+856 20-5555 (0101)" → "8562055550101" */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Constant-time comparison so the stored number can't be probed via response timing. */
function phonesMatch(input: string, stored: string | null): boolean {
  const a = createHash('sha256').update(normalizePhone(input)).digest();
  const b = createHash('sha256').update(stored ? normalizePhone(stored) : '\0no-phone').digest();
  return timingSafeEqual(a, b) && !!stored;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Logs in with employee ID + the phone number stored in the users table. */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findById(dto.userId);
    const valid = phonesMatch(dto.phoneNumber, user?.phoneNumber ?? null);
    if (!user || !valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    return this.issueToken({ userId: user.userId, fullName: user.fullName, department: user.department });
  }

  /** Verifies a bearer token and resolves the employee (HTTP guard + WebSocket handshake). */
  async verifyToken(token: string): Promise<AuthUser> {
    let payload: JwtPayload;
    try {
      const issuer = this.config.get('JWT_ISSUER', { infer: true });
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        algorithms: ['HS256'],
        ...(issuer ? { issuer } : {}),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    if (typeof payload.sub !== 'string' || !EMPLOYEE_ID_PATTERN.test(payload.sub)) {
      throw new UnauthorizedException('Invalid token subject');
    }

    const user = await this.usersService.resolveTokenSubject(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Account no longer exists');
    }
    return user;
  }

  private async issueToken(user: AuthUser): Promise<LoginResponse> {
    const expiresIn = this.config.get('JWT_EXPIRES_IN', { infer: true });
    const issuer = this.config.get('JWT_ISSUER', { infer: true });
    const payload: JwtPayload = {
      sub: user.userId,
      name: user.fullName,
      ...(user.department ? { department: user.department } : {}),
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn,
      ...(issuer ? { issuer } : {}),
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, user };
  }
}
