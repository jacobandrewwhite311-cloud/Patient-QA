/**
 * Applies schema.sql via Node (no psql required).
 * Usage: DATABASE_URL=postgresql://carebrain:carebrain@127.0.0.1:5432/carebrain node database/run-schema.js
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://carebrain:carebrain@127.0.0.1:5432/carebrain';

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log('Schema applied successfully.');
}

main().catch((err) => {
  console.error('Schema failed:', err.message);
  process.exit(1);
});
