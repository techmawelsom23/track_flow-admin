import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const resend = process.env.RESEND_API_KEY? new Resend(process.env.RESEND_API_KEY) : null;

async function send(to, subject, html) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY missing — skipped "${subject}"`);
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: 'TrackFlow <onboarding@resend.dev>',
      to,
      subject,
      html,
    });
    if (error) throw error;
    console.log(`[email] Sent "${subject}" to ${to} id=${data.id}`);
    return { sent: true, messageId: data.id };
  } catch (e) {
    console.error(`[email] FAILED "${subject}" to ${to} —`, e.message);
    return { sent: false, reason: e.message };
  }
}

export async function verifyEmailConfig() {
  if (!resend) {
    console.warn('[email] Resend not configured');
    return false;
  }
  console.log('[email] Resend ready — sending as onboarding@resend.dev');
  return true;
}

const wrap = (title, body) => `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
  <div style="background:#10192B;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0;font-weight:700">TrackFlow</div>
  <div style="border:1px solid #E3DFD3;border-top:none;padding:24px;border-radius:0 0 10px 10px">
    <h2>${title}</h2>${body}
  </div>
</div>`;

export const sendNewInquiryEmail = (inq, cust) => send(process.env.ADMIN_GMAIL, `New inquiry: ${inq.cargo_description}`, wrap('New inquiry', `<p>${cust.name} (${cust.email}) - ${inq.cargo_description} - ${inq.origin_city} → ${inq.destination_city}</p>`));
export const sendQuoteEmail = (cust, inq) => send(cust.email, 'Your TrackFlow quote is ready', wrap('Quote ready', `<p>Hi ${cust.name}, your quote is $${Number(inq.quote_cost_usd).toLocaleString()}</p>`));
export const sendShipmentUpdateEmail = (cust, ship, status, loc) => send(cust.email, `Shipment ${ship.tracking_code}: ${status}`, wrap('Shipment update', `<p>Shipment ${ship.tracking_code} is ${status} at ${loc}</p>`));
export const sendPaymentOtpEmail = (ship, cust, otp) => send(process.env.ADMIN_GMAIL, `TrackFlow payment verification: ${otp}`, wrap('Payment OTP', `<p>${cust.email} paid for ${ship.tracking_code}</p><div style="text-align:center;font-size:32px;letter-spacing:6px;font-weight:700;margin:20px 0">${otp}</div><p>Expires in 10 mins</p>`));
export const sendTestEmail = (to) => send(to, 'TrackFlow test email', wrap('Test email', `<p>Test at ${new Date().toISOString()} - Resend works!</p>`));
