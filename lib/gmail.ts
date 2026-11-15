import "server-only";

import nodemailer from "nodemailer";

type OrderEmailDetails = {
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  items: Array<{ name: string; quantity: number; total: number }>;
  amount: number;
  currency?: string;
};

async function sendEatryEmail(to: string, subject: string, text: string, html: string) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("Gmail SMTP is not configured.");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await transporter.sendMail({ from: { name: "Eatry Hub", address: user }, to, subject, text, html });
  } finally {
    transporter.close();
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function isGmailConfigured() {
  return Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
}

export async function sendPasswordResetCode(email: string, code: string, accountType: "customer" | "vendor" | "admin") {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("Gmail SMTP is not configured.");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  try {
    await transporter.sendMail({
      from: { name: "Eatry Hub", address: user },
      to: email,
      subject: "Your Eatry Hub password reset code",
      text: `Your Eatry Hub password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Use this code to reset your Eatry Hub ${accountType} password:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>`,
    });
  } finally {
    transporter.close();
  }
}

export async function sendPayoutPhoneVerificationCode(email: string, code: string) {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("Gmail SMTP is not configured.");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await transporter.sendMail({
      from: { name: "Eatry Hub", address: user },
      to: email,
      subject: "Confirm your Eatry Hub withdrawal number",
      text: `Your Eatry Hub withdrawal number confirmation code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Use this code to confirm the mobile money number for vendor withdrawals:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p>`,
    });
  } finally {
    transporter.close();
  }
}

export async function sendVendorNewOrderEmail(email: string, details: OrderEmailDetails) {
  const currency = details.currency ?? "GHS";
  const lines = details.items.map((item) => `${item.quantity} x ${item.name} (${currency} ${item.total.toFixed(2)})`);
  const subject = `New Eatry Hub order ${details.orderNumber}`;
  const text = `A new customer order was placed.\nOrder: ${details.orderNumber}\nCustomer: ${details.customerName}\nCall: ${details.customerPhone}\n${lines.join("\n")}\nFood total: ${currency} ${details.amount.toFixed(2)}`;
  const htmlLines = details.items.map((item) => `<li>${item.quantity} × ${escapeHtml(item.name)} — ${currency} ${item.total.toFixed(2)}</li>`).join("");
  await sendEatryEmail(email, subject, text, `<h2>New customer order</h2><p>Order <strong>${escapeHtml(details.orderNumber)}</strong></p><p>Customer: ${escapeHtml(details.customerName)}<br>Call: ${escapeHtml(details.customerPhone)}</p><ul>${htmlLines}</ul><p>Food total: <strong>${currency} ${details.amount.toFixed(2)}</strong></p><p>Sign in to your vendor dashboard to review and accept it.</p>`);
}

export async function sendCustomerPaymentEmail(email: string, details: Pick<OrderEmailDetails, "orderNumber" | "amount" | "currency"> & { confirmed: boolean }) {
  const currency = details.currency ?? "GHS";
  const subject = details.confirmed ? `Payment confirmed for order ${details.orderNumber}` : `Payment details received for order ${details.orderNumber}`;
  const status = details.confirmed
    ? "Your payment has been verified and your order is confirmed."
    : "We received your payment details. The order is waiting for payment verification.";
  await sendEatryEmail(email, subject, `${status}\nOrder: ${details.orderNumber}\nAmount: ${currency} ${details.amount.toFixed(2)}`, `<h2>${details.confirmed ? "Payment confirmed" : "Payment details received"}</h2><p>${status}</p><p>Order: <strong>${escapeHtml(details.orderNumber)}</strong><br>Amount: <strong>${currency} ${details.amount.toFixed(2)}</strong></p>`);
}

export async function sendCustomerTopUpEmail(email: string, details: { amount: number; transactionId: string; confirmed: boolean }) {
  const subject = details.confirmed ? "Your Eatry Hub wallet top-up is confirmed" : "Your Eatry Hub wallet payment was submitted";
  const status = details.confirmed
    ? "Your mobile money transfer has been verified and your wallet has been credited."
    : "We received your mobile money payment details. Your wallet will be credited after an administrator verifies the transfer.";
  await sendEatryEmail(email, subject, `${status}\nAmount: GHS ${details.amount.toFixed(2)}\nTransaction ID: ${details.transactionId}`, `<h2>${details.confirmed ? "Wallet top-up confirmed" : "Wallet payment submitted"}</h2><p>${status}</p><p>Amount: <strong>GHS ${details.amount.toFixed(2)}</strong><br>Transaction ID: ${escapeHtml(details.transactionId)}</p>`);
}

export async function sendCustomerOutForDeliveryEmail(email: string, details: { orderNumber: string; customerName: string }) {
  await sendEatryEmail(email, `Your Eatry Hub order ${details.orderNumber} is out for delivery`, `Hi ${details.customerName}, your food for order ${details.orderNumber} is out for delivery. Keep your phone available for the delivery call.`, `<p>Hi ${escapeHtml(details.customerName)},</p><p>Your food for order <strong>${escapeHtml(details.orderNumber)}</strong> is out for delivery. Keep your phone available for the delivery call.</p>`);
}

export async function sendAdminWithdrawalRequestedEmail(email: string, details: { businessName: string; vendorEmail: string; reference: string; amount: number; fee: number; netAmount: number; phone: string; network: string }) {
  const subject = `Vendor withdrawal request ${details.reference}`;
  const text = `${details.businessName} (${details.vendorEmail}) requested a withdrawal.\nReference: ${details.reference}\nGross: GHS ${details.amount.toFixed(2)}\nFee: GHS ${details.fee.toFixed(2)}\nSend: GHS ${details.netAmount.toFixed(2)}\nMobile Money: ${details.phone} (${details.network})\nProcess between 6:00 AM and 12:00 PM Ghana time.`;
  await sendEatryEmail(email, subject, text, `<h2>Vendor withdrawal requested</h2><p><strong>${escapeHtml(details.businessName)}</strong> (${escapeHtml(details.vendorEmail)})</p><p>Reference: <strong>${escapeHtml(details.reference)}</strong></p><p>Requested: GHS ${details.amount.toFixed(2)}<br>1% fee: GHS ${details.fee.toFixed(2)}<br>Send by MoMo: <strong>GHS ${details.netAmount.toFixed(2)}</strong><br>Number: ${escapeHtml(details.phone)} (${escapeHtml(details.network)})</p><p>Process this request between 6:00 AM and 12:00 PM Ghana time.</p>`);
}
