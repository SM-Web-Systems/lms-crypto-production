import nodemailer from "nodemailer";
import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: config.SMTP_PORT === 465,
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

export async function sendEmail(to: string, subject: string, html: string) {
  try {
    await transporter.sendMail({
      from: config.SMTP_FROM,
      to,
      subject,
      html,
    });
    return true;
  } catch (err: any) {
    console.error("[mailer] Failed to send email:", err.message);
    return false;
  }
}

export async function send2FACode(to: string, code: string) {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">Amma Wallet</h1>
      </div>
      <div style="background: #1a1a2e; border-radius: 16px; padding: 32px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0 0 8px;">Your Login Code</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 24px;">Enter this code to complete your sign-in</p>
        <div style="background: #16213e; border: 2px solid #7c3aed; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
          <span style="font-family: monospace; font-size: 32px; letter-spacing: 8px; color: #ffffff; font-weight: bold;">${code}</span>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">This code expires in <strong style="color: #ffffff;">10 minutes</strong>. Do not share it with anyone.</p>
      </div>
      <p style="color: #6b7280; font-size: 11px; text-align: center; margin-top: 24px;">
        If you didn't request this code, you can safely ignore this email.
      </p>
    </div>
  `;
  return sendEmail(to, "Your Amma Wallet Login Code", html);
}
