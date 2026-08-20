import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import QRCode from 'qrcode';
import { pool } from '../db.js';
import { authMiddleware, adminOnly } from '../middleware/auth.js';
import { sendPaymentOtpEmail } from '../services/email.js';

const router = express.Router();
const OTP_TTL_MINUTES = 10;

async function getBtcPrice() {
  try {
    const { data } = await axios.get(
      process.env.BTC_PRICE_API || 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
      { timeout: 8000 }
    );
    return data.bitcoin.usd;
  } catch {
    return null;
  }
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function issueOtp(shipmentId) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await pool.query(
    'INSERT INTO payment_otps (shipment_id, otp_code, expires_at) VALUES ($1,$2,$3)',
    [shipmentId, otp, expiresAt]
  );
  return otp;
}

router.get('/bitcoin/price', async (req, res) => {
  const btc_usd = await getBtcPrice();
  if (!btc_usd) return res.status(502).json({ error: 'Could not fetch live BTC price, try again shortly' });
  res.json({ btc_usd });
});

// Amount is derived from the shipment's cost_usd in the DB — never trust a client-supplied amount.
router.post('/bitcoin/create', authMiddleware, async (req, res) => {
  const { shipmentId } = req.body;
  if (!shipmentId) return res.status(400).json({ error: 'shipmentId is required' });

  const s = await pool.query('SELECT * FROM shipments WHERE id=$1 AND user_id=$2', [shipmentId, req.user.id]);
  if (!s.rows[0]) return res.status(404).json({ error: 'Shipment not found' });
  if (!s.rows[0].cost_usd) return res.status(400).json({ error: 'This shipment has no cost set yet' });

  const btcAddress = process.env.BITCOIN_TRUST_WALLET_ADDRESS;
  if (!btcAddress || btcAddress.includes('PUT_YOUR') || btcAddress.includes('REPLACE')) {
    return res.status(500).json({ error: 'BITCOIN_TRUST_WALLET_ADDRESS is not configured on the server' });
  }

  const btcPrice = await getBtcPrice();
  if (!btcPrice) return res.status(502).json({ error: 'Could not fetch live BTC price, try again shortly' });

  const amountUSD = Number(s.rows[0].cost_usd);
  const btcAmount = (amountUSD / btcPrice).toFixed(8);
  const bitcoinUri = `bitcoin:${btcAddress}?amount=${btcAmount}&label=TrackFlow-${s.rows[0].tracking_code}`;
  const qrCode = await QRCode.toDataURL(bitcoinUri);

  res.json({
    shipmentId: s.rows[0].id,
    trackingCode: s.rows[0].tracking_code,
    btcAddress, btcAmount, amountUSD, btcPrice, bitcoinUri, qrCode
  });
});

// Customer submits proof of payment (tx hash). This puts the shipment into
// pending_confirmation AND emails a one-time verification code to the admin
// inbox — the admin must read that code from their own email and enter it
// in the console before the payment can be marked paid. This means a single
// admin-panel click is never enough to release a shipment as paid.
router.post('/bitcoin/confirm', authMiddleware, async (req, res) => {
  const { shipmentId, txHash } = req.body;
  if (!shipmentId) return res.status(400).json({ error: 'shipmentId is required' });

  const s = await pool.query('SELECT * FROM shipments WHERE id=$1 AND user_id=$2', [shipmentId, req.user.id]);
  if (!s.rows[0]) return res.status(404).json({ error: 'Shipment not found' });

  await pool.query('INSERT INTO payment_proofs (shipment_id, tx_hash, note) VALUES ($1,$2,$3)',
    [shipmentId, txHash || null, 'Submitted by customer']);
  await pool.query(`UPDATE shipments SET payment_status='pending_confirmation' WHERE id=$1`, [shipmentId]);

  const otp = await issueOtp(shipmentId);
  const customer = await pool.query('SELECT email, name FROM users WHERE id=$1', [req.user.id]);
  await sendPaymentOtpEmail(s.rows[0], customer.rows[0], otp);

  res.json({
    ok: true,
    status: 'pending_confirmation',
    message: 'Payment submitted. We\'ve sent a verification code to our admin team — they\'ll confirm shortly once it\'s verified on-chain.'
  });
});

// Admin: resend/regenerate the OTP for a shipment (e.g. it expired or the email got lost)
router.post('/bitcoin/resend-otp', authMiddleware, adminOnly, async (req, res) => {
  const { shipmentId } = req.body;
  if (!shipmentId) return res.status(400).json({ error: 'shipmentId is required' });

  const s = await pool.query(
    `SELECT shipments.*, users.email AS customer_email, users.name AS customer_name
     FROM shipments JOIN users ON users.id = shipments.user_id WHERE shipments.id=$1`,
    [shipmentId]
  );
  if (!s.rows[0]) return res.status(404).json({ error: 'Shipment not found' });

  const otp = await issueOtp(shipmentId);
  await sendPaymentOtpEmail(s.rows[0], { email: s.rows[0].customer_email, name: s.rows[0].customer_name }, otp);
  res.json({ ok: true, message: 'A new code has been sent to the admin inbox.' });
});

// Admin verifies the BTC actually landed in the wallet, then enters the OTP
// from their email to confirm payment. This is the only way payment_status
// can become 'paid' — there is no direct "just mark it paid" button.
router.post('/bitcoin/verify-otp', authMiddleware, adminOnly, async (req, res) => {
  const { shipmentId, otp } = req.body;
  if (!shipmentId || !otp) return res.status(400).json({ error: 'shipmentId and otp are required' });

  const rec = await pool.query(
    `SELECT * FROM payment_otps
     WHERE shipment_id=$1 AND otp_code=$2 AND used_at IS NULL AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [shipmentId, otp]
  );
  if (!rec.rows[0]) return res.status(400).json({ error: 'Invalid or expired code' });

  await pool.query('UPDATE payment_otps SET used_at=NOW() WHERE id=$1', [rec.rows[0].id]);
  const r = await pool.query(`UPDATE shipments SET payment_status='paid' WHERE id=$1 RETURNING *`, [shipmentId]);
  res.json(r.rows[0]);
});

export default router;
