import crypto from 'node:crypto';
import type { PaymentProvider, CheckoutResult } from './provider';

export class StubPaymentProvider implements PaymentProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly webhookSecret: string,
  ) {}

  async createCheckout(params: {
    bookingId: string;
    amountCents: number;
    currency: string;
    returnUrl: string;
  }): Promise<CheckoutResult> {
    const res = await fetch(`${this.baseUrl}/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bookingId: params.bookingId,
        amountCents: params.amountCents,
        currency: params.currency,
        returnUrl: params.returnUrl,
      }),
    });

    if (!res.ok) {
      throw new Error(`Stub checkout failed: ${res.status}`);
    }

    const data = (await res.json()) as { providerRef: string; checkoutUrl: string };
    return { providerRef: data.providerRef, checkoutUrl: data.checkoutUrl };
  }

  async refund(providerRef: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providerRef }),
    });

    if (!res.ok && res.status !== 409) {
      throw new Error(`Stub refund failed: ${res.status}`);
    }
  }

  verifyWebhookSignature(body: string, signature: string): boolean {
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
}
