import { z } from 'zod';

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const createStudentSchema = z.object({
  name: z.string().min(1),
  dateOfBirth: z.iso.date(),
  notes: z.string().optional(),
});

export const updateStudentSchema = z.object({
  name: z.string().min(1).optional(),
  dateOfBirth: z.iso.date().optional(),
  notes: z.string().nullable().optional(),
});

export const createClassSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default('SGD'),
  location: z.string().min(1),
  ageMin: z.number().int().min(0).optional(),
  ageMax: z.number().int().min(0).optional(),
});

export const updateClassSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  startsAt: z.iso.datetime().optional(),
  endsAt: z.iso.datetime().optional(),
  priceCents: z.number().int().min(0).optional(),
  location: z.string().min(1).optional(),
  ageMin: z.number().int().min(0).nullable().optional(),
  ageMax: z.number().int().min(0).nullable().optional(),
});

export const createBookingSchema = z.object({
  trialClassId: z.uuid(),
  studentId: z.uuid(),
  returnUrl: z.url(),
});

export const paymentWebhookSchema = z.object({
  type: z.enum(['payment.succeeded', 'payment.failed']),
  provider_ref: z.string(),
  booking_id: z.uuid(),
  amount_cents: z.number().int(),
  currency: z.string(),
  failure_reason: z.string().optional(),
});
