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
    const mockResponse = await fetch(`${SHIPPING_MOCK_URL}/v1/admin/shipments/by-purchase-id/${purchaseId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!mockResponse.ok) {
      const error = (await mockResponse.json().catch(() => ({}))) as { error?: string };
      console.error(`❌ Failed to update shipping-mock: ${error.error ?? mockResponse.status}`);
      process.exit(1);
    }
    const mockData = (await mockResponse.json()) as { providerShipmentId: string };
    console.log(`✅ Shipping-mock updated: ${mockData.providerShipmentId}`);

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
