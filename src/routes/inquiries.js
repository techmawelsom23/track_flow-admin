import express from 'express';
import { pool } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { sendNewInquiryEmail, sendQuoteEmail } from '../services/email.js';
import { ah } from '../utils/asyncHandler.js';

const router = express.Router();

// Customer creates an inquiry
router.post('/', authMiddleware, ah(async (req, res) => {
  const {
    cargo_description, weight_kg,
    origin_hub_code, origin_city, origin_country,
    destination_hub_code, destination_city, destination_country
  } = req.body;

  if (!cargo_description || !origin_country || !destination_country) {
    return res.status(400).json({ error: 'cargo_description, origin_country and destination_country are required' });
  }
  if (weight_kg !== undefined && weight_kg !== null && weight_kg !== '' && isNaN(Number(weight_kg))) {
    return res.status(400).json({ error: 'weight_kg must be a number' });
  }

  const r = await pool.query(
    `INSERT INTO inquiries
      (user_id, cargo_description, weight_kg, origin_hub_code, origin_city, origin_country, destination_hub_code, destination_city, destination_country)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.user.id, cargo_description, weight_kg || null, origin_hub_code || null, origin_city || null, origin_country,
     destination_hub_code || null, destination_city || null, destination_country]
  );

  sendNewInquiryEmail(r.rows[0], { email: req.user.email, name: req.user.name || req.user.email }).catch(()=>{});

  res.status(201).json(r.rows[0]);
}));

// Customer: view own inquiries
router.get('/mine', authMiddleware, ah(async (req, res) => {
  const r = await pool.query('SELECT * FROM inquiries WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(r.rows);
}));

// Admin: view all inquiries
router.get('/', authMiddleware, adminOnly, ah(async (req, res) => {
  const r = await pool.query(
    `SELECT inquiries.*, users.email AS customer_email, users.name AS customer_name, users.phone AS customer_phone
     FROM inquiries JOIN users ON users.id = inquiries.user_id
     ORDER BY inquiries.created_at DESC`
  );
  res.json(r.rows);
}));

// Admin: set a quote on an inquiry (allowed while pending or already quoted — re-quoting is fine;
// blocked once it's been converted to a shipment or declined, since re-quoting those is meaningless)
router.patch('/:id/quote', authMiddleware, adminOnly, ah(async (req, res) => {
  const { quote_cost_usd, quote_note } = req.body;
  if (!quote_cost_usd || isNaN(Number(quote_cost_usd)) || Number(quote_cost_usd) <= 0) {
    return res.status(400).json({ error: 'quote_cost_usd must be a positive number' });
  }

  const existing = await pool.query('SELECT status FROM inquiries WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
  if (['converted', 'declined'].includes(existing.rows[0].status)) {
    return res.status(400).json({ error: `Cannot quote an inquiry that is already ${existing.rows[0].status}` });
  }

  const r = await pool.query(
    `UPDATE inquiries SET quote_cost_usd=$1, quote_note=$2, status='quoted' WHERE id=$3 RETURNING *`,
    [quote_cost_usd, quote_note || null, req.params.id]
  );

  const customer = await pool.query('SELECT email, name FROM users WHERE id=$1', [r.rows[0].user_id]);
  if (customer.rows[0]) sendQuoteEmail(customer.rows[0], r.rows[0]).catch(()=>{});

  res.json(r.rows[0]);
}));

// Admin: decline an inquiry (only while still pending or quoted — can't decline one that's already a shipment)
router.patch('/:id/decline', authMiddleware, adminOnly, ah(async (req, res) => {
  const existing = await pool.query('SELECT status FROM inquiries WHERE id=$1', [req.params.id]);
  if (!existing.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
  if (existing.rows[0].status === 'converted') {
    return res.status(400).json({ error: 'Cannot decline an inquiry that already became a shipment' });
  }
  const r = await pool.query(`UPDATE inquiries SET status='declined' WHERE id=$1 RETURNING *`, [req.params.id]);
  res.json(r.rows[0]);
}));

export default router;
