import express from 'express';
import { WORLD_WAREHOUSES } from '../services/tracking.js';
import { pool } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { ah } from '../utils/asyncHandler.js';
import { verifyEmailConfig, sendTestEmail } from '../services/email.js';

const router = express.Router();

// Public — the customer portal needs this list too, no need to gate it.
router.get('/warehouses', (req, res) => res.json(WORLD_WAREHOUSES));

// Admin dashboard summary
router.get('/stats', authMiddleware, adminOnly, ah(async (req, res) => {
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
}));

// Admin: verify SMTP is actually working and send a real test email,
// so config problems can be diagnosed from the console instead of guessing
// at Render logs. Returns the exact SMTP error if it fails.
router.post('/test-email', authMiddleware, adminOnly, ah(async (req, res) => {
  const configured = await verifyEmailConfig();
  if (!configured) {
    return res.status(503).json({
      ok: false,
      error: 'SMTP is not configured or the connection failed. Check SMTP_HOST, SMTP_PORT, ADMIN_GMAIL, and GMAIL_APP_PASSWORD in Render → Environment, then check the server logs for the exact reason.'
    });
  }
  const result = await sendTestEmail(req.user.email);
  if (!result.sent) {
    return res.status(502).json({ ok: false, error: `Connection verified but sending failed: ${result.reason}` });
  }
  res.json({ ok: true, message: `Test email sent to ${req.user.email}. Check your inbox (and spam folder).` });
}));

export default router;
