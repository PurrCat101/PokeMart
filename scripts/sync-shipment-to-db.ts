#!/usr/bin/env node

import mysql from 'mysql2/promise';

const SHIPPING_MOCK_URL = process.env.SHIPPING_MOCK_URL || 'http://localhost:3002';

const DELIVERY_STATUSES = [
  'LABEL_CREATED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
] as const;

type DeliveryStatus = typeof DELIVERY_STATUSES[number];

async function main() {
  const args = process.argv.slice(2);
  const purchaseId = args[0];
  const statusArg = args[1];

  if (!purchaseId) {
    console.error('Usage: npm run sync-shipment <purchaseId> <status-index>');
    console.error('Status: 1=LABEL_CREATED, 2=IN_TRANSIT, 3=OUT_FOR_DELIVERY, 4=DELIVERED, 5=DELIVERY_FAILED');
    process.exit(1);
  }

  const index = parseInt(statusArg, 10) - 1;
  if (isNaN(index) || index < 0 || index >= DELIVERY_STATUSES.length) {
    console.error('Invalid status index. Use 1-5');
    process.exit(1);
  }

  const newStatus = DELIVERY_STATUSES[index];

  try {
    // 1. Update in shipping-mock
    console.log(`Updating shipping-mock to ${newStatus}...`);
    const mockResponse = await fetch(
      `${SHIPPING_MOCK_URL}/v1/admin/shipments/by-purchase-id/${purchaseId}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      }
    );

    if (!mockResponse.ok) {
      const error = await mockResponse.json();
      console.error(`❌ Failed to update shipping-mock: ${error.error}`);
      process.exit(1);
    }

    const mockData = await mockResponse.json();
    console.log(`✅ Shipping-mock updated: ${mockData.providerShipmentId}`);

    // 2. Update database directly
    console.log('Updating database...');
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || 'pokemart_user',
      password: process.env.MYSQL_PASSWORD || 'change_me_for_local_development',
      database: process.env.MYSQL_DATABASE || 'pokemart_lab',
    });

    await pool.query(
      `UPDATE shipments 
       SET delivery_status = ?, updated_at = NOW(3)
       WHERE purchase_id = ?`,
      [newStatus, purchaseId]
    );

    console.log('✅ Database updated');
    console.log('\n🎉 Both shipping-mock and database synced successfully!');
    console.log(`   Order: ${purchaseId}`);
    console.log(`   Status: ${newStatus}`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
