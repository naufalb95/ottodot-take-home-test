import type { Role } from '@prisma/client';
import type { Session } from './auth.js';
import type { TxClient } from './db.js';
import { AppError } from './errors.js';

export function requireRole(session: Session, ...roles: Role[]): void {
  if (!roles.includes(session.role)) {
    throw AppError.forbidden('Insufficient permissions');
  }
}

export async function requireClassOwnership(
  tx: TxClient,
  session: Session,
  classId: string,
): Promise<void> {
  if (session.role === 'ADMIN') return;

  const cls = await tx.trialClass.findUnique({
    where: { id: classId },
    select: { teacherId: true },
  });

  if (!cls) throw AppError.notFound('Class not found');
  if (cls.teacherId !== session.userId) {
    throw AppError.forbidden('You can only manage your own classes');
  }
}

export async function requireStudentOwnership(
  tx: TxClient,
  session: Session,
  studentId: string,
): Promise<void> {
  const student = await tx.student.findUnique({
    where: { id: studentId },
    select: { parentId: true },
  });

  if (!student) throw AppError.notFound('Student not found');
  if (student.parentId !== session.userId) {
    throw AppError.forbidden('You can only manage your own students');
  }
}

export async function requireBookingOwnership(
  tx: TxClient,
  session: Session,
  bookingId: string,
): Promise<void> {
  if (session.role === 'ADMIN') return;

  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { student: { select: { parentId: true } } },
  });

  if (!booking) throw AppError.notFound('Booking not found');
  if (booking.student.parentId !== session.userId) {
    throw AppError.forbidden('You can only manage your own bookings');
  }
}
