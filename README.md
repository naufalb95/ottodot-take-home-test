# Trial Class Booking System

A trial booking platform where parents book and pay for trial classes for their children. Classes are capped at 4 students. The system handles payment, duplicate prevention, overbooking, and last-seat race conditions at the database level.

## How to run

Prerequisites: Docker, Node.js 22+.

```bash
# 1. Start everything (Postgres, payments stub, API, worker, migrations, seed)
cp .env.example .env
docker compose --profile app up --build

# 2. Run the CLI demo (auto-reseeds, idempotent)
node --experimental-strip-types scripts/demo.ts

# 3. Run the test suite (26 tests, including a 50-concurrent-payment stress test)
cd backend && npx vitest run

# 4. (Optional) Start the dashboard on a separate port
cd dashboard && npm install && PORT=3001 npm run dev
```

The demo script walks through all 6 scenarios end-to-end against the running API. No manual steps required.

### Seed credentials

| Role    | Email               | Password    |
|---------|---------------------|-------------|
| Admin   | admin@example.com   | admin12345  |
| Teacher | rachel@example.com  | teacher12345|
| Parent  | alice@example.com   | parent12345 |
| Parent  | bob@example.com     | parent12345 |
| Parent  | charlie@example.com | parent12345 |

### Seed edge cases

| Class                  | State                                                  |
|------------------------|--------------------------------------------------------|
| Introduction to Robotics | 4 seats free, 0 bookings                            |
| Creative Art Workshop  | 3 confirmed (Sophie, Ethan, Liam), 1 seat left         |
| Music Fundamentals     | Mia confirmed; re-booking returns existing (duplicate)  |
| Science Explorers      | Sophie's payment failed (card_declined); booking resumable |

## What I built

A split-architecture system: Fastify API + background worker on the backend, Next.js dashboard for the frontend.

```
backend/
  src/
    routes/         7 route files (auth, classes, bookings, students, webhooks, admin, health)
    services/       allocation, booking, webhook, class, student, refund
    payments/       PaymentProvider interface + stub adapter
    lib/            db client, auth (signed cookies), authz (role + ownership), errors
  prisma/           schema, migration, seed
  src/__tests__/    6 test files, 26 tests

dashboard/          Next.js App Router, 14 pages (catalogue, booking, roster, admin)
docker/             payments-stub (zero-dependency webhook simulator)
scripts/            demo.ts (CLI walkthrough of all scenarios)
```

### Services (5 containers)

| Service        | Purpose                                          |
|----------------|--------------------------------------------------|
| `db`           | PostgreSQL 16                                    |
| `payments-stub`| Mock payment gateway with webhook delivery       |
| `migrate`      | One-shot: applies migrations + seeds, then exits |
| `web`          | Fastify API (port 3000)                          |
| `worker`       | Refund queue processor (polls every 5s)          |

## Backend design

### Data model

6 tables: `users`, `students`, `trial_classes`, `seats`, `bookings`, `payment_attempts`.

The key design choice is **materialised seats**: each class gets 4 physical `seat` rows on creation. A seat's `booking_id` column is `NULL` when free and points to a booking when claimed. This makes capacity a row count, not a counter, which means concurrent claims are serialised by row locks rather than racing on a shared integer.

```
trial_classes 1──* seats *──1 bookings *──1 students *──1 users (parent)
                                 │
                           payment_attempts
```

### Key API endpoints

| Method | Path                          | Role          | Purpose                    |
|--------|-------------------------------|---------------|----------------------------|
| GET    | `/api/classes`                | Public        | Catalogue with seat counts |
| GET    | `/api/classes/:slug`          | Public        | Class detail               |
| POST   | `/api/bookings`               | PARENT        | Create booking + checkout  |
| GET    | `/api/bookings`               | PARENT        | List my bookings           |
| POST   | `/api/bookings/:id/cancel`    | PARENT        | Cancel booking             |
| GET    | `/api/classes/:id/roster`     | TEACHER/ADMIN | Confirmed student list     |
| POST   | `/api/webhooks/payment`       | System        | Payment webhook receiver   |
| GET    | `/api/admin/payments`         | ADMIN         | All payment attempts       |

### Booking statuses

```
PENDING_PAYMENT ──→ CONFIRMED    (payment succeeded, seat claimed)
PENDING_PAYMENT ──→ CANCELLED    (payment succeeded but class full → auto-refund)
PENDING_PAYMENT ──→ CANCELLED    (parent cancelled before paying)
CONFIRMED       ──→ CANCELLED    (parent cancelled after paying → refund queued)
```

Payment attempt statuses: `INITIATED → SUCCEEDED | FAILED | REFUND_PENDING → REFUNDED | REFUND_FAILED`

### How duplicate bookings are prevented

**Check-before-insert in a transaction.** `createBooking` queries for an existing booking with the same `(trial_class_id, student_id)` where status is `PENDING_PAYMENT` or `CONFIRMED`. If found, it returns the existing booking. If not, it creates a new one.

A partial unique index (`one_live_booking_per_student`) on `(trial_class_id, student_id) WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED')` acts as a database-level safety net.

Why not catch the unique constraint violation (P2002)? Because Postgres aborts the entire transaction on a constraint violation. The subsequent `findFirst` inside the same transaction would fail with `25P02 (current transaction is aborted)`.

### How payment failure is handled

