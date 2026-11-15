import "server-only";

import nodemailer from "nodemailer";

type DeliverInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

function getFromAddress(): string {
  const from = process.env.EMAIL_FROM?.trim();
  if (from) return from;
  return process.env.GMAIL_USER!.trim();
}

export async function deliverEmail(input: DeliverInput): Promise<string> {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) {
    throw new Error("Gmail SMTP is not configured.");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    const info = await transporter.sendMail({
      from: { name: "Eatry Hub", address: getFromAddress() },
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return info.messageId;
  } finally {
    transporter.close();
  }
}

export function describeDeliveryError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, " ").trim();
    return message.slice(0, 500);
  }
  return "Unknown email delivery error";
}