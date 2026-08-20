import pkg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

// Creates all tables (idempotent) and seeds the admin account from env vars.
// Call once at server startup instead of lazily inside each route.
export async function initDb() {
  if (process.env.RESET_DB === 'true') {
    console.warn('[initDb] RESET_DB=true — dropping existing tables before recreating them.');
    await pool.query(`
      DROP TABLE IF EXISTS payment_otps, payment_proofs, tracking_events, shipments, inquiries, users CASCADE
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      cargo_description TEXT NOT NULL,
      weight_kg NUMERIC,
      origin_hub_code TEXT,
      origin_city TEXT,
      origin_country TEXT NOT NULL,
      destination_hub_code TEXT,
      destination_city TEXT,
      destination_country TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', -- pending | quoted | converted | declined
      quote_cost_usd NUMERIC,
      quote_note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipments (
      id SERIAL PRIMARY KEY,
      tracking_code TEXT UNIQUE NOT NULL,
      user_id INT REFERENCES users(id) ON DELETE CASCADE,
      inquiry_id INT REFERENCES inquiries(id) ON DELETE SET NULL,
      cargo_description TEXT,
      origin_country TEXT,
      destination_country TEXT,
      cost_usd NUMERIC,
      status TEXT NOT NULL DEFAULT 'code_generated',
      current_location TEXT,
      payment_status TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | pending_confirmation | paid
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tracking_events (
      id SERIAL PRIMARY KEY,
      shipment_id INT REFERENCES shipments(id) ON DELETE CASCADE,
      warehouse_name TEXT,
      city TEXT,
      country TEXT,
      status TEXT,
      location_type TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_proofs (
      id SERIAL PRIMARY KEY,
      shipment_id INT REFERENCES shipments(id) ON DELETE CASCADE,
      tx_hash TEXT,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_otps (
      id SERIAL PRIMARY KEY,
      shipment_id INT REFERENCES shipments(id) ON DELETE CASCADE,
      otp_code TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await seedAdmin();
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn('[seedAdmin] ADMIN_EMAIL / ADMIN_PASSWORD not set in env — no admin account will exist. Set them in Render and redeploy.');
    return;
  }

  const existing = await pool.query('SELECT id, role FROM users WHERE email=$1', [email]);

  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1,$2,$3,$4)',
      [email, hash, 'Admin', 'admin']
    );
    console.log(`[seedAdmin] Created admin account for ${email}`);
  } else if (existing.rows[0].role !== 'admin') {
    await pool.query('UPDATE users SET role=$1 WHERE email=$2', ['admin', email]);
    console.log(`[seedAdmin] Promoted existing account ${email} to admin`);
  } else {
    console.log(`[seedAdmin] Admin account already present for ${email}`);
  }
}
