import { processRefunds } from './services/refund.js';
import { getPaymentProvider } from './payments/index.js';

const POLL_INTERVAL = Number(process.env.REFUND_POLL_INTERVAL_MS ?? 5000);

async function loop() {
  const provider = getPaymentProvider();

  console.log(
    `[worker] refund loop started, polling every ${POLL_INTERVAL}ms`,
  );

  while (true) {
    try {
      const count = await processRefunds(provider);
      if (count > 0) {
        console.log(`[worker] processed ${count} refund(s)`);
      }
    } catch (err) {
      console.error('[worker] refund loop error:', err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

loop();
