import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { ah } from '../utils/asyncHandler.js';

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// Customers self-register here. Admin accounts are only created via
// ADMIN_EMAIL / ADMIN_PASSWORD env vars (seeded in db.js on startup),
// never through this public endpoint.
router.post('/register', ah(async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }
  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (existing.rows[0]) return res.status(409).json({ error: 'An account with this email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    'INSERT INTO users (email, password, name, phone, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, name, role',
    [email, hash, name, phone || null, 'customer']
  );
  const user = r.rows[0];
  res.json({ token: signToken(user), user });
}));

router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
  if (!r.rows[0]) return res.status(404).json({ error: 'No account found for this email' });
  const ok = await bcrypt.compare(password, r.rows[0].password);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });
  const user = { id: r.rows[0].id, email: r.rows[0].email, name: r.rows[0].name, role: r.rows[0].role };
  res.json({ token: signToken(user), user });
}));

router.get('/me', authMiddleware, ah(async (req, res) => {
  const r = await pool.query('SELECT id, email, name, phone, role FROM users WHERE id=$1', [req.user.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(r.rows[0]);
}));

export default router;
