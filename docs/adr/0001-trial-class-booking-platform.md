# ADR-0001: Trial Class Booking Platform

- **Status:** Accepted
- **Date:** 2026-08-14
- **Deciders:** Agnia Naufal Fridayana Budiman

Source of truth for **what** we are building and for whom. Anything that contradicts this
document should amend it or be recorded as a new ADR that supersedes the relevant section.

**Related documents**

| Document | Covers |
|----------|--------|
| [`docs/erd.md`](../erd.md) | Tables, columns, constraints, relationships |
| [`docs/architecture.md`](../architecture.md) | Containers, layering, concurrency mechanisms, security, testing |

**Revision history**

| Rev | Change |
|-----|--------|
| 1 | Initial draft: free trials, seat reservation at booking time, waitlist |
| 2 | Trials are paid. Seats allocated at payment confirmation. Students promoted to first-class profiles. Waitlist and reservation holds removed. |
| 3 | Capacity enforced by a unique seat-number index rather than a row lock. |
| 4 | Capacity enforced by materialised `seats` rows claimed with `SKIP LOCKED`. Third role `TEACHER` with class ownership. Booking statuses reduced to three. Reconciliation job dropped. |
| 5 | Split into three documents. Data model moved to `erd.md`; mechanisms, security, and testing moved to `architecture.md`. |

---

## 1. Context

An enrichment-class business offers trial classes that parents book for their children. Each
trial is a single dated session seating **4 students**, and carries a fee that must be paid
for the booking to count.

Today this runs on WhatsApp, a spreadsheet, and manual bank transfers. Two failure modes
dominate:

1. **Overbooking.** Two staff confirm the same last seat because the spreadsheet has no
   locking. The parent finds out on arrival.
2. **Payment reconciliation.** Matching transfers to bookings is manual, and a parent who paid
   for a class that filled up has to chase a refund.

We are building a web application that replaces this flow, scoped as an MVP: prove a correct
booking-and-payment loop rather than a broad feature surface, and run end-to-end on a laptop
with one command.

### Forces

- **Correctness where money meets capacity.** Four seats and a real payment means a bug is both
  customer-visible and financial. This is where design effort goes.
- **Reviewability.** The codebase will be read before it is run. Conventional tooling wins.
- **Offline by default.** Everything boots via Docker Compose with no network. This rules out
  hosted auth, hosted email, and a real payment gateway at run time.
- **Deliberately small.** Anything not required to prove the loop is out of scope.

---

## 2. Scope

### In scope

- Public catalogue of upcoming trial classes with live seat availability.
- Parent accounts, and student profiles owned by a parent.
- Booking a trial class for one student, gated on payment.
- Seat allocation at payment confirmation, capped by available seats, never exceeded.
- Automatic refund whenever a payment succeeds but no seat can be given.
- Parent's booking list, with cancellation and refund.
- Teacher accounts that create and manage their own classes and view their own rosters.
- Admin oversight across all classes, plus payment and refund visibility.

### Out of scope

- Email, SMS, or push notifications.
- **Waitlists.** A waitlist needs both a reservation hold and a way to notify the promoted
  parent. Neither exists, so a waitlist row would be inert.
- **Seat reservation holds.** Nothing is reserved before payment; see `architecture.md`.
- **Multi-child carts.** One booking covers exactly one student. A parent with three children
  runs the flow three times, producing three independent bookings that succeed or fail on their
  own. This keeps the chain one-to-one: **one booking = one payment = one seat**, with no split
  payments and no partial refunds.
- A real payment gateway. A stubbed provider stands in.
- Recurring sessions, term enrolment, and trial-to-paid conversion.
- Multi-tenancy, internationalisation, mobile apps.
- Class categories and category filtering.
- A user holding more than one role. A teacher who is also a parent needs two accounts.

### The accepted risk

**A parent can pay and not get a seat.** Nothing is reserved during checkout, so a class can
fill while a parent is paying. This is deliberate — the alternative is holding seats during
checkout, which at four seats means one abandoned payment blocks a quarter of the class.

