import nodemailer from 'nodemailer';
import { config } from './config.js';

// Optional e-mail delivery through the organization's own SMTP server.
// When SMTP_HOST is not set, e-mail is skipped and only in-portal notifications are used.

const transporter = config.smtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      tls: { rejectUnauthorized: false },
    })
  : null;

export const isMailEnabled = () => transporter !== null;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function sendMail(to: string[], subject: string, body: string, link?: string) {
  if (!transporter || !config.smtp || to.length === 0) return;
  const html = `<div dir="rtl" style="font-family:Tahoma,sans-serif;line-height:1.9">
    <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
    ${link ? `<p><a href="${escapeHtml(link)}">مشاهده در پرتال</a></p>` : ''}
  </div>`;
  try {
    // BCC keeps recipient addresses private from each other.
    await transporter.sendMail({ from: config.smtp.from, to: config.smtp.from, bcc: to, subject, text: body, html });
  } catch (err) {
    console.error('Failed to send e-mail:', err);
  }
}
