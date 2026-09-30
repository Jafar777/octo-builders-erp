import { Resend } from "resend";

let resend;

function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export async function sendOtpEmail({ to, code, purpose }) {
  const client = getResend();
  const subject =
    purpose === "signup"
      ? `Your Octo Builders sign-up code: ${code}`
      : `Your Octo Builders sign-in code: ${code}`;

  const result = await client.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f2331; color: #f4f4f4; border-radius: 16px;">
        <h1 style="font-size: 20px; margin-bottom: 8px; color: #ffffff;">Octo Builders</h1>
        <p style="color: #b7c2ca; margin-bottom: 24px;">
          ${purpose === "signup" ? "Confirm your email to create your account." : "Use this code to sign in."}
        </p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; background: #16324a; border-radius: 12px; color: #f37b20;">
          ${code}
        </div>
        <p style="color: #7d8a92; font-size: 13px; margin-top: 24px;">
          This code expires in 10 minutes. If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
  });

  // The Resend SDK returns { data, error } instead of throwing on failure.
  if (result.error) {
    throw new Error(result.error.message || "resend_send_failed");
  }
}
