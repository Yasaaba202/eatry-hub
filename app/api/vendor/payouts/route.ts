import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { PaymentStatus, Prisma, UserRole, UserStatus, VendorStatus } from "@prisma/client";
import { z } from "zod";
import { after } from "next/server";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { hitRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { isGmailConfigured, sendPayoutPhoneVerificationCode } from "@/lib/gmail";
import { notify, notifyAdmins } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const networkSchema = z.enum(["MTN", "TELECEL"]);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send_phone_code"), phone: z.string().trim().min(7).max(32), network: networkSchema }),
  z.object({ action: z.literal("verify_phone"), code: z.string().regex(/^\d{6}$/) }),
  z.object({ action: z.literal("request"), amount: z.number().positive().max(1000000), destination: z.enum(["REGISTERED", "ALTERNATE"]), network: networkSchema.optional() }),
]);
const codeLifetimeMs = 10 * 60 * 1000;
const maxAttempts = 5;

function codeHash(vendorId: string, code: string) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Account security is not configured.");
  return createHmac("sha256", secret).update(`${vendorId}:${code}`).digest("hex");
}

function secureEqual(vendorId: string, code: string, saved: string) {
  try {
    const actual = Buffer.from(codeHash(vendorId, code), "hex");
    const expected = Buffer.from(saved, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

async function getVendor() {
  const account = await getCurrentAccount();
  if (!account || account.role !== UserRole.VENDOR || account.status !== UserStatus.ACTIVE || !account.vendorProfile || account.vendorProfile.status !== VendorStatus.APPROVED) return null;
  return { id: account.vendorProfile.id, userId: account.id, email: account.email, businessName: account.vendorProfile.businessName, registeredPhone: account.phone, payoutPhone: account.vendorProfile.payoutPhone, payoutNetwork: account.vendorProfile.payoutNetwork, payoutPhoneVerifiedAt: account.vendorProfile.payoutPhoneVerifiedAt };
}

async function getBalances(vendorId: string) {
  const [earnings, payouts] = await Promise.all([
    prisma.vendorOrder.aggregate({
      where: { vendorId, order: { paymentMethod: "WALLET", paymentStatus: PaymentStatus.SUCCEEDED } },
      _sum: { vendorEarning: true },
    }),
    prisma.payout.aggregate({
      where: { vendorId, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED] } },
      _sum: { amount: true },
    }),
  ]);
  const earned = Number(earnings._sum.vendorEarning ?? 0);
  const reserved = Number(payouts._sum.amount ?? 0);
  return { earned, withdrawnAndReserved: reserved, available: Math.max(0, earned - reserved) };
}

export async function GET() {
  const vendor = await getVendor();
  if (!vendor) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });
  try {
    const [balances, payouts] = await Promise.all([
      getBalances(vendor.id),
      prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    ]);
    return Response.json({
      ...balances,
      registeredPhone: vendor.registeredPhone,
      alternatePhone: vendor.payoutPhoneVerifiedAt ? { phone: vendor.payoutPhone, network: vendor.payoutNetwork } : null,
      payouts: payouts.map((payout) => ({ id: payout.id, reference: payout.reference, amount: Number(payout.amount), fee: Number(payout.feeAmount), netAmount: Number(payout.netAmount), status: payout.status, destinationNumber: payout.destinationNumber, destinationNetwork: payout.destinationNetwork, createdAt: payout.createdAt })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Vendor payout details could not be loaded.", error);
    return Response.json({ error: "Your vendor balance could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const vendor = await getVendor();
  if (!vendor) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });
  const payoutLimit = await hitRateLimit("vendorPayment", rateLimitKey("vendor-payout", vendor.id));
  if (!payoutLimit.ok) {
    return rateLimitResponse(
      payoutLimit.retryAfterSeconds,
      "You have made too many payout requests. Please wait and try again.",
    );
  }
  let input: unknown;
  try { input = await readJsonBody(request, 4096); }
  catch (error) { return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 }); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });

  try {
    const data = parsed.data;
    if (data.action === "send_phone_code") {
      if (!isGmailConfigured()) return Response.json({ error: "Email verification is not configured." }, { status: 503 });
      if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET.length < 32) return Response.json({ error: "Email verification is not configured." }, { status: 503 });
      const existing = await prisma.vendorPayoutPhoneCode.findUnique({ where: { vendorId: vendor.id } });
      if (existing && !existing.usedAt && Date.now() - existing.createdAt.getTime() < 60_000) return Response.json({ error: "Wait one minute before requesting another code." }, { status: 429 });
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await prisma.vendorPayoutPhoneCode.upsert({
        where: { vendorId: vendor.id },
        create: { vendorId: vendor.id, phone: data.phone, network: data.network, codeHash: codeHash(vendor.id, code), expiresAt: new Date(Date.now() + codeLifetimeMs) },
        update: { phone: data.phone, network: data.network, codeHash: codeHash(vendor.id, code), expiresAt: new Date(Date.now() + codeLifetimeMs), attempts: 0, usedAt: null, createdAt: new Date() },
      });
      try { await sendPayoutPhoneVerificationCode(vendor.email, code); }
      catch (error) {
        await prisma.vendorPayoutPhoneCode.updateMany({ where: { vendorId: vendor.id, usedAt: null }, data: { usedAt: new Date() } });
        console.error("Vendor payout verification email could not be sent.", error);
        return Response.json({ error: "We could not send the confirmation email. Please try again later." }, { status: 503 });
      }
      return Response.json({ ok: true, message: "A confirmation code was sent to your account email." });
    }

    if (data.action === "verify_phone") {
      const record = await prisma.vendorPayoutPhoneCode.findUnique({ where: { vendorId: vendor.id } });
      if (!record || record.usedAt || record.expiresAt < new Date() || record.attempts >= maxAttempts) return Response.json({ error: "This code has expired. Request a new one." }, { status: 400 });
      if (!secureEqual(vendor.id, data.code, record.codeHash)) {
        await prisma.vendorPayoutPhoneCode.update({ where: { vendorId: vendor.id }, data: { attempts: { increment: 1 } } });
        return Response.json({ error: "That confirmation code is not correct." }, { status: 400 });
      }
      await prisma.$transaction([
        prisma.vendorProfile.update({ where: { id: vendor.id }, data: { payoutPhone: record.phone, payoutNetwork: record.network, payoutPhoneVerifiedAt: new Date() } }),
        prisma.vendorPayoutPhoneCode.update({ where: { vendorId: vendor.id }, data: { usedAt: new Date() } }),
      ]);
      return Response.json({ ok: true, message: "Your alternate withdrawal number is verified." });
    }

    const phone = data.destination === "REGISTERED" ? vendor.registeredPhone : vendor.payoutPhone;
    const network = data.destination === "REGISTERED" ? data.network : vendor.payoutNetwork;
    if (!phone || !network || (data.destination === "ALTERNATE" && !vendor.payoutPhoneVerifiedAt)) return Response.json({ error: "Add and verify a mobile money number before requesting this withdrawal." }, { status: 400 });
    const amountCents = Math.round(data.amount * 100);
    const feeCents = Math.round(amountCents * 0.01);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents <= feeCents) return Response.json({ error: "Enter a withdrawal amount greater than the 1% fee." }, { status: 400 });
    const amount = new Prisma.Decimal((amountCents / 100).toFixed(2));
    const fee = new Prisma.Decimal((feeCents / 100).toFixed(2));
    const net = new Prisma.Decimal(((amountCents - feeCents) / 100).toFixed(2));
    const payout = await prisma.$transaction(async (transaction) => {
      const earnings = await transaction.vendorOrder.aggregate({ where: { vendorId: vendor.id, order: { paymentMethod: "WALLET", paymentStatus: PaymentStatus.SUCCEEDED } }, _sum: { vendorEarning: true } });
      const reserved = await transaction.payout.aggregate({ where: { vendorId: vendor.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.SUCCEEDED] } }, _sum: { amount: true } });
      const available = Number(earnings._sum.vendorEarning ?? 0) - Number(reserved._sum.amount ?? 0);
      if (amountCents > Math.round(available * 100)) throw new PayoutRequestError("The requested amount is more than your available balance.", 409);
      return transaction.payout.create({ data: { vendorId: vendor.id, reference: `PO-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`, amount, feeAmount: fee, netAmount: net, destinationNumber: phone, destinationNetwork: network, status: PaymentStatus.PENDING }, select: { reference: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    after(async () => {
      try {
        await notify({
          audience: "VENDOR",
          userId: null,
          category: "PAYOUT",
          event: "vendor.payout_requested",
          title: `Withdrawal ${payout.reference} submitted`,
          body: "Your withdrawal request is queued for the next processing window.",
          href: "/vendor-dashboard",
          email: {
            event: "vendor.payout_requested",
            to: vendor.email,
            context: { reference: payout.reference, amount: Number(amount), destination: `${phone} (${network})` },
            idempotencyParts: [payout.reference],
          },
        });
        if (adminEmail) {
          await notifyAdmins({
            event: "admin.payout_requested",
            emailEvent: "admin.payout_requested",
            category: "PAYOUT",
            title: `Withdrawal request ${payout.reference}`,
            body: `${vendor.businessName} requested GHS ${Number(amount).toFixed(2)}.`,
            href: "/admin",
            context: {
              businessName: vendor.businessName,
              reference: payout.reference,
              amount: Number(amount),
              destination: `${phone} (${network})`,
            },
            idempotencyParts: [payout.reference],
            toggle: "adminPayoutAlerts",
          });
        }
      } catch (error) {
        console.error("Withdrawal notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
      }
    });
    return Response.json({ ok: true, message: "Withdrawal request queued for the next daily processing window (6:00 AM–12:00 PM Ghana time).", reference: payout.reference, fee: Number(fee), netAmount: Number(net) }, { status: 201 });
  } catch (error) {
    if (error instanceof PayoutRequestError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return Response.json({ error: "Your balance changed. Refresh and try again." }, { status: 409 });
    console.error("Vendor payout request could not be processed.", error);
    return Response.json({ error: "Your withdrawal request could not be processed." }, { status: 503 });
  }
}

class PayoutRequestError extends Error { constructor(message: string, readonly status: number) { super(message); } }
