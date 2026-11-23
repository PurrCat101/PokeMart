#!/usr/bin/env node

// Local development helper: set the delivery status of an order (Pokémon or item) right now,
// in both the shipping mock and the database, without waiting for the shipping worker to sync.

import mysql from 'mysql2/promise';

const SHIPPING_MOCK_URL = process.env.SHIPPING_MOCK_URL || 'http://localhost:4002';

const DELIVERY_STATUSES = [
  'LABEL_CREATED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
] as const;

type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

// Mirrors validTransitions in apps/shipping-mock/src/index.ts
const NEXT_STATUSES: Record<DeliveryStatus, DeliveryStatus[]> = {
  LABEL_CREATED: ['IN_TRANSIT'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERY_FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_FAILED'],
  DELIVERED: [],
  DELIVERY_FAILED: [],
};

// Shortest forward path from `from` to `to` (excluding `from`), or null if unreachable.
function findPath(from: DeliveryStatus, to: DeliveryStatus): DeliveryStatus[] | null {
  const queue: DeliveryStatus[][] = [[from]];
  const seen = new Set<DeliveryStatus>([from]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (last === to) return path.slice(1);
    for (const next of NEXT_STATUSES[last]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return null;
}

type MockResult = { ok: boolean; status: number; error?: string; providerShipmentId?: string };

async function postMockStatus(purchaseId: string, status: DeliveryStatus): Promise<MockResult> {
  const response = await fetch(`${SHIPPING_MOCK_URL}/v1/admin/shipments/by-purchase-id/${purchaseId}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; providerShipmentId?: string };
  return { ok: response.ok, status: response.status, error: body.error, providerShipmentId: body.providerShipmentId };
}

function usage(): never {
  console.error('Usage: npm run update-shipment-status -- <purchaseId> <status>');
  console.error('Status: 1=LABEL_CREATED, 2=IN_TRANSIT, 3=OUT_FOR_DELIVERY, 4=DELIVERED, 5=DELIVERY_FAILED');
  process.exit(1);
}

async function main() {
  const [purchaseId, statusArg] = process.argv.slice(2);
  if (!purchaseId) usage();

  const index = parseInt(statusArg, 10) - 1;
  if (isNaN(index) || index < 0 || index >= DELIVERY_STATUSES.length) {
    console.error('Invalid status. Use 1-5');
    usage();
  }
  const newStatus = DELIVERY_STATUSES[index];

  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 4306),
    user: process.env.MYSQL_USER || 'pokemart_user',
    password: process.env.MYSQL_PASSWORD || 'change_me_for_local_development',
    database: process.env.MYSQL_DATABASE || 'pokemart_lab',
  });

  try {
    // 1. Shipping mock (the provider's view of the shipment)
    console.log(`Updating shipping-mock to ${newStatus}...`);
    let mockResult = await postMockStatus(purchaseId, newStatus);

    // Out-of-order request: read the current status from the error and walk the steps in order
    const transition = mockResult.error?.match(/Invalid status transition from (\w+) to (\w+)/);
    if (!mockResult.ok && mockResult.status === 400 && transition) {
      const current = transition[1] as DeliveryStatus;
      const steps = findPath(current, newStatus);
      if (!steps) {
        console.error(`❌ Cannot move from ${current} to ${newStatus} (no valid forward path)`);
        process.exit(1);
      }
      console.log(`Current status is ${current}, stepping in order: ${steps.join(' -> ')}`);
      for (const step of steps) {
        console.log(`  -> ${step}`);
        mockResult = await postMockStatus(purchaseId, step);
        if (!mockResult.ok) break;
      }
    }

    if (!mockResult.ok) {
      console.error(`❌ Failed to update shipping-mock: ${mockResult.error ?? mockResult.status}`);
      process.exit(1);
    }
    console.log(`✅ Shipping-mock updated: ${mockResult.providerShipmentId}`);

    // 2. Database: one shipments table holds Pokémon and item orders alike
    console.log('Updating database...');
    const [result] = await pool.query<mysql.ResultSetHeader>(
      'UPDATE shipments SET delivery_status = ?, updated_at = NOW(3) WHERE purchase_id = ?',
      [newStatus, purchaseId],
    );
    if (result.affectedRows === 0) {
      console.error(`❌ No shipment found in the database for ${purchaseId}`);
      process.exit(1);
    }

    console.log('✅ Database updated');
    console.log(`\n🎉 Order ${purchaseId} is now ${newStatus}`);
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
