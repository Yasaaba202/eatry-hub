import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import nodemailer from "nodemailer";

function loadEnv(file) {
  const path = resolve(process.cwd(), file);
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(".env.local");
loadEnv(".env");

const recipients = Array.from(
  new Set(
    [process.env.ADMIN_EMAIL, process.env.GMAIL_USER]
      .map((value) => value?.trim())
      .filter((value) => value && value.includes("@")),
  ),
);

if (recipients.length === 0) {
  console.error("No recipient address found. Set ADMIN_EMAIL or GMAIL_USER in .env.local.");
  process.exit(1);
}

const user = process.env.GMAIL_USER?.trim();
const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
if (!user || !pass) {
  console.error("GMAIL_USER and GMAIL_APP_PASSWORD must be set in .env.local.");
  process.exit(1);
}

const sampleOrder = {
  orderNumber: "EH-TEST0000001",
  customerName: "Ama Mensah",
  items: [
    { name: "Jollof Rice (Large)", quantity: 2, total: 60 },
    { name: "Grilled Tilapia", quantity: 1, total: 45 },
  ],
  subtotal: 105,
  deliveryFee: 5,
  total: 110,
  paymentMethod: "Mobile Money",
  paymentStatus: "PENDING",
};

const events = [
  ["customer.welcome", "Welcome to Eatry Hub", "Your customer account is ready.", "Confirm your email address so we can send order updates and receipts."],
  ["customer.verify_email", "Confirm your Eatry Hub email address", "Confirm this address so we can send order updates and payment receipts.", "This link expires in 7 days."],
  ["customer.email_verified", "Your Eatry Hub email is confirmed", "Your email address is confirmed.", "You will now receive order updates and payment receipts."],
  ["customer.password_changed", "Your Eatry Hub password was changed", "The password for your customer account was changed.", "If this was not you, reset your password immediately and contact support."],
  ["customer.signed_in", "New sign-in to your Eatry Hub account", "Your customer account was just used to sign in.", "If this was not you, change your password immediately and contact support."],
  ["customer.order_placed", "Order placed", "We received your order and sent it to the vendor.", `Order ${sampleOrder.orderNumber} for GHS ${sampleOrder.total.toFixed(2)}.`],
  ["customer.order_status", "Order update: preparing", "The vendor is preparing your food.", `Order ${sampleOrder.orderNumber}.`],
  ["customer.payment_received", "Payment details received", "We received your payment details. Your order is waiting for payment verification.", `Order ${sampleOrder.orderNumber}.`],
  ["customer.payment_verified", "Payment verified", "Your payment has been verified and your order is confirmed.", `Order ${sampleOrder.orderNumber}.`],
  ["customer.payment_failed", "Payment could not be verified", "We could not verify your payment, so the order was cancelled.", `Order ${sampleOrder.orderNumber}.`],
  ["customer.wallet_topup_submitted", "Eatry Hub wallet payment submitted", "We received your mobile money payment details.", "Amount: GHS 50.00, Transaction ID: TEST-TX-1001."],
  ["customer.wallet_topup_confirmed", "Eatry Hub wallet top-up confirmed", "Your mobile money transfer has been verified and your wallet has been credited.", "Amount: GHS 50.00, Transaction ID: TEST-TX-1001."],
  ["customer.wallet_topup_failed", "Eatry Hub wallet top-up not verified", "We could not verify your mobile money payment, so your wallet was not credited.", "Amount: GHS 50.00, Transaction ID: TEST-TX-1001."],
  ["customer.wallet_debit", "Eatry Hub wallet payment", "We paid for your order using your Eatry Hub wallet balance.", `Amount: GHS ${sampleOrder.total.toFixed(2)}, Order ${sampleOrder.orderNumber}.`],
  ["vendor.welcome", "Welcome to Eatry Hub", "Your vendor account has been created.", "Complete your store setup and submit your subscription payment to go live."],
  ["vendor.password_changed", "Your Eatry Hub vendor password was changed", "The password for your vendor account was changed.", "If this was not you, reset your password immediately and contact support."],
  ["vendor.signed_in", "New sign-in to your Eatry Hub vendor account", "Your vendor account was just used to sign in.", "If this was not you, change your password immediately and contact support."],
  ["vendor.new_order", "New customer order", "A new customer order was placed and is waiting for you to accept it.", `Order ${sampleOrder.orderNumber} from ${sampleOrder.customerName}, GHS ${sampleOrder.total.toFixed(2)}.`],
  ["vendor.payment_verified", "Payment verified", "The customer's payment for this order has been verified. You can prepare it now.", `Order ${sampleOrder.orderNumber}.`],
  ["vendor.order_cancelled", "Order cancelled", "This order was cancelled. No further preparation is required.", `Order ${sampleOrder.orderNumber}.`],
  ["vendor.payout_requested", "Withdrawal request received", "We received your withdrawal request and queued it for the next processing window.", "Reference: TEST-PAY-2001, Amount: GHS 200.00."],
  ["vendor.payout_completed", "Withdrawal marked paid", "Your withdrawal has been marked as paid by an administrator.", "Reference: TEST-PAY-2001, Amount: GHS 200.00."],
  ["vendor.account_status", "Your Eatry Hub vendor account: approved", "Your vendor account is now approved.", "Business: Test Kitchen, Status: APPROVED."],
  ["admin.new_order", "New order placed", "A new customer order was placed on Eatry Hub.", `Order ${sampleOrder.orderNumber} from ${sampleOrder.customerName}, GHS ${sampleOrder.total.toFixed(2)}.`],
  ["admin.signed_in", "Admin sign-in on Eatry Hub", "An administrator session was created on Eatry Hub.", "If this was not you, change the admin password immediately."],
  ["admin.payment_submitted", "Payment awaiting verification", "A customer payment submission is waiting for manual verification.", "Reference: TEST-TX-1001, Amount: GHS 110.00."],
  ["admin.payment_verified", "Payment verified", "An administrator verified a customer payment.", "Reference: TEST-TX-1001, Amount: GHS 110.00."],
  ["admin.payment_rejected", "Payment rejected", "An administrator rejected a customer payment submission.", "Reference: TEST-TX-1001, Amount: GHS 110.00."],
  ["admin.payout_requested", "Vendor withdrawal requested", "A vendor requested a withdrawal.", "Business: Test Kitchen, Reference: TEST-PAY-2001, Amount: GHS 200.00."],
  ["admin.payout_completed", "Withdrawal marked paid", "A vendor withdrawal was marked as paid.", "Business: Test Kitchen, Reference: TEST-PAY-2001, Amount: GHS 200.00."],
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render(event, heading, intro, detail) {
  const rows = sampleOrder.items
    .map((item) => `<tr><td style="padding:6px 0">${escapeHtml(item.name)} &times; ${item.quantity}</td><td style="padding:6px 0;text-align:right">GHS ${item.total.toFixed(2)}</td></tr>`)
    .join("");
  return `<!doctype html>
<html><body style="margin:0;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#1f2421">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#166534;color:#ffffff;padding:18px 22px;border-radius:12px 12px 0 0">
    <strong style="font-size:18px">Eatry Hub</strong>
    <div style="font-size:12px;opacity:.85">Test email &middot; ${escapeHtml(event)}</div>
  </div>
  <div style="background:#ffffff;padding:22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
    <h1 style="margin:0 0 10px;font-size:20px">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 12px;line-height:1.5">${escapeHtml(intro)}</p>
    <p style="margin:0 0 12px;line-height:1.5">${escapeHtml(detail)}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left">
        <th style="padding:6px 0">Item</th><th style="padding:6px 0;text-align:right">Line total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="border-top:1px solid #e5e7eb">
        <td style="padding:8px 0"><strong>Total</strong></td>
        <td style="padding:8px 0;text-align:right"><strong>GHS ${sampleOrder.total.toFixed(2)}</strong></td>
      </tr></tfoot>
    </table>
    <p style="margin:0;font-size:12px;color:#6b7280">This is a test message sent from the Eatry Hub notification setup.</p>
  </div>
</div>
</body></html>`;
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

let sent = 0;
const failures = [];

try {
  for (const recipient of recipients) {
    for (const [event, heading, intro, detail] of events) {
      const subject = `[Test] ${heading}`;
      try {
        await transporter.sendMail({
          from: { name: "Eatry Hub", address: process.env.EMAIL_FROM?.trim() || user },
          to: recipient,
          subject,
          text: `${heading}\n\n${intro}\n\n${detail}\n\nThis is a test message sent from the Eatry Hub notification setup.`,
          html: render(event, heading, intro, detail),
        });
        sent += 1;
        console.log(`sent  ${recipient}  ${event}`);
      } catch (error) {
        const message = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Unknown error";
        failures.push({ recipient, event, message });
        console.error(`fail  ${recipient}  ${event}  ${message}`);
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 700));
    }
  }
} finally {
  transporter.close();
}

console.log(`\n${sent} sent, ${failures.length} failed.`);
if (failures.length > 0) process.exitCode = 1;