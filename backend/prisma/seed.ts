import { PrismaClient, Role, BookingStatus, PaymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const hash = (plain: string) => bcrypt.hashSync(plain, 12);

const SEATS = Number(process.env.DEFAULT_CLASS_SEATS ?? 4);

async function createClassWithSeats(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  data: {
    teacherId: string;
    title: string;
    slug: string;
    description: string;
    startsAt: Date;
    endsAt: Date;
    priceCents: number;
    location: string;
    ageMin?: number;
    ageMax?: number;
  },
) {
  const cls = await tx.trialClass.create({ data });
  await tx.seat.createMany({
    data: Array.from({ length: SEATS }, () => ({ trialClassId: cls.id })),
  });
  return cls;
}

async function confirmBooking(
  tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
  trialClassId: string,
  studentId: string,
  priceCents: number,
) {
  const booking = await tx.booking.create({
    data: {
      trialClassId,
      studentId,
      status: BookingStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });

  const freeSeat = await tx.seat.findFirst({
    where: { trialClassId, bookingId: null },
  });
  if (!freeSeat) throw new Error(`No free seat in class ${trialClassId}`);

  await tx.seat.update({
    where: { id: freeSeat.id },
    data: { bookingId: booking.id },
  });

  await tx.paymentAttempt.create({
    data: {
      bookingId: booking.id,
      providerRef: `stub_seed_${booking.id}`,
      amountCents: priceCents,
      status: PaymentStatus.SUCCEEDED,
    },
  });

  return booking;
}

async function main() {
  // Clean slate — reverse FK order
  await prisma.paymentAttempt.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.student.deleteMany();
  await prisma.trialClass.deleteMany();
  await prisma.user.deleteMany();

  await prisma.$transaction(async (tx) => {
    // ── users ──────────────────────────────────────────────────────────

    const admin = await tx.user.create({
      data: {
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com',
        passwordHash: hash(process.env.SEED_ADMIN_PASSWORD ?? 'admin12345'),
        name: 'Admin',
        role: Role.ADMIN,
      },
    });

    const teacher = await tx.user.create({
      data: {
        email: 'rachel@example.com',
        passwordHash: hash('teacher12345'),
        name: 'Ms. Rachel',
        phone: '+6591234567',
        role: Role.TEACHER,
      },
    });

    const alice = await tx.user.create({
      data: {
        email: 'alice@example.com',
        passwordHash: hash('parent12345'),
        name: 'Alice Tan',
        phone: '+6592345678',
        role: Role.PARENT,
      },
    });

    const bob = await tx.user.create({
      data: {
        email: 'bob@example.com',
        passwordHash: hash('parent12345'),
        name: 'Bob Lee',
        phone: '+6593456789',
        role: Role.PARENT,
      },
    });

    const charlie = await tx.user.create({
      data: {
        email: 'charlie@example.com',
        passwordHash: hash('parent12345'),
        name: 'Charlie Ng',
        phone: '+6594567890',
        role: Role.PARENT,
      },
    });

    // ── students ───────────────────────────────────────────────────────

    const sophie = await tx.student.create({
      data: {
        parentId: alice.id,
        name: 'Sophie Tan',
        dateOfBirth: new Date('2020-03-15'),
      },
    });

    const ethan = await tx.student.create({
      data: {
        parentId: bob.id,
        name: 'Ethan Lee',
        dateOfBirth: new Date('2019-07-22'),
      },
    });

    const mia = await tx.student.create({
      data: {
        parentId: bob.id,
        name: 'Mia Lee',
        dateOfBirth: new Date('2021-01-10'),
      },
    });

    const liam = await tx.student.create({
      data: {
        parentId: charlie.id,
        name: 'Liam Ng',
        dateOfBirth: new Date('2018-11-05'),
      },
    });

    // ── trial classes ──────────────────────────────────────────────────

    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    const HOUR = 60 * 60 * 1000;

    // Case 1: all seats available — interviewer can book freely
    const robotics = await createClassWithSeats(tx, {
      teacherId: teacher.id,
      title: 'Introduction to Robotics',
      slug: 'intro-robotics',
      description: 'Build and program simple robots. No experience needed.',
      startsAt: new Date(now.getTime() + 14 * DAY),
      endsAt: new Date(now.getTime() + 14 * DAY + 1.5 * HOUR),
      priceCents: 4500,
      location: 'Maker Lab, Block 71',
      ageMin: 6,
      ageMax: 12,
    });

    // Case 2: 3 confirmed, 1 seat left — shows almost-full class
    const art = await createClassWithSeats(tx, {
      teacherId: teacher.id,
      title: 'Creative Art Workshop',
      slug: 'creative-art',
      description: 'Explore painting, collage, and mixed media.',
      startsAt: new Date(now.getTime() + 21 * DAY),
      endsAt: new Date(now.getTime() + 21 * DAY + HOUR),
      priceCents: 3500,
      location: 'Art Studio, Haji Lane',
      ageMin: 5,
      ageMax: 10,
    });

    await confirmBooking(tx, art.id, sophie.id, art.priceCents);
    await confirmBooking(tx, art.id, ethan.id, art.priceCents);
    await confirmBooking(tx, art.id, liam.id, art.priceCents);

    // Case 3: duplicate booking demo — Mia already confirmed; booking her
    // again hits the partial unique index and returns the existing booking
    const music = await createClassWithSeats(tx, {
      teacherId: teacher.id,
      title: 'Music Fundamentals',
      slug: 'music-fundamentals',
      description: 'Rhythm, melody, and basic instruments for beginners.',
      startsAt: new Date(now.getTime() + 7 * DAY),
      endsAt: new Date(now.getTime() + 7 * DAY + HOUR),
      priceCents: 4000,
      location: 'Music Room, Esplanade',
      ageMin: 4,
      ageMax: 8,
    });

    await confirmBooking(tx, music.id, mia.id, music.priceCents);

    // Case 4: payment failure — Sophie's card was declined; booking stays
    // PENDING_PAYMENT and is resumable with a new payment attempt
    const science = await createClassWithSeats(tx, {
      teacherId: teacher.id,
      title: 'Science Explorers',
      slug: 'science-explorers',
      description: 'Hands-on experiments with everyday materials.',
      startsAt: new Date(now.getTime() + 10 * DAY),
      endsAt: new Date(now.getTime() + 10 * DAY + 1.5 * HOUR),
      priceCents: 5000,
      location: 'Science Centre Singapore',
      ageMin: 6,
      ageMax: 12,
    });

    const failedBooking = await tx.booking.create({
      data: {
        trialClassId: science.id,
        studentId: sophie.id,
        status: BookingStatus.PENDING_PAYMENT,
      },
    });

    await tx.paymentAttempt.create({
      data: {
        bookingId: failedBooking.id,
        providerRef: `stub_seed_failed_${failedBooking.id}`,
        amountCents: science.priceCents,
        status: PaymentStatus.FAILED,
        failureReason: 'card_declined',
      },
    });

    // ── summary ────────────────────────────────────────────────────────

    console.log('\n──── Seed complete ────\n');
    console.log('Credentials (all passwords below):');
    console.log(`  Admin:   ${admin.email} / ${process.env.SEED_ADMIN_PASSWORD ?? 'admin12345'}`);
    console.log(`  Teacher: rachel@example.com / teacher12345`);
    console.log(`  Parents: alice / bob / charlie @example.com / parent12345\n`);

    console.log('Students:');
    console.log(`  ${sophie.name} (child of ${alice.name})`);
    console.log(`  ${ethan.name}, ${mia.name} (children of ${bob.name})`);
    console.log(`  ${liam.name} (child of ${charlie.name})\n`);

    console.log('Edge cases for demo:');
    console.log(`  1. "${robotics.title}" — ${SEATS} seats available, 0 bookings`);
    console.log(`  2. "${art.title}" — 3 confirmed, 1 seat left`);
    console.log(`  3. "${music.title}" — ${mia.name} confirmed; booking her again returns existing`);
    console.log(`  4. "${science.title}" — ${sophie.name}'s payment failed (card_declined); booking is resumable`);
    console.log('');
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
