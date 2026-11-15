import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeRetryDelaySeconds, isValidEmail, normalizeEmail } from "@/lib/email/core";
import { deliverEmail, describeDeliveryError, isEmailConfigured } from "@/lib/email/smtp";

export type EmailClient = Prisma.TransactionClient | PrismaClient;

export type EnqueueEmailInput = {
  audience: "CUSTOMER" | "VENDOR" | "ADMIN";
  category: "TRANSACTIONAL" | "SECURITY" | "MARKETING";
  event: string;
  to: string;
  toUserId?: string | null;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  relatedType?: string | null;
  relatedId?: string | null;
  scheduledAt?: Date;
};

export type EnqueueResult = { id: string; replayed: boolean };

export async function enqueueEmail(
  input: EnqueueEmailInput,
  client: EmailClient = prisma,
): Promise<EnqueueResult> {
  const to = normalizeEmail(input.to);
  const existing = await client.emailMessage.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (existing) return { id: existing.id, replayed: true };

  const created = await client.emailMessage.create({
    data: {
      audience: input.audience,
      category: input.category,
      event: input.event,
      toEmail: to,
      toUserId: input.toUserId ?? null,
      subject: input.subject,
      textBody: input.text,
      htmlBody: input.html,
      status: isValidEmail(to) ? "QUEUED" : "FAILED",
      lastError: isValidEmail(to) ? null : "Invalid recipient email address.",
      idempotencyKey: input.idempotencyKey,
      relatedType: input.relatedType ?? null,
      relatedId: input.relatedId ?? null,
      scheduledAt: input.scheduledAt ?? new Date(),
    },
    select: { id: true },
  });

  return { id: created.id, replayed: false };
}

export async function enqueueMany(
  inputs: EnqueueEmailInput[],
  client: EmailClient = prisma,
): Promise<number> {
  let queued = 0;
  for (const input of inputs) {
    try {
      const result = await enqueueEmail(input, client);
      if (!result.replayed) queued += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  return queued;
}

export async function drainEmailQueue(limit = 10): Promise<{ sent: number; failed: number; retried: number }> {
  if (!isEmailConfigured()) {
    const stuck = await prisma.emailMessage.updateMany({
      where: { status: { in: ["QUEUED", "SENDING"] } },
      data: { status: "FAILED", lastError: "Gmail SMTP is not configured." },
    });
    return { sent: 0, failed: stuck.count, retried: 0 };
  }

  const due = await prisma.emailMessage.findMany({
    where: { status: "QUEUED", scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true, toEmail: true, subject: true, textBody: true, htmlBody: true, attempts: true, maxAttempts: true },
  });

  let sent = 0;
  let failed = 0;
  let retried = 0;

  for (const row of due) {
    const claimed = await prisma.emailMessage.updateMany({
      where: { id: row.id, status: "QUEUED" },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;

    try {
      const messageId = await deliverEmail({
        to: row.toEmail,
        subject: row.subject,
        text: row.textBody,
        html: row.htmlBody,
      });
      await prisma.emailMessage.update({
        where: { id: row.id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: messageId, lastError: null },
      });
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      const exhausted = attempts >= row.maxAttempts;
      await prisma.emailMessage.update({
        where: { id: row.id },
        data: {
          status: exhausted ? "FAILED" : "QUEUED",
          lastError: describeDeliveryError(error),
          scheduledAt: exhausted ? new Date() : new Date(Date.now() + computeRetryDelaySeconds(attempts) * 1000),
        },
      });
      if (exhausted) failed += 1;
      else retried += 1;
    }
  }

  return { sent, failed, retried };
}

export function scheduleEmailDrain(): void {
  after(async () => {
    try {
      await drainEmailQueue(5);
    } catch (error) {
      console.error("Email queue drain failed.", error instanceof Error ? error.name : "Unknown error");
    }
  });
}

export async function retryEmailMessage(id: string): Promise<boolean> {
  const updated = await prisma.emailMessage.updateMany({
    where: { id, status: "FAILED" },
    data: { status: "QUEUED", attempts: 0, lastError: null, scheduledAt: new Date() },
  });
  if (updated.count === 1) scheduleEmailDrain();
  return updated.count === 1;
}

export async function retryAllFailedEmails(): Promise<number> {
  const updated = await prisma.emailMessage.updateMany({
    where: { status: "FAILED" },
    data: { status: "QUEUED", attempts: 0, lastError: null, scheduledAt: new Date() },
  });
  if (updated.count > 0) scheduleEmailDrain();
  return updated.count;
}