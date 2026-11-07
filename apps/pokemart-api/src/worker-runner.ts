import { ShippingWorker } from './shipping-worker.js';
import { PaymentRecoveryWorker } from './payment-recovery-worker.js';
import { startMetricsServer } from './worker-metrics.js';
import { installLogShipper } from './log-shipper.js';

installLogShipper('shipping-worker');

const worker = new ShippingWorker();
const paymentWorker = new PaymentRecoveryWorker();
const metricsServer = startMetricsServer(worker);

console.log('[shipping-worker-process] Starting shipping worker process...');
worker.start().catch((err) => {
  console.error('[shipping-worker-process] Fatal startup error:', err);
  process.exit(1);
});
paymentWorker.start().catch((err) => {
  console.error('[payment-recovery-worker] Fatal startup error:', err);
  process.exit(1);
});

const gracefulShutdown = async () => {
  console.log('[shipping-worker-process] Shutting down worker...');
  await worker.stop();
  await paymentWorker.stop();
  metricsServer.close();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