Three things bound it: the UI states before checkout that the seat is not reserved until
payment completes; a pre-check refuses to start checkout on a full class; and losers are
refunded automatically with no admin in the loop. Processor fees on a refunded payment are
typically not returned, so every lost race carries a small real cost.

---

## 3. Personas and journeys

### Parent

Primary user. Motivated, low patience, likely on a phone, often browsing outside business
hours. Has no account on arrival.

**Primary journey — book a trial**

1. Lands on the catalogue and sees upcoming classes with seats remaining.
2. Opens a class and selects "Book trial".
3. Signs up or signs in. Booking intent survives the auth step.
4. Picks an existing student profile or adds one (name, date of birth).
5. Reviews the fee, and an explicit warning that **the seat is not reserved until payment
   completes**.
6. Completes checkout, returns to the app, and sees either **Confirmed** or **Class filled —
   refund issued**.

**Secondary journeys** — manage student profiles; review bookings with payment status; cancel
an upcoming booking and receive a refund.

### Teacher

Runs the classes. Creates their own sessions and needs to know who is turning up.

- Create a trial class, which materialises its seats.
- Edit or cancel **their own** classes.
- View the roster for their own classes: student names and the name of each student's parent.
  Nothing else — no contact details, no payment information.

### Admin

Operations staff. Desktop, business hours.

- Everything a teacher can do, across **all** classes.
- View parent contact details and all payment and refund records.
- Manage user accounts.
- Retry refunds that failed permanently.

---

## 4. Feature set

| # | Feature | Actor | Notes |
|---|---------|-------|-------|
| F1 | Browse upcoming trial classes | Public | Shows seats remaining |
| F2 | View class detail | Public | Fee, schedule, teacher, location |
| F3 | Register / sign in | Parent | Email and password |
| F4 | Manage student profiles | Parent | Name, date of birth, notes |
| F5 | Start a booking | Parent | One student; reserves nothing; availability check is advisory |
| F6 | Pay for a booking | Parent | Stubbed provider |
| F7 | Seat allocation on payment | System | Capacity never exceeded |
| F8 | Automatic refund when no seat | System | Worker-driven |
| F9 | View my bookings | Parent | With payment and refund state |
| F10 | Cancel a booking and be refunded | Parent | Any time before `starts_at`, full refund |
| F11 | Create a trial class | Teacher, Admin | Class and its seat rows in one transaction |
| F12 | Edit or cancel a class | Teacher (own), Admin (any) | Cancelling refunds every confirmed booking |
| F13 | View roster | Teacher (own), Admin (any) | Teacher sees student and parent names only |
| F14 | View payments and refunds | Admin | Including failed refunds with manual retry |

### Policies

- **Cancellation.** Full refund at any point before `starts_at`. No cutoff, no partial refunds.
  Cancellation after the class starts is refused.
- **Duplicate bookings.** One live booking per student per class. A parent with several children
  may book all of them into the same class, up to and including filling it.
- **Age ranges.** `age_min` and `age_max` are advisory. A student outside the range produces a
  warning, not a block — a parent may know better than the guideline.
- **Timezones.** One business, one locale. All times display in `APP_TIMEZONE`
  (default `Asia/Singapore`).

---

## 5. Non-functional expectations

- Catalogue and class-detail pages render server-side in under 300 ms at seed volumes.
- Webhook confirmation completes in under 200 ms.
- At least 50 concurrent confirmations against one 4-seat class allocate exactly 4 seats, with
  no retries. This is an automated test, not an aspiration.
- Refunds are attempted within 30 seconds of being queued, and retried with backoff.
- Usable at 375 px width; the parent journey is designed mobile-first.
- Interactive elements are keyboard reachable and labelled; validation errors appear in text,
  not colour alone.
- The whole system starts with a single `docker compose up`, offline, with seeded demo data.
