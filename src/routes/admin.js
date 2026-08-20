import express from 'express';
import { WORLD_WAREHOUSES } from '../services/tracking.js';
import { pool } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Public — the customer portal needs this list too, no need to gate it.
router.get('/warehouses', (req, res) => res.json(WORLD_WAREHOUSES));

// Admin dashboard summary
router.get('/stats', authMiddleware, adminOnly, async (req, res) => {
  const [inquiries, pendingInquiries, shipments, paid] = await Promise.all([
    pool.query('SELECT COUNT(*) FROM inquiries'),
    pool.query(`SELECT COUNT(*) FROM inquiries WHERE status='pending'`),
    pool.query('SELECT COUNT(*) FROM shipments'),
    pool.query(`SELECT COALESCE(SUM(cost_usd),0) AS total FROM shipments WHERE payment_status='paid'`)
  ]);
  res.json({
    totalInquiries: Number(inquiries.rows[0].count),
    pendingInquiries: Number(pendingInquiries.rows[0].count),
    totalShipments: Number(shipments.rows[0].count),
    totalPaidUSD: Number(paid.rows[0].total)
  });
});

export default router;
