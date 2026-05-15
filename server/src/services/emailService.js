const sgMail = require("@sendgrid/mail");

const maskEmail = (email) => {
  const raw = String(email || "").trim();
  const [local, domain] = raw.split("@");
  if (!local || !domain) return raw;
  if (local.length <= 2) return `*${local.slice(-1)}@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local.slice(-1)}@${domain}`;
};

const getHeaderValue = (headers, key) => {
  if (!headers) return null;
  if (typeof headers.get === "function") {
    return headers.get(key);
  }

  const direct = headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()];
  if (Array.isArray(direct)) return direct[0] || null;
  return direct || null;
};

const sendViaSendGrid = async ({ to, subject, text, html }) => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;

  if (!apiKey || !from) {
    throw new Error("SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL.");
  }

  sgMail.setApiKey(apiKey);
  const msg = {
    to,
    from,
    subject,
    text: text || "",
    html: html || `<p>${text || ""}</p>`,
  };

  try {
    const response = await sgMail.send(msg);
    const firstResponse = Array.isArray(response) ? response[0] : response;
    const messageId = getHeaderValue(firstResponse?.headers, "x-message-id");

    console.log(
      `[EMAIL:SENDGRID] Email sent successfully to ${maskEmail(to)}${
        messageId ? ` | messageId=${messageId}` : ""
      }`
    );

    return { provider: "sendgrid", messageId: messageId || undefined };
  } catch (error) {
    const providerError = error.response?.body?.errors?.[0];
    const errorMessage = providerError?.message || error.message || "SendGrid send failed";
    console.error("[EMAIL:SENDGRID] Send failed:", error.response?.body || error.message || error);
    throw new Error(errorMessage);
  }
};

const sendViaMailgun = async ({ to, subject, text, html }) => {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM_EMAIL || process.env.SMTP_FROM_EMAIL;

  if (!apiKey || !domain || !from) {
    throw new Error("Mailgun is not configured. Set MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM_EMAIL.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node runtime.");
  }

  const body = new URLSearchParams({
    from,
    to,
    subject,
    text: text || "",
    html: html || `<p>${text || ""}</p>`,
  });

  const encodedAuth = Buffer.from(`api:${apiKey}`).toString("base64");
  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodedAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Mailgun email failed: ${payload}`);
  }

  return { provider: "mailgun" };
};

const sendEmail = async ({ to, subject, text, html }) => {
  const provider = String(process.env.EMAIL_PROVIDER || "console").toLowerCase();

  if (!to || !subject) {
    const msg = "Email recipient and subject are required";
    console.log(`[EMAIL] Validation failed:`, { to, subject, provider });
    return {
      success: false,
      provider,
      message: msg,
    };
  }

  try {
    if (provider === "sendgrid") {
      console.log(`[EMAIL:SENDGRID] Attempting to send to ${maskEmail(to)}`);
      const result = await sendViaSendGrid({ to, subject, text, html });
      return { success: true, simulated: false, ...result };
    }

    if (provider === "mailgun") {
      console.log(`[EMAIL:MAILGUN] Attempting to send to ${maskEmail(to)}`);
      const result = await sendViaMailgun({ to, subject, text, html });
      return { success: true, simulated: false, ...result };
    }

    console.log(`[EMAIL:CONSOLE] to ${maskEmail(to)} | ${subject}`);
    if (text) {
      console.log(text);
    }

    return { success: true, provider: "console", simulated: true };
  } catch (error) {
    console.error(`[EMAIL:${provider.toUpperCase()}] Send error:`, {
      to: maskEmail(to),
      subject,
      errorMessage: error.message,
      errorFull: error,
    });
    console.log(`[EMAIL:FALLBACK] to ${maskEmail(to)} | ${subject}`);
    if (text) {
      console.log(text);
    }

    return {
      success: false,
      provider,
      simulated: true,
      fallback: true,
      warning: error.message || "Email provider failed",
      message: "Unable to deliver email using configured provider",
    };
  }
};

module.exports = {
  sendEmail,
  sendActivationEmail: async (beneficiaryEmail, activationCode, planNames, isRenewal = false) => {
    const subject = isRenewal 
      ? "Renew Your OTT Subscription - Activation Code Inside"
      : "Your OTT Subscription is Ready - Activation Code";

    const text = `
Your ${isRenewal ? "renewed" : "new"} subscription ${isRenewal ? "renewal" : "purchase"} through BNPL has been initiated.

Plans: ${planNames}
Activation Code: ${activationCode}

To activate your subscription:
1. Visit the provider's website
2. Navigate to "Redeem Code" or "Enter Promo Code"
3. Paste the activation code above
4. Your subscription will be activated immediately

Subscription Details:
- Code: ${activationCode}
- Plans: ${planNames}
- Status: Ready for Activation

Questions? Contact our support team.

---
BNPL Subscription Hub
    `.trim();

    const html = `
<html>
  <body style="font-family: Arial, sans-serif; color: #333;">
    <div style="max-width: 600px; margin: 0 auto;">
      <h2 style="color: #0066cc;">${subject}</h2>
      
      <p>Your ${isRenewal ? "renewed" : "new"} subscription ${isRenewal ? "renewal" : "purchase"} through BNPL has been initiated.</p>
      
      <div style="background-color: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Plans:</strong> ${planNames}</p>
        <p><strong>Activation Code:</strong></p>
        <div style="background-color: #fff; padding: 12px; border: 2px solid #0066cc; border-radius: 4px; font-family: monospace; font-size: 16px; font-weight: bold; text-align: center;">${activationCode}</div>
      </div>
      
      <h3>To activate your subscription:</h3>
      <ol>
        <li>Visit the provider's website</li>
        <li>Navigate to "Redeem Code" or "Enter Promo Code"</li>
        <li>Paste the activation code above</li>
        <li>Your subscription will be activated immediately</li>
      </ol>
      
      <div style="background-color: #fffbea; padding: 12px; border-left: 4px solid #f59e0b; margin: 20px 0;">
        <strong>Note:</strong> Make sure to use this code on the correct subscription provider's platform.
      </div>
      
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        Questions? Contact our support team.<br/>
        <strong>BNPL Subscription Hub</strong>
      </p>
    </div>
  </body>
</html>
    `.trim();

    return sendEmail({
      to: beneficiaryEmail,
      subject,
      text,
      html,
    });
  },
};
