import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.ADMIN_GMAIL || !process.env.GMAIL_APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.ADMIN_GMAIL, pass: process.env.GMAIL_APP_PASSWORD }
  });
  return transporter;
}

async function send(to, subject, html) {
  const t = getTransporter();
  if (!t) {
    console.warn(`[email] Not configured (SMTP_HOST/ADMIN_GMAIL/GMAIL_APP_PASSWORD missing) — skipped: "${subject}" to ${to}`);
    return;
  }
  if (!to) {
    console.warn(`[email] No recipient for "${subject}" — skipped`);
    return;
  }
  try {
    await t.sendMail({ from: `TrackFlow <${process.env.ADMIN_GMAIL}>`, to, subject, html });
  } catch (e) {
    console.error('[email] Failed to send:', e.message);
  }
}

function wrap(title, bodyHtml) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#161F30;">
    <div style="background:#10192B;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;">
      <div style="font-weight:700;font-size:17px;">TrackFlow</div>
    </div>
    <div style="border:1px solid #E3DFD3;border-top:none;padding:24px;border-radius:0 0 10px 10px;">
      <h2 style="margin:0 0 14px;font-size:19px;">${title}</h2>
      ${bodyHtml}
    </div>
  </div>`;
}

// Admin notification: a new inquiry came in
export async function sendNewInquiryEmail(inquiry, customer) {
  const to = process.env.ADMIN_GMAIL || process.env.ADMIN_EMAIL;
  const html = wrap('New shipping inquiry', `
    <p><b>${customer.name || customer.email}</b> (${customer.email}) submitted a new inquiry.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#5C6B82;">Cargo</td><td style="padding:6px 0;">${inquiry.cargo_description}</td></tr>
      <tr><td style="padding:6px 0;color:#5C6B82;">Weight</td><td style="padding:6px 0;">${inquiry.weight_kg ? inquiry.weight_kg + ' kg' : '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#5C6B82;">Route</td><td style="padding:6px 0;">${inquiry.origin_city || inquiry.origin_country} → ${inquiry.destination_city || inquiry.destination_country}</td></tr>
    </table>
    <p style="margin-top:16px;">Sign in to the admin console to send a quote.</p>
  `);
  await send(to, `New inquiry: ${inquiry.cargo_description}`, html);
}

// Customer notification: their inquiry was quoted
export async function sendQuoteEmail(customer, inquiry) {
  const html = wrap('Your quote is ready', `
    <p>Hi ${customer.name || ''},</p>
    <p>We've priced your shipment:</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#5C6B82;">Cargo</td><td style="padding:6px 0;">${inquiry.cargo_description}</td></tr>
      <tr><td style="padding:6px 0;color:#5C6B82;">Route</td><td style="padding:6px 0;">${inquiry.origin_city || inquiry.origin_country} → ${inquiry.destination_city || inquiry.destination_country}</td></tr>
      <tr><td style="padding:6px 0;color:#5C6B82;">Quote</td><td style="padding:6px 0;font-weight:700;font-size:16px;">$${Number(inquiry.quote_cost_usd).toLocaleString()}</td></tr>
      ${inquiry.quote_note ? `<tr><td style="padding:6px 0;color:#5C6B82;">Note</td><td style="padding:6px 0;">${inquiry.quote_note}</td></tr>` : ''}
    </table>
    <p style="margin-top:16px;">Sign in to your TrackFlow account to accept and create your shipment.</p>
  `);
  await send(customer.email, 'Your TrackFlow quote is ready', html);
}

// Customer notification: shipment status/location changed
export async function sendShipmentUpdateEmail(customer, shipment, status, location) {
  const html = wrap('Shipment update', `
    <p>Hi ${customer.name || ''},</p>
    <p>Your shipment <b>${shipment.tracking_code}</b> has a new status:</p>
    <div style="background:#F6F4EE;border:1px solid #E3DFD3;border-radius:8px;padding:14px 16px;margin:14px 0;">
      <div style="font-weight:700;font-size:15px;">${status.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</div>
      <div style="color:#5C6B82;font-size:13px;margin-top:4px;">${location || ''}</div>
    </div>
    <p>Track the full journey any time with your tracking code.</p>
  `);
  await send(customer.email, `Shipment ${shipment.tracking_code}: ${status.replace(/_/g,' ')}`, html);
}

// Admin: OTP required to confirm a Bitcoin payment
export async function sendPaymentOtpEmail(shipment, customer, otp) {
  const to = process.env.ADMIN_GMAIL || process.env.ADMIN_EMAIL;
  const html = wrap('Payment verification code', `
    <p><b>${customer.name || customer.email}</b> says they've sent payment for shipment <b>${shipment.tracking_code}</b> ($${Number(shipment.cost_usd).toLocaleString()}).</p>
    <p>Verify the transaction landed in the wallet, then enter this code in the admin console to confirm payment:</p>
    <div style="text-align:center;margin:22px 0;">
      <span style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:6px;background:#F6F4EE;border:1px solid #E3DFD3;padding:14px 20px;border-radius:10px;display:inline-block;">${otp}</span>
    </div>
    <p style="color:#5C6B82;font-size:13px;">This code expires in 10 minutes. Do not share it with the customer.</p>
  `);
  await send(to, `TrackFlow payment verification: ${otp}`, html);
}
