import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@prisma/client';
import { AppError } from './errors';

export interface Session {
  userId: string;
  role: Role;
}

const COOKIE_NAME = 'session';

export function setSession(reply: FastifyReply, session: Session): void {
  reply.setCookie(COOKIE_NAME, JSON.stringify(session), {
    path: '/',
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function getSession(request: FastifyRequest): Session | null {
  const raw = request.cookies[COOKIE_NAME];
  if (!raw) return null;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;

  try {
    return JSON.parse(unsigned.value) as Session;
  } catch {
    return null;
  }
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireSession(request: FastifyRequest): Session {
  const session = getSession(request);
  if (!session) throw AppError.unauthorized('Not authenticated');
  return session;
}
