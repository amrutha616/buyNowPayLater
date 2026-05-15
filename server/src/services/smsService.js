const https = require("https");

const maskPhone = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const normalizePhone = (phone) => String(phone || "").replace(/\D/g, "");

const formatTwilioPhone = (phone) => {
  const raw = String(phone || "").trim();
  if (!raw) return "";

  if (raw.startsWith("+")) {
    return raw.replace(/\s+/g, "");
  }

  const digits = normalizePhone(raw);
  if (!digits) return "";

  if (digits.length === 10) {
    const defaultCountryCode = String(process.env.TWILIO_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "") || "91";
    return `+${defaultCountryCode}${digits}`;
  }

  return `+${digits}`;
};

const postFormRequest = ({ url, headers, body }) => {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "POST", headers }, (response) => {
      let responseBody = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        responseBody += chunk;
      });
      response.on("end", () => {
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          text: async () => responseBody,
          json: async () => {
            try {
              return JSON.parse(responseBody);
            } catch (error) {
              return null;
            }
          },
        });
      });
    });

    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
};

const sendViaTwilio = async ({ to, message }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const verifyServiceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || "").trim();

  if (!accountSid || !authToken || !from) {
    throw new Error("Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.");
  }

  const encodedAuth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const toNumber = formatTwilioPhone(to);
  const fromNumber = formatTwilioPhone(from);

  if (!toNumber) {
    throw new Error("Twilio destination phone number is invalid.");
  }

  if (!fromNumber) {
    throw new Error("Twilio sender phone number is invalid.");
  }

  if (verifyServiceSid) {
    const verifyBody = new URLSearchParams({
      To: toNumber,
      Channel: "sms",
    }).toString();

    const verifyResponse = await postFormRequest({
      url: `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`,
      headers: {
        Authorization: `Basic ${encodedAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(verifyBody),
      },
      body: verifyBody,
    });

    if (!verifyResponse.ok) {
      const payload = await verifyResponse.text();
      throw new Error(`Twilio Verify failed: ${payload}`);
    }

    return { provider: "twilio-verify" };
  }

  const body = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    Body: message,
  }).toString();

  const response = await postFormRequest({
    url: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    headers: {
      Authorization: `Basic ${encodedAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Twilio SMS failed: ${payload}`);
  }

  return { provider: "twilio" };
};

const sendViaMsg91 = async ({ to, otpCode }) => {
  const apiKey = process.env.MSG91_API_KEY;

  if (!apiKey) {
    throw new Error("MSG91 is not configured. Set MSG91_API_KEY.");
  }

  if (!otpCode) {
    throw new Error("MSG91 OTP flow requires otpCode.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node runtime.");
  }

  const normalized = normalizePhone(to);
  const mobile = normalized.length === 10 ? `91${normalized}` : normalized;

  const response = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: {
      authkey: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mobile,
      otp: String(otpCode),
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`MSG91 OTP failed: ${payload}`);
  }

  return { provider: "msg91" };
};

const sendViaFast2SMS = async ({ to, otpCode }) => {
  const apiKey = process.env.FAST2SMS_API_KEY;

  if (!apiKey) {
    throw new Error("Fast2SMS is not configured. Set FAST2SMS_API_KEY.");
  }

  if (!otpCode) {
    throw new Error("Fast2SMS OTP flow requires otpCode.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable in this Node runtime.");
  }

  const normalized = normalizePhone(to);
  const body = new URLSearchParams({
    route: "otp",
    variables_values: String(otpCode),
    numbers: normalized,
  });

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Fast2SMS OTP failed: ${payload}`);
  }

  return { provider: "fast2sms" };
};

const sendSMS = async ({ to, message, otpCode }) => {
  const provider = String(process.env.SMS_PROVIDER || "console").toLowerCase();

  if (!to || !message) {
    return {
      success: false,
      provider,
      message: "Phone number and message are required",
    };
  }

  try {
    if (provider === "twilio") {
      const result = await sendViaTwilio({ to, message });
      return { success: true, simulated: false, ...result };
    }

    if (provider === "msg91") {
      const result = await sendViaMsg91({ to, otpCode });
      return { success: true, simulated: false, ...result };
    }

    if (provider === "fast2sms") {
      const result = await sendViaFast2SMS({ to, otpCode });
      return { success: true, simulated: false, ...result };
    }

    console.log(`[SMS:SIMULATED] to ${maskPhone(to)} -> ${message}`);
    return { success: true, provider: "console", simulated: true };
  } catch (error) {
    console.error("SMS send error:", error.message || error);
    if (provider === "twilio") {
      throw error;
    }

    console.log(`[SMS:FALLBACK] to ${maskPhone(to)} -> ${message}`);
    return {
      success: true,
      provider,
      simulated: true,
      fallback: true,
      warning: error.message || "SMS provider failed",
    };
  }
};

module.exports = {
  sendSMS,
  normalizePhone,
  formatTwilioPhone,
};