Booking stays in `PENDING_PAYMENT`. The payment attempt is marked `FAILED` with a `failure_reason`. The parent can retry by creating a new booking (which returns the existing `PENDING_PAYMENT` booking) and gets a fresh checkout URL.

The seat is never claimed on a failed payment, so the child never appears on the roster.

### How two users compete for the last seat (last-seat race)

**Pay-first model with `SELECT ... FOR UPDATE SKIP LOCKED`.**

No seats are reserved during checkout. Both users create bookings and proceed to payment independently. The seat is only claimed when the payment webhook arrives:

```sql
UPDATE seats SET booking_id = $1
WHERE id = (
  SELECT id FROM seats
  WHERE trial_class_id = $2 AND booking_id IS NULL
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING id
```

- `FOR UPDATE` locks the row, preventing two transactions from claiming the same seat.
- `SKIP LOCKED` means a concurrent transaction does not block — it moves to the next free row or returns empty.
- If no free seat is found, the booking is cancelled and the payment is queued for refund with reason `CLASS_FULL`.

The compare-and-swap on `payment_attempts` (`UPDATE ... WHERE provider_ref = $1 AND status = 'INITIATED' RETURNING booking_id`) ensures each webhook is processed exactly once, handling duplicate deliveries.

**Verified by test:** `concurrency.test.ts` fires 50 simultaneous payment webhooks against a 4-seat class and asserts exactly 4 end up confirmed.

### Where checks live

| Check                        | Layer      | Why there                                              |
|------------------------------|------------|--------------------------------------------------------|
| Seat capacity                | Database   | Row locks are the only correct serialisation point      |
| Duplicate booking            | Service + DB | Service check avoids transaction abort; index is safety net |
| Payment idempotency          | Database   | Compare-and-swap UPDATE on `provider_ref` + `status`   |
| Role/ownership authorisation | Backend    | Before any data access                                 |
| Input validation             | Backend    | Zod schemas on every route                             |
| Webhook signature            | Backend    | Constant-time HMAC verification before processing      |
| Refund processing            | Worker     | Background job with SKIP LOCKED to avoid double-processing |

## Testing

26 tests across 6 files, all running against a real PostgreSQL database (no mocks):

| File                   | What it tests                                          |
|------------------------|--------------------------------------------------------|
| `allocation.test.ts`   | Seat claim, exhaustion, release, unique constraint     |
| `booking.test.ts`      | Create, duplicate idempotency, rebook after cancel, cancellation rules |
| `webhook.test.ts`      | Confirm + seat, CLASS_FULL refund, idempotency, double payment, amount verification |
| `concurrency.test.ts`  | 8 and 50 simultaneous payments → exactly 4 confirmed   |
| `invariant.test.ts`    | CONFIRMED ↔ seat bijection, invariants after cancel cycle |
| `refund.test.ts`       | Process REFUND_PENDING, provider failure, skip already processed |

## Time spent

~4 hours across two sessions. Roughly:
- 30 min: ADR, ERD, architecture doc
- 1.5 hr: backend scaffold (schema, migrations, services, routes)
- 1 hr: test suite (26 tests including concurrency)
- 30 min: seed data, demo script, Docker setup
- 30 min: dashboard scaffold (14 pages, not the focus)

## Assumptions

- Trial booking only (no recurring enrolment, no waitlist)
- Exactly 4 seats per class, materialised on creation
- Single currency (SGD) per class
- Passwords hashed with bcrypt cost 12 (sufficient for a demo; production would use Argon2)
- Signed cookies for session auth (no JWT needed for a server-rendered app)
- Webhook signature verification is HMAC-SHA256 with constant-time comparison

## What I deliberately cut

- **Dashboard tests**: Backend correctness is where the risk lives. The dashboard is a thin API client.
- **Waitlist**: Out of scope per the brief. Could be added as a `WAITLISTED` booking status.
- **Email notifications**: Would be a background job triggered by status changes.
- **Rate limiting**: Production concern, not a correctness concern.
- **Pagination**: Unnecessary for a 4-class seed dataset.
- **Real payment provider**: The stub reproduces the hard cases (duplicate delivery, delayed webhook, failure) better than a sandbox.

## What I would monitor after release

- **Booking confirmation rate**: ratio of `CONFIRMED` to `PENDING_PAYMENT` bookings. A drop means payment or webhook issues.
- **Refund queue depth**: `REFUND_PENDING` count and age. Stale refunds mean the worker or provider is unhealthy.
- **Webhook processing latency**: time from `payment_attempts.created_at` to `updated_at` for `SUCCEEDED` status.
- **Seat utilisation**: confirmed seats / total seats per class. Classes consistently filling indicate demand.
- **Error rate on booking creation**: 409s (CLASS_FULL) vs 500s. High 409s during payment is expected; high 409s at booking creation means stale seat counts in the UI.

## What I would do next with more time

- **Optimistic UI for seat availability**: show a "seats may have changed" warning if the catalogue data is older than 30 seconds.
- **Webhook retry with exponential backoff**: currently the stub fires once; a real gateway retries.
- **Idempotency key on booking creation**: prevent double-submit from the frontend.
- **Booking expiry**: auto-cancel `PENDING_PAYMENT` bookings older than 15 minutes to free phantom-held seats.
- **Admin actions**: manually confirm/cancel bookings, create refunds, manage users.
- **Structured logging**: correlation IDs through the webhook → booking → refund chain.
- **Load testing**: verify the SKIP LOCKED approach holds under sustained concurrent load, not just burst.
