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
      : purpose === "salary"
        ? `Octo Builders salary access code: ${code}`
        : `Your Octo Builders sign-in code: ${code}`;

  const result = await client.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f2331; color: #f4f4f4; border-radius: 16px;">
        <h1 style="font-size: 20px; margin-bottom: 8px; color: #ffffff;">Octo Builders</h1>
        <p style="color: #b7c2ca; margin-bottom: 24px;">
          ${
            purpose === "signup"
              ? "Confirm your email to create your account."
              : purpose === "salary"
                ? "Use this code to view salary information. / استخدم هذا الرمز لعرض بيانات الرواتب."
                : "Use this code to sign in."
          }
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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Email copy of an important notification, in both languages.
export async function sendNotificationEmail({ to, message, link }) {
  const client = getResend();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const href = link && base ? `${base.replace(/\/$/, "")}${link}` : "";

  const result = await client.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject: `Octo Builders — ${message.en}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f2331; color: #f4f4f4; border-radius: 16px;">
        <h1 style="font-size: 20px; margin-bottom: 16px; color: #ffffff;">Octo Builders</h1>
        <p dir="rtl" style="font-size: 16px; margin: 0 0 8px;">${escapeHtml(message.ar)}</p>
        <p style="font-size: 15px; color: #b7c2ca; margin: 0 0 24px;">${escapeHtml(message.en)}</p>
        ${href ? `<a href="${escapeHtml(href)}" style="display: inline-block; padding: 12px 20px; background: #f37b20; color: #fff; border-radius: 10px; text-decoration: none;">Open / فتح</a>` : ""}
      </div>
    `,
  });

  if (result.error) {
    throw new Error(result.error.message || "resend_send_failed");
  }
}

// Daily summary of the notifications a person hasn't read (and wasn't emailed).
export async function sendDigestEmail({ to, items }) {
  const client = getResend();
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const rows = items
    .slice(0, 30)
    .map(
      (n) => `
        <tr><td style="padding: 10px 0; border-bottom: 1px solid #23394a;">
          <p dir="rtl" style="margin: 0 0 4px; font-size: 14px;">${escapeHtml(n.message.ar)}</p>
          <p style="margin: 0; font-size: 13px; color: #b7c2ca;">${escapeHtml(n.message.en)}</p>
        </td></tr>`
    )
    .join("");
  const result = await client.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to,
    subject: `Octo Builders — ${items.length} unread / ${items.length} غير مقروءة`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #0f2331; color: #f4f4f4; border-radius: 16px;">
        <h1 style="font-size: 20px; margin-bottom: 4px; color: #ffffff;">Octo Builders</h1>
        <p style="margin: 0 0 16px; color: #b7c2ca;">ملخص اليوم · Daily summary</p>
        <table style="width: 100%; border-collapse: collapse;">${rows}</table>
        ${base ? `<a href="${escapeHtml(base)}/dashboard/notifications" style="display: inline-block; margin-top: 20px; padding: 12px 20px; background: #f37b20; color: #fff; border-radius: 10px; text-decoration: none;">Open / فتح</a>` : ""}
      </div>
    `,
  });
  if (result.error) throw new Error(result.error.message || "resend_send_failed");
}
