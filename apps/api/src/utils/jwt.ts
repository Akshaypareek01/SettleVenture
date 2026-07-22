import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { PartnerRole } from '../models/Partner.model.js';

export interface JwtPayload {
  sub: string;
  email: string;
  role: PartnerRole;
}

/**
 * Signs a JWT for the authenticated partner.
 * @param payload - User identity fields
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    issuer: 'apexledger',
  });
}

/**
 * Verifies and decodes a JWT token.
 * @param token - JWT string from cookie or header
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'apexledger',
    algorithms: ['HS256'],
  }) as JwtPayload;
}
