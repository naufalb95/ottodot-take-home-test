export interface CheckoutResult {
  providerRef: string;
  checkoutUrl: string;
}

export interface PaymentProvider {
  createCheckout(params: {
    bookingId: string;
    amountCents: number;
    currency: string;
    returnUrl: string;
  }): Promise<CheckoutResult>;

  refund(providerRef: string): Promise<void>;

  verifyWebhookSignature(body: string, signature: string): boolean;
}
