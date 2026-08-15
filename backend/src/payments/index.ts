import type { PaymentProvider } from './provider';
import { StubPaymentProvider } from './stub';

let instance: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (instance) return instance;

  const provider = process.env.PAYMENT_PROVIDER ?? 'stub';

  switch (provider) {
    case 'stub':
      instance = new StubPaymentProvider(
        process.env.PAYMENT_STUB_URL ?? 'http://payments-stub:4001',
        process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-webhook-secret',
      );
      break;
    default:
      throw new Error(`Unknown payment provider: ${provider}`);
  }

  return instance;
}
