// Stub payment provider. Reproduces the shape of a real gateway — redirect to a hosted
// page, then an out-of-band signed webhook — without needing a network.
//
// It deliberately makes the awkward cases easy to trigger: duplicate delivery, delayed
// delivery, and a payment that succeeds after the class has already filled. Those are the
// paths the booking design has to survive, and they are hard to provoke against a real
// sandbox.
//
// Runs on Node's native type stripping, so it needs no build step and no dependencies.

import http from 'node:http';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const PORT = Number(process.env.PORT ?? 4001);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret';
const WEBHOOK_TARGET_URL =
  process.env.WEBHOOK_TARGET_URL ?? 'http://web:3000/api/webhooks/payment';

type SessionStatus = 'INITIATED' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';

interface Session {
  ref: string;
  bookingId: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
  status: SessionStatus;
}

interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.failed';
  provider_ref: string;
  booking_id: string;
  amount_cents: number;
  currency: string;
  failure_reason?: string;
}

interface DeliveryOptions {
  delayMs?: number;
  times?: number;
}

const sessions = new Map<string, Session>();

const sign = (body: string): string =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

async function deliver(
  event: WebhookEvent,
  { delayMs = 0, times = 1 }: DeliveryOptions = {},
): Promise<void> {
  const body = JSON.stringify(event);
  const signature = sign(body);

  for (let i = 0; i < times; i++) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const res = await fetch(WEBHOOK_TARGET_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-stub-signature': signature },
        body,
      });
      console.log(`[stub] webhook ${event.type} ${event.provider_ref} -> ${res.status}`);
    } catch (err) {
      console.error(`[stub] webhook delivery failed: ${(err as Error).message}`);
    }
  }
}

const json = (res: ServerResponse, code: number, payload: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
};

const html = (res: ServerResponse, code: number, body: string): void => {
  res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
};

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c: Buffer) => {
      raw += c;
      if (raw.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function checkoutPage(session: Session): string {
  const amount = (session.amountCents / 100).toFixed(2);
  const btn = (outcome: string, label: string, hint: string): string => `
    <form method="POST" action="/checkout/${session.ref}/complete">
      <input type="hidden" name="outcome" value="${outcome}">
      <button type="submit">${label}</button>
      <span>${hint}</span>
    </form>`;

  return `<!doctype html><meta charset="utf-8">
<title>Stub checkout</title>
<style>
  body{font:15px/1.5 system-ui,sans-serif;max-width:34rem;margin:3rem auto;padding:0 1rem;color:#1a1f23}
  h1{font-size:1.2rem;margin:0 0 .25rem}
  dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;background:#f4f2ef;padding:1rem;border-radius:4px}
  dt{color:#6b7480}dd{margin:0;font-family:ui-monospace,monospace}
  form{display:flex;align-items:center;gap:.75rem;margin:.5rem 0}
  button{font:inherit;padding:.45rem .9rem;border:1px solid #1a1f23;background:#fff;border-radius:3px;cursor:pointer}
  button:hover{background:#1a1f23;color:#fff}
  span{color:#6b7480;font-size:.85rem}
  h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#6b7480;margin:2rem 0 .5rem}
</style>
<h1>Stub checkout</h1>
<p>No money moves. Pick an outcome to drive the webhook.</p>
<dl>
  <dt>Booking</dt><dd>${session.bookingId}</dd>
  <dt>Reference</dt><dd>${session.ref}</dd>
  <dt>Amount</dt><dd>${session.currency} ${amount}</dd>
</dl>
<h2>Normal</h2>
${btn('success', 'Pay', 'one webhook, immediately')}
${btn('failure', 'Decline', 'payment fails; booking stays resumable')}
<h2>Awkward</h2>
${btn('duplicate', 'Pay, delivered twice', 'tests webhook idempotency')}
${btn('delayed', 'Pay, delivered late', '8s delay — fill the class meanwhile')}`;
}

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    if (path === '/health') return json(res, 200, { ok: true, sessions: sessions.size });

    // Create a checkout session.
    if (req.method === 'POST' && path === '/checkout') {
      const body = await readBody(req);
      const bookingId = body.bookingId as string | undefined;
      const amountCents = body.amountCents as number | undefined;
      const currency = (body.currency as string | undefined) ?? 'SGD';
      const returnUrl = (body.returnUrl as string | undefined) ?? '';

      if (!bookingId || !Number.isInteger(amountCents)) {
        return json(res, 400, { error: 'bookingId and integer amountCents are required' });
      }

      const ref = `stub_${crypto.randomUUID()}`;
      sessions.set(ref, {
        ref,
        bookingId,
        amountCents: amountCents as number,
        currency,
        returnUrl,
        status: 'INITIATED',
      });

      const base = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
      return json(res, 201, { providerRef: ref, checkoutUrl: `${base}/checkout/${ref}` });
    }

    // Hosted payment page.
    const view = path.match(/^\/checkout\/([^/]+)$/);
    if (req.method === 'GET' && view) {
      const session = sessions.get(view[1]);
      if (!session) return html(res, 404, '<p>Unknown checkout session.</p>');
      return html(res, 200, checkoutPage(session));
    }

    // Parent picks an outcome.
    const complete = path.match(/^\/checkout\/([^/]+)\/complete$/);
    if (req.method === 'POST' && complete) {
      const session = sessions.get(complete[1]);
      if (!session) return html(res, 404, '<p>Unknown checkout session.</p>');

      let raw = '';
      for await (const chunk of req) raw += chunk;
      const outcome = new URLSearchParams(raw).get('outcome') ?? 'success';

      const failed = outcome === 'failure';
      const event: WebhookEvent = {
        type: failed ? 'payment.failed' : 'payment.succeeded',
        provider_ref: session.ref,
        booking_id: session.bookingId,
        amount_cents: session.amountCents,
        currency: session.currency,
        ...(failed ? { failure_reason: 'card_declined' } : {}),
      };

      session.status = failed ? 'FAILED' : 'SUCCEEDED';

      const opts: DeliveryOptions =
        outcome === 'duplicate' ? { times: 2 } : outcome === 'delayed' ? { delayMs: 8000 } : {};

      // Fire and forget — a real gateway does not hold the redirect open for the webhook.
      void deliver(event, opts);

      if (session.returnUrl) {
        res.writeHead(302, { location: session.returnUrl });
        return res.end();
      }
      return html(res, 200, `<p>Sent <code>${event.type}</code>. You can close this tab.</p>`);
    }

    // Refund, called by the worker.
    if (req.method === 'POST' && path === '/refund') {
      const body = await readBody(req);
      const providerRef = body.providerRef as string | undefined;
      const session = providerRef ? sessions.get(providerRef) : undefined;

      if (!session) return json(res, 404, { error: 'unknown providerRef' });
      if (session.status !== 'SUCCEEDED') {
        return json(res, 409, { error: `cannot refund a ${session.status} payment` });
      }

      session.status = 'REFUNDED';
      console.log(`[stub] refunded ${providerRef}`);
      return json(res, 200, { providerRef, status: 'REFUNDED' });
    }

    return json(res, 404, { error: 'not found' });
  } catch (err) {
    return json(res, 400, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`[stub] listening on :${PORT}`);
  console.log(`[stub] webhooks -> ${WEBHOOK_TARGET_URL}`);
});
