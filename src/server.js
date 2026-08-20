import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import inquiryRoutes from './routes/inquiries.js';
import shipmentRoutes from './routes/shipments.js';
import paymentRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inquiries', inquiryRoutes);
app.use('/api/v1/shipments', shipmentRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', adminRoutes);

app.get('/api/v1/health', (req, res) => res.json({
  status: 'TrackFlow WORLD API LIVE',
  customer_url: `${req.protocol}://${req.get('host')}/customer/`,
  admin_url: `${req.protocol}://${req.get('host')}/admin/`
}));

// === STATIC FRONTEND ===
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
app.use('/customer', express.static(path.join(publicPath, 'customer')));
app.use('/admin', express.static(path.join(publicPath, 'admin')));

app.get('/', (req, res) => res.redirect('/customer/'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  if (req.path.startsWith('/admin')) return res.sendFile(path.join(publicPath, 'admin', 'index.html'));
  res.sendFile(path.join(publicPath, 'customer', 'index.html'));
});

// Generic error handler so a thrown error never crashes the process silently
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 10000;

async function start() {
  try {
    if (!process.env.DATABASE_URL) {
      console.error('FATAL: DATABASE_URL is not set. Add it in Render → Environment.');
      process.exit(1);
    }
    if (!process.env.JWT_SECRET) {
      console.error('FATAL: JWT_SECRET is not set. Add it in Render → Environment.');
      process.exit(1);
    }
    await initDb();
    app.listen(PORT, () => console.log(`TrackFlow running on port ${PORT} — /customer/ and /admin/ ready`));
  } catch (e) {
    console.error('FATAL: could not start server —', e.message);
    process.exit(1);
  }
}

start();
