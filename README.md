# TrackFlow — World Freight Forwarding

Production build: Express + PostgreSQL API, with a wired customer portal and
admin operations console served from the same service.

## What this is

- `POST /api/v1/*` — API (auth, inquiries, shipments, payments, admin)
- `/customer/` — customer-facing portal (register, request quotes, pay in Bitcoin, track)
- `/admin/` — staff operations console (login, quote inquiries, create shipments, update tracking, confirm payments)

One Render service serves all three. No separate frontend deploy, no CORS issues.

## Required environment variables (set these in Render → Environment)

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` | Your Render Postgres internal connection string |
| `JWT_SECRET` | a long random string | used to sign login tokens |
| `ADMIN_EMAIL` | `trackflow.21@gmail.com` | admin account is auto-created on boot from this |
| `ADMIN_PASSWORD` | a strong password | set this to something real before going live |
| `BITCOIN_TRUST_WALLET_ADDRESS` | `bc1q...` | your real wallet address — this is where customers pay |
| `PORT` | `10000` | Render sets this automatically, but fine to set explicitly |

Optional:
- `JWT_EXPIRES_IN` (default `8h`)
- `BTC_PRICE_API` (defaults to CoinGecko's simple price endpoint)
- `SMTP_HOST`, `SMTP_PORT`, `ADMIN_GMAIL`, `GMAIL_APP_PASSWORD` — enables email notifications and OTP payment verification (see below). Without these set, the app runs fine and just logs `[email] Not configured — skipped` instead of sending.

**Important:** this app uses **PostgreSQL**, not MongoDB — make sure you provision
a Postgres database on Render (or elsewhere) and use `DATABASE_URL`, not a Mongo URI.

## Email notifications

Three moments trigger an email, all best-effort (a failed or unconfigured email never breaks the underlying action):

| Event | Recipient | Trigger |
|---|---|---|
| New inquiry submitted | Admin (`ADMIN_GMAIL`) | `POST /inquiries` |
| Quote sent | Customer | `PATCH /inquiries/:id/quote` |
| Shipment status/location changed | Customer | `POST /shipments/update-location` |

To enable: set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `ADMIN_GMAIL` to the sending
Gmail address, and `GMAIL_APP_PASSWORD` to a 16-character **App Password** (not your normal
Gmail password — generate one at https://myaccount.google.com/apppasswords, requires 2FA
enabled on the account).

**Diagnosing email problems:** on every boot, the server verifies the SMTP connection and
logs a clear pass/fail with the exact error to Render's logs — check there first if emails
aren't arriving. There's also a **Test email delivery** button at the top of the admin
console that sends a real test email on demand and shows the exact error in the UI (e.g.
Gmail's real `535-5.7.8 Username and Password not accepted` if the App Password is wrong).
Most delivery failures come down to one of: using a regular Gmail password instead of an
App Password, 2FA not being enabled (which blocks App Password generation entirely), a
typo in `ADMIN_GMAIL`, or the email actually landing in Spam on first send from a new
sending account — worth checking there too.

## Bitcoin payment verification (OTP)

Payments are never marked "paid" by a single admin click. The flow is:

1. Customer sends BTC and clicks **I've sent the payment** in the portal (`POST /payments/bitcoin/confirm`)
2. The shipment moves to `pending_confirmation`, and a 6-digit code is generated and emailed to `ADMIN_GMAIL` — valid for **10 minutes**
3. The admin checks the wallet on-chain to confirm the BTC actually arrived, then opens **Verify payment (OTP)** in the console and enters the code from that email (`POST /payments/bitcoin/verify-otp`)
4. Only a correct, unused, unexpired code flips `payment_status` to `paid`
5. If the code expires or the email is missed, the admin can trigger **Resend code** (`POST /payments/bitcoin/resend-otp`)

This means confirming a payment always requires reading an email sent to the real admin
inbox — a compromised or misclicked admin session alone can't release a shipment as paid.

If `SMTP_HOST`/`ADMIN_GMAIL`/`GMAIL_APP_PASSWORD` aren't set, the OTP is still generated and
stored — you can read it directly from the `payment_otps` table as a fallback, but you should
configure email before going live so this actually reaches your inbox.

## First boot

On startup the server:
1. Creates all tables if they don't exist (`users`, `inquiries`, `shipments`, `tracking_events`, `payment_proofs`)
2. Creates (or promotes) the admin account from `ADMIN_EMAIL` / `ADMIN_PASSWORD`

No manual seeding step required — just set the env vars and deploy.

## The real workflow

1. Customer registers at `/customer/`, submits a cargo inquiry (origin hub, destination hub, cargo description, weight)
2. Admin signs in at `/admin/`, reviews the inquiry, sets a quote (`PATCH /inquiries/:id/quote`)
3. Admin converts the quoted inquiry into a shipment (`POST /shipments/from-inquiry`) — this generates a tracking code like `TF-2026-XXXX`
4. Customer opens **Pay with Bitcoin** on the shipment — the amount is calculated server-side from the shipment's stored cost and the live BTC price, never trusted from the client
5. Customer sends BTC, optionally submits a tx hash — this marks the shipment `pending_confirmation` and emails a one-time verification code to the admin inbox
6. Admin verifies the payment landed in the wallet, then enters that code in the console — this is the only way `payment_status` becomes `paid`
7. Admin updates location/status as the shipment moves (`POST /shipments/update-location`) — pick from any of the 26 world hubs or enter a custom location; the customer gets an email each time
8. Anyone with the tracking code can follow it publicly at `/customer/` → Track, no login needed

## Local development

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, BITCOIN_TRUST_WALLET_ADDRESS
npm start
```

Then visit `http://localhost:10000/customer/` and `http://localhost:10000/admin/`.

## Deploying to Render

1. Push this repo to GitHub
2. In Render: New → Web Service → connect the repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all the environment variables listed above
6. Attach or create a Render Postgres database, copy its **internal** connection string into `DATABASE_URL`
7. Deploy

Render's free tier sleeps after 15 minutes of inactivity — the first request after
that takes ~30 seconds to wake up. If you have a client meeting, open `/admin/` a
few minutes beforehand to warm it up, or upgrade to a paid instance to avoid this.
