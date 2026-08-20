import express from 'express';
import { pool } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { sendNewInquiryEmail, sendQuoteEmail } from '../services/email.js';

const router = express.Router();

// Customer creates an inquiry
router.post('/', authMiddleware, async (req, res) => {
  const {
    cargo_description, weight_kg,
    origin_hub_code, origin_city, origin_country,
    destination_hub_code, destination_city, destination_country
  } = req.body;

  if (!cargo_description || !origin_country || !destination_country) {
    return res.status(400).json({ error: 'cargo_description, origin_country and destination_country are required' });
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
});

// Customer: view own inquiries
router.get('/mine', authMiddleware, async (req, res) => {
  const r = await pool.query('SELECT * FROM inquiries WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(r.rows);
});

// Admin: view all inquiries
router.get('/', authMiddleware, adminOnly, async (req, res) => {
  const r = await pool.query(
    `SELECT inquiries.*, users.email AS customer_email, users.name AS customer_name, users.phone AS customer_phone
     FROM inquiries JOIN users ON users.id = inquiries.user_id
     ORDER BY inquiries.created_at DESC`
  );
  res.json(r.rows);
});

// Admin: set a quote on an inquiry
router.patch('/:id/quote', authMiddleware, adminOnly, async (req, res) => {
  const { quote_cost_usd, quote_note } = req.body;
  if (!quote_cost_usd || isNaN(Number(quote_cost_usd))) {
    return res.status(400).json({ error: 'quote_cost_usd (number) is required' });
  }
  const r = await pool.query(
    `UPDATE inquiries SET quote_cost_usd=$1, quote_note=$2, status='quoted' WHERE id=$3 RETURNING *`,
    [quote_cost_usd, quote_note || null, req.params.id]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });

  const customer = await pool.query('SELECT email, name FROM users WHERE id=$1', [r.rows[0].user_id]);
  if (customer.rows[0]) sendQuoteEmail(customer.rows[0], r.rows[0]).catch(()=>{});

  res.json(r.rows[0]);
});

// Admin: decline an inquiry
router.patch('/:id/decline', authMiddleware, adminOnly, async (req, res) => {
  const r = await pool.query(`UPDATE inquiries SET status='declined' WHERE id=$1 RETURNING *`, [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
  res.json(r.rows[0]);
});

export default router;
