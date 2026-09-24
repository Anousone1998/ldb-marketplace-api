/** The authenticated employee attached to each HTTP request / socket connection. */
export interface AuthUser {
  userId: string;
  fullName: string;
  department: string | null;
}

/** Claims in the access tokens issued by POST /auth/login (HS256). */
export interface JwtPayload {
  sub: string;
  name?: string;
  department?: string;
  iat?: number;
  exp?: number;
  iss?: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}
