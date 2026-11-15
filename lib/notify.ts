import "server-only";

import { Prisma, PrismaClient, type NotificationCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/email/base-url";
import { buildEventEmail, idempotencyKeyFor, type EmailContext } from "@/lib/email/events";
import { enqueueEmail, scheduleEmailDrain, type EmailClient } from "@/lib/email/queue";

type Client = Prisma.TransactionClient | PrismaClient;

export type NotifyInput = {
  client?: Client;
  audience: "CUSTOMER" | "VENDOR" | "ADMIN";
  userId?: string | null;
  category: NotificationCategory;
  event: string;
  title: string;
  body: string;
  href?: string;
  meta?: Prisma.InputJsonValue;
  email?: {
    event: string;
    to: string;
    toUserId?: string | null;
    category?: "TRANSACTIONAL" | "SECURITY" | "MARKETING";
    context: Omit<EmailContext, "baseUrl">;
    idempotencyParts: Array<string | number>;
    relatedType?: string;
    relatedId?: string;
    scheduledAt?: Date;
  };
};

export async function notify(input: NotifyInput): Promise<{ notificationId?: string; emailId?: string }> {
  const client = input.client ?? prisma;
  let emailId: string | undefined;

  if (input.email) {
    const content = buildEventEmail(input.email.event, {
      baseUrl: getBaseUrl(),
      ...input.email.context,
    });
    const enqueued = await enqueueEmail(
      {
        audience: input.audience,
        category: input.email.category ?? "TRANSACTIONAL",
        event: input.email.event,
        to: input.email.to,
        toUserId: input.email.toUserId ?? input.userId ?? null,
        subject: content.subject,
        text: content.text,
        html: content.html,
        idempotencyKey: idempotencyKeyFor(input.email.event, ...input.email.idempotencyParts),
        relatedType: input.email.relatedType ?? null,
        relatedId: input.email.relatedId ?? null,
        scheduledAt: input.email.scheduledAt,
      },
      client as EmailClient,
    );
    emailId = enqueued.id;
  }

  const notification = input.audience === "ADMIN" || input.userId
    ? await client.notification.create({
      data: {
        userId: input.audience === "ADMIN" ? null : input.userId ?? null,
        audience: input.audience,
        category: input.category,
        event: input.event,
        title: input.title,
        body: input.body,
        href: input.href,
        meta: input.meta,
        emailMessageId: emailId ?? null,
      },
      select: { id: true },
    })
    : null;

  if (emailId) scheduleEmailDrain();

  return { notificationId: notification?.id, emailId };
}

export async function getAdminEmailSettings(): Promise<{
  adminOrderAlerts: boolean;
  adminPaymentAlerts: boolean;
  adminPayoutAlerts: boolean;
  adminVendorAlerts: boolean;
  adminSystemAlerts: boolean;
  recipients: string[];
}> {
  const [settings, recipientsSetting] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: "notification_settings" }, select: { value: true } }),
    prisma.platformSetting.findUnique({ where: { key: "notification_admin_emails" }, select: { value: true } }),
  ]);

  const raw = (settings?.value ?? {}) as Record<string, unknown>;
  const storedRecipients = Array.isArray(recipientsSetting?.value)
    ? (recipientsSetting!.value as unknown[]).filter((value): value is string => typeof value === "string" && value.includes("@"))
    : [];
  const envAdmin = process.env.ADMIN_EMAIL?.trim();
  const recipients = Array.from(new Set([envAdmin, ...storedRecipients].filter((value): value is string => Boolean(value))));

  return {
    adminOrderAlerts: raw.adminOrderAlerts !== false,
    adminPaymentAlerts: raw.adminPaymentAlerts !== false,
    adminPayoutAlerts: raw.adminPayoutAlerts !== false,
    adminVendorAlerts: raw.adminVendorAlerts !== false,
    adminSystemAlerts: raw.adminSystemAlerts !== false,
    recipients,
  };
}

export type AdminAlertInput = {
  event: string;
  emailEvent?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href?: string;
  context?: Omit<EmailContext, "baseUrl">;
  idempotencyParts: Array<string | number>;
  toggle?: "adminOrderAlerts" | "adminPaymentAlerts" | "adminPayoutAlerts" | "adminVendorAlerts" | "adminSystemAlerts";
};

export async function notifyAdmins(input: AdminAlertInput): Promise<void> {
  try {
    const settings = await getAdminEmailSettings();
    if (input.toggle && !settings[input.toggle]) return;

    await prisma.notification.create({
      data: {
        userId: null,
        audience: "ADMIN",
        category: input.category,
        event: input.event,
        title: input.title,
        body: input.body,
        href: input.href,
      },
    });

    const emailEvent = input.emailEvent;
    if (!emailEvent || !input.context || settings.recipients.length === 0) return;

    const content = buildEventEmail(emailEvent, { baseUrl: getBaseUrl(), ...input.context });
    for (const recipient of settings.recipients) {
      await enqueueEmail({
        audience: "ADMIN",
        category: "TRANSACTIONAL",
        event: emailEvent,
        to: recipient,
        subject: content.subject,
        text: content.text,
        html: content.html,
        idempotencyKey: idempotencyKeyFor(emailEvent, ...input.idempotencyParts, recipient),
      });
    }
    scheduleEmailDrain();
  } catch (error) {
    console.error("Admin notification could not be recorded.", error instanceof Error ? error.name : "Unknown error");
  }
}

export async function getNotificationSettings(userId: string) {
  const preference = await prisma.notificationPreference.findUnique({ where: { userId }, select: { orderUpdates: true, walletUpdates: true, payoutUpdates: true, newMeals: true, promotions: true } });
  return preference ?? { orderUpdates: true, walletUpdates: true, payoutUpdates: true, newMeals: false, promotions: false };
}