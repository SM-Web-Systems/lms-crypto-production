import { config } from "../config";
import { sendEmail } from "./mailer";

export async function sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
  const resetUrl = `${config.WEB_APP_URL}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">Amma Wallet</h1>
      </div>
      <div style="background: #1a1a2e; border-radius: 16px; padding: 32px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0 0 8px;">Reset Your Password</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 24px;">Click the button below to set a new password</p>
        <a href="${resetUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: white; padding: 14px 32px;
                  border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This link expires in <strong style="color: #ffffff;">1 hour</strong>.</p>
        <p style="color: #6b7280; font-size: 11px; margin-top: 16px; word-break: break-all;">
          Or copy: ${resetUrl}
        </p>
      </div>
      <p style="color: #6b7280; font-size: 11px; text-align: center; margin-top: 24px;">
        If you didn't request this, you can safely ignore this email.
      </p>
    </div>
  `;

  const sent = await sendEmail(to, "Amma Wallet - Password Reset", html);
  if (!sent) {
    console.error("[email] Failed to send password reset email to", to);
  }
}


export async function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const verifyUrl = `${config.WEB_APP_URL}/verify-email?token=${token}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">Amma Wallet</h1>
      </div>
      <div style="background: #1a1a2e; border-radius: 16px; padding: 32px; text-align: center;">
        <h2 style="color: #ffffff; margin: 0 0 8px;">Verify Your Email</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 24px;">Click the button below to verify your email address and activate your account.</p>
        <a href="${verifyUrl}"
           style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #3b82f6); color: white; padding: 14px 32px;
                  border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
          Verify Email
        </a>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This link expires in <strong style="color: #ffffff;">24 hours</strong>.</p>
        <p style="color: #6b7280; font-size: 11px; margin-top: 16px; word-break: break-all;">
          Or copy: ${verifyUrl}
        </p>
      </div>
      <p style="color: #6b7280; font-size: 11px; text-align: center; margin-top: 24px;">
        If you didn't create an Amma Wallet account, you can safely ignore this email.
      </p>
    </div>
  `;

  return await sendEmail(to, "Amma Wallet - Verify Your Email", html);
}
