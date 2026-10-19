import { ShippingWorker } from './shipping-worker.js';

const worker = new ShippingWorker();

console.log('[shipping-worker-process] Starting shipping worker process...');
worker.start().catch((err) => {
  console.error('[shipping-worker-process] Fatal startup error:', err);
  process.exit(1);
});

const gracefulShutdown = async () => {
  console.log('[shipping-worker-process] Shutting down worker...');
  await worker.stop();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
