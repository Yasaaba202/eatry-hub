import { PaymentPurpose, PaymentProvider, PaymentStatus, Prisma, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { beginIdempotency, hashIdempotencyRequest } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { hitRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";
import { notify, notifyAdmins } from "@/lib/notify";

const topUpSchema = z.object({
  amount: z.coerce.number().finite().min(1).max(10000),
  transactionId: z.string().trim().min(3).max(100),
  senderName: z.string().trim().min(2).max(120),
  senderMobileNumber: z.string().trim().min(7).max(32),
  senderNetwork: z.enum(["MTN", "TELECEL"]),
});

export async function GET() {
  const account = await getCurrentAccount();
  if (!account || account.role !== UserRole.CUSTOMER) {
    return Response.json({ error: "Sign in with your customer account to view your wallet." }, { status: 401 });
  }

  try {
    const wallet = await prisma.walletAccount.upsert({
      where: { userId: account.id },
      create: { userId: account.id },
      update: {},
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    const [pendingTopUps, destinationSetting] = await Promise.all([
      prisma.payment.findMany({
      where: {
        userId: account.id,
        purpose: PaymentPurpose.WALLET_TOP_UP,
        status: PaymentStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { amount: true, providerReference: true, createdAt: true },
      }),
      prisma.platformSetting.findUnique({
        where: { key: "mobile_money_destinations" },
        select: { value: true },
      }),
    ]);

    const configuredDestinations = z.object({
      MTN: z.object({ accountName: z.string(), accountNumber: z.string() }),
      TELECEL: z.object({ accountName: z.string(), accountNumber: z.string() }),
    }).safeParse(destinationSetting?.value);

    return Response.json({
      balance: Number(wallet.balance),
      currency: wallet.currency,
      paymentInstructions: {
        destinations: configuredDestinations.success ? configuredDestinations.data : null,
        configured: configuredDestinations.success,
      },
      transactions: wallet.transactions.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        amount: Number(transaction.amount),
        description: transaction.description,
        createdAt: transaction.createdAt,
      })),
      pendingTopUps: pendingTopUps.map((payment) => ({
        amount: Number(payment.amount),
        transactionId: payment.providerReference,
        createdAt: payment.createdAt,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Customer wallet could not be loaded.", error);
    return Response.json({ error: "Your wallet could not be loaded. Please try again." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const account = await getCurrentAccount();
  if (!account || account.role !== UserRole.CUSTOMER) {
    return Response.json({ error: "Sign in with your customer account to request a wallet top-up." }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await readJsonBody(request, 4096);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  const parsed = topUpSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
  }

  const walletLimit = await hitRateLimit("wallet", rateLimitKey("wallet", account.id));
  if (!walletLimit.ok) {
    return rateLimitResponse(
      walletLimit.retryAfterSeconds,
      "You have submitted too many top-up requests. Please wait and try again.",
    );
  }

  const idempotency = await beginIdempotency({
    request,
    scope: "wallet-top-up",
    actorKey: account.id,
    requestHash: hashIdempotencyRequest(parsed.data),
  });
  if (idempotency.replay) return idempotency.replay;

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.walletAccount.upsert({
        where: { userId: account.id },
        create: { userId: account.id },
        update: {},
      });
      await transaction.payment.create({
        data: {
          reference: `WALLET-TOPUP-${randomUUID()}`,
          providerReference: parsed.data.transactionId,
          senderName: parsed.data.senderName,
          senderMobileNumber: parsed.data.senderMobileNumber,
          senderNetwork: parsed.data.senderNetwork,
          provider: PaymentProvider.MANUAL,
          purpose: PaymentPurpose.WALLET_TOP_UP,
          status: PaymentStatus.PENDING,
          amount: new Prisma.Decimal(parsed.data.amount.toFixed(2)),
          currency: "GHS",
          userId: account.id,
        },
      });
    });
    after(async () => {
      try {
        await notify({
          audience: "CUSTOMER",
          userId: account.id,
          category: "WALLET",
          event: "customer.wallet_topup_submitted",
          title: "Wallet top-up submitted",
          body: "We received your mobile money payment. Your wallet will be credited after verification.",
          href: "/customer-dashboard",
          email: {
            event: "customer.wallet_topup_submitted",
            to: account.email,
            toUserId: account.id,
            context: { amount: parsed.data.amount, transactionId: parsed.data.transactionId },
            idempotencyParts: [parsed.data.transactionId],
          },
        });
        await notifyAdmins({
          event: "admin.wallet_topup_submitted",
          emailEvent: "admin.payment_submitted",
          category: "PAYMENT",
          title: "Wallet top-up awaiting verification",
          body: `${account.email} submitted a wallet top-up for GHS ${parsed.data.amount.toFixed(2)}.`,
          href: "/admin",
          context: { transactionId: parsed.data.transactionId, amount: parsed.data.amount, recipientName: account.email },
          idempotencyParts: [parsed.data.transactionId],
          toggle: "adminPaymentAlerts",
        });
      } catch (error) {
        console.error("Wallet top-up notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
      }
    });
    const responseBody = {
      ok: true,
      message: "Top-up submitted for manual verification. Your wallet will be credited only after an administrator confirms the transfer.",
    };
    await idempotency.complete({ status: 201, body: responseBody });
    return Response.json(responseBody, { status: 201 });
  } catch (error) {
    await idempotency.fail();
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This transaction ID has already been submitted." }, { status: 409 });
    }
    console.error("Customer wallet top-up could not be submitted.", error);
    return Response.json({ error: "Your top-up could not be submitted. Please try again." }, { status: 503 });
  }
}
