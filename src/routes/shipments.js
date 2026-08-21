import express from 'express';
import { pool } from '../db.js';
import { generateTrackingCode } from '../services/tracking.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { sendShipmentUpdateEmail } from '../services/email.js';
import { ah } from '../utils/asyncHandler.js';

const router = express.Router();

// Admin: convert a quoted inquiry into a shipment with a tracking code.
// Requiring status='quoted' (not just "has a cost") also prevents a double
// click / race from creating two shipments off the same inquiry — once
// converted, status flips to 'converted' and a second attempt is rejected.
router.post('/from-inquiry', authMiddleware, adminOnly, ah(async (req, res) => {
  const { inquiry_id } = req.body;
  if (!inquiry_id) return res.status(400).json({ error: 'inquiry_id is required' });

  const iq = await pool.query('SELECT * FROM inquiries WHERE id=$1', [inquiry_id]);
  if (!iq.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
  if (iq.rows[0].status !== 'quoted') {
    return res.status(400).json({ error: `Inquiry must be in 'quoted' status to convert (currently: ${iq.rows[0].status})` });
  }

  const code = generateTrackingCode();
  const s = await pool.query(
    `INSERT INTO shipments (tracking_code, user_id, inquiry_id, cargo_description, origin_country, destination_country, cost_usd, status, current_location)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'code_generated',$8) RETURNING *`,
    [code, iq.rows[0].user_id, inquiry_id, iq.rows[0].cargo_description, iq.rows[0].origin_country,
     iq.rows[0].destination_country, iq.rows[0].quote_cost_usd, iq.rows[0].origin_country]
  );
  await pool.query(`UPDATE inquiries SET status='converted' WHERE id=$1`, [inquiry_id]);
  res.status(201).json(s.rows[0]);
}));

// Public tracking — anyone with the code can track (this is the whole point of a tracking code)
router.get('/track/:code', ah(async (req, res) => {
  const r = await pool.query('SELECT * FROM shipments WHERE tracking_code=$1', [req.params.code]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Tracking code not found' });
  const events = await pool.query('SELECT * FROM tracking_events WHERE shipment_id=$1 ORDER BY created_at ASC', [r.rows[0].id]);
  res.json({ shipment: r.rows[0], events: events.rows });
}));

// Admin: add a tracking / location update event
router.post('/update-location', authMiddleware, adminOnly, ah(async (req, res) => {
  const { tracking_code, warehouse_name, city, country, status, location_type, lat, lng } = req.body;
  if (!tracking_code || !status) return res.status(400).json({ error: 'tracking_code and status are required' });

  const s = await pool.query(
    `SELECT shipments.*, users.email AS customer_email, users.name AS customer_name
     FROM shipments JOIN users ON users.id = shipments.user_id WHERE tracking_code=$1`,
    [tracking_code]
  );
  if (!s.rows[0]) return res.status(404).json({ error: 'Shipment not found' });

  await pool.query(
    `INSERT INTO tracking_events (shipment_id, warehouse_name, city, country, status, location_type, lat, lng)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [s.rows[0].id, warehouse_name || null, city || null, country || null, status, location_type || 'hub', lat || null, lng || null]
  );
  const newLocation = city && country ? `${city}, ${country}` : s.rows[0].current_location;
  await pool.query(
    'UPDATE shipments SET current_location=$1, status=$2 WHERE id=$3',
    [newLocation, status, s.rows[0].id]
  );

  sendShipmentUpdateEmail(
    { email: s.rows[0].customer_email, name: s.rows[0].customer_name },
    s.rows[0], status, newLocation
  ).catch(()=>{});

  res.json({ ok: true });
}));

// Customer: my shipments
router.get('/mine', authMiddleware, ah(async (req, res) => {
  const r = await pool.query('SELECT * FROM shipments WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(r.rows);
}));

// Admin: all shipments
router.get('/', authMiddleware, adminOnly, ah(async (req, res) => {
  const r = await pool.query(
    `SELECT shipments.*, users.email AS customer_email, users.name AS customer_name
     FROM shipments JOIN users ON users.id = shipments.user_id
     ORDER BY shipments.created_at DESC`
  );
  res.json(r.rows);
}));

export default router;
