// src/utils/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

async function sendMail({ to, subject, html, text, from }) {
  const fromAddr =
    from ||
    process.env.MAIL_FROM ||
    `"MBTI App" <no-reply@mbtiapp.local>`;
  return transporter.sendMail({ to, subject, html, text, from: fromAddr });
}

module.exports = { transporter, sendMail };
