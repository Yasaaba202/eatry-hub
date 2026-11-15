import { PaymentPurpose, PaymentProvider, PaymentStatus, Prisma, UserRole, VendorStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { beginIdempotency, hashIdempotencyRequest } from "@/lib/idempotency";
import { prisma } from "@/lib/prisma";
import { hitRateLimit, rateLimitKey, rateLimitResponse } from "@/lib/rate-limit";

const paymentSubmissionSchema = z.object({
  transactionId: z.string().trim().min(3, "Enter the transaction ID from your mobile-money receipt.").max(100),
  senderMobileNumber: z.string().trim().min(7, "Enter the mobile-money number the payment was sent from.").max(32),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const account = await getCurrentAccount();
  if (!account || account.role !== UserRole.VENDOR || !account.vendorProfile) {
    return Response.json({ error: "Sign in with your vendor account to submit payment details." }, { status: 401 });
  }
  if (account.vendorProfile.status !== VendorStatus.AWAITING_PAYMENT) {
    return Response.json({ error: "Payment details can only be submitted while your application awaits payment." }, { status: 409 });
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

  const parsed = paymentSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((issue) => issue.message).join(" ") },
      { status: 400 },
    );
  }

  const paymentLimit = await hitRateLimit("vendorPayment", rateLimitKey("vendor-payment", account.id));
  if (!paymentLimit.ok) {
    return rateLimitResponse(
      paymentLimit.retryAfterSeconds,
      "You have submitted too many payment attempts. Please wait and try again.",
    );
  }

  const idempotency = await beginIdempotency({
    request,
    scope: "vendor-subscription-payment",
    actorKey: account.id,
    requestHash: hashIdempotencyRequest(parsed.data),
  });
  if (idempotency.replay) return idempotency.replay;

  try {
    const application = await prisma.vendorApplication.findFirst({
      where: { vendorId: account.vendorProfile.id },
      orderBy: { submittedAt: "desc" },
      include: {
        payments: {
          where: { purpose: PaymentPurpose.VENDOR_SUBSCRIPTION, status: PaymentStatus.PENDING },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    const subscription = await prisma.vendorSubscription.findFirst({
      where: { vendorId: account.vendorProfile.id },
      orderBy: { createdAt: "desc" },
      include: { plan: { select: { monthlyPrice: true } } },
    });

    if (!application || !subscription) {
      return Response.json({ error: "Your vendor application or subscription plan could not be found. Contact support." }, { status: 409 });
    }

    const existingPendingPayment = application.payments[0];
    if (existingPendingPayment) {
      await prisma.payment.update({
        where: { id: existingPendingPayment.id },
        data: {
          providerReference: parsed.data.transactionId,
          senderMobileNumber: parsed.data.senderMobileNumber,
        },
      });
    } else {
      await prisma.payment.create({
        data: {
          reference: `VENDOR-MOMO-${randomUUID()}`,
          providerReference: parsed.data.transactionId,
          senderMobileNumber: parsed.data.senderMobileNumber,
          provider: PaymentProvider.MANUAL,
          purpose: PaymentPurpose.VENDOR_SUBSCRIPTION,
          status: PaymentStatus.PENDING,
          amount: subscription.plan.monthlyPrice,
          currency: "GHS",
          userId: account.id,
          applicationId: application.id,
        },
      });
    }

    const responseBody = {
      ok: true,
      message: "Payment details submitted. Your store will remain hidden until an administrator verifies the payment and approves your application.",
    };
    await idempotency.complete({ status: 201, body: responseBody });
    return Response.json(responseBody, { status: 201 });
  } catch (error) {
    await idempotency.fail();
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That transaction ID has already been submitted. Check the ID or contact support." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Vendor payment submission database connection failed.", error);
      return Response.json({ error: "The account database is unavailable. Try again later." }, { status: 503 });
    }
    console.error("Vendor payment submission failed.", error);
    return Response.json({ error: "Payment details could not be submitted. Please try again later." }, { status: 503 });
  }
}
