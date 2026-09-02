import { config } from "../config";

let twilioClient: any = null;

function getClient() {
  if (!twilioClient && config.smsEnabled) {
    const twilio = require("twilio");
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

/**
 * Send OTP verification code via SMS using Twilio Verify
 */
export async function sendSmsVerification(phoneNumber: string): Promise<{ success: boolean; error?: string }> {
  if (!config.smsEnabled) {
    return { success: false, error: "SMS verification is not enabled" };
  }

  try {
    const client = getClient();
    if (!client) return { success: false, error: "SMS service not configured" };

    await client.verify.v2
      .services(config.twilio.verifyServiceSid)
      .verifications.create({ to: phoneNumber, channel: "sms" });

    return { success: true };
  } catch (err: any) {
    console.error("[sms] send verification failed:", err.message);
    return { success: false, error: "Failed to send verification code" };
  }
}

/**
 * Check OTP verification code via Twilio Verify
 */
export async function checkSmsVerification(
  phoneNumber: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  if (!config.smsEnabled) {
    return { success: false, error: "SMS verification is not enabled" };
  }

  try {
    const client = getClient();
    if (!client) return { success: false, error: "SMS service not configured" };

    const check = await client.verify.v2
      .services(config.twilio.verifyServiceSid)
      .verificationChecks.create({ to: phoneNumber, code });

    if (check.status === "approved") {
      return { success: true };
    }
    return { success: false, error: "Invalid or expired code" };
  } catch (err: any) {
    console.error("[sms] check verification failed:", err.message);
    return { success: false, error: "Verification check failed" };
  }
}
