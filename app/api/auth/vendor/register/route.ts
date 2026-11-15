import { Prisma, SubscriptionStatus, UserRole, VendorStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { hashPassword, setAccountSessionCookie } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { createEmailVerificationToken, verificationLink } from "@/lib/email-verification";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const vendorRegistrationSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name (at least 2 characters).").max(120, "Full name must be 120 characters or fewer."),
  businessName: z.string().trim().min(2, "Enter a business name (at least 2 characters).").max(120, "Business name must be 120 characters or fewer."),
  email: z.string().trim().email("Enter a valid email address.").max(254, "Email address is too long."),
  phone: z.string().trim().min(7, "Enter a phone number with at least 7 characters.").max(32, "Phone number must be 32 characters or fewer."),
  location: z.string().trim().min(2, "Enter your business location.").max(160, "Business location must be 160 characters or fewer."),
  description: z.string().trim().min(10, "Business description must be at least 10 characters.").max(2000, "Business description must be 2000 characters or fewer."),
  category: z.enum(["Ghanaian & Grill", "Healthy Bowls", "Asian Fusion", "Bakery"], {
    error: "Choose a food category.",
  }),
  hours: z.string().trim()
    .regex(/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/, "Enter business hours as HH:MM - HH:MM, for example 08:00 - 22:00.")
    .refine((value) => {
      if (!/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(value)) return true;
      return value.split("-").every((part) => {
        const [hours, minutes] = part.trim().split(":").map(Number);
        return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
      });
    }, "Business hours must use valid 24-hour times."),
  subscriptionPlan: z.enum(["Starter", "Growth", "Enterprise"], {
    error: "Choose a subscription plan.",
  }),
  password: z.string().min(8, "Password must be at least 8 characters.").max(1024, "Password is too long."),
  confirmPassword: z.string().min(8, "Confirm your password using at least 8 characters.").max(1024, "Password confirmation is too long."),
}).refine((value) => value.password === value.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});

const subscriptionPrices = {
  Starter: 90,
  Growth: 180,
  Enterprise: 320,
} satisfies Record<z.infer<typeof vendorRegistrationSchema>["subscriptionPlan"], number>;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  let input: unknown;
  try {
    input = await readJsonBody(request, 16384);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }

  const parsed = vendorRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues.map((issue) => issue.message).join(" ") },
      { status: 400 },
    );
  }
  if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET.length < 32) {
    return Response.json(
      { error: "Vendor registration is not configured on this server." },
      { status: 503 },
    );
  }

  const { password, confirmPassword, subscriptionPlan, ...details } = parsed.data;
  void confirmPassword;
  try {
    const passwordHash = await hashPassword(password);
    const categorySlug = slugify(details.category);
    const storeSlug = `${slugify(details.businessName) || "store"}-${randomUUID().slice(0, 8)}`;
    const [openingTime, closingTime] = details.hours.split("-").map((part) => part.trim());

    const vendor = await prisma.$transaction(async (transaction) => {
      const plan = await transaction.subscriptionPlan.upsert({
        where: { name: subscriptionPlan },
        create: {
          name: subscriptionPlan,
          monthlyPrice: new Prisma.Decimal(subscriptionPrices[subscriptionPlan]),
          durationDays: 30,
          features: [],
        },
        update: {},
        select: { id: true },
      });
      const category = await transaction.category.upsert({
        where: { slug: categorySlug },
        create: { name: details.category, slug: categorySlug },
        update: {},
      });

      const user = await transaction.user.create({
        data: {
          fullName: details.fullName,
          email: details.email.toLowerCase(),
          phone: details.phone,
          passwordHash,
          role: UserRole.VENDOR,
          vendorProfile: {
            create: {
              businessName: details.businessName,
              businessPhone: details.phone,
              location: details.location,
              description: details.description,
              categoryId: category.id,
              status: VendorStatus.AWAITING_PAYMENT,
              openingTime,
              closingTime,
              subscriptions: {
                create: {
                  planId: plan.id,
                  status: SubscriptionStatus.PENDING_PAYMENT,
                },
              },
              restaurant: {
                create: {
                  slug: storeSlug,
                  name: details.businessName,
                  description: details.description,
                  location: details.location,
                  categoryId: category.id,
                  openingTime,
                  closingTime,
                  isVisible: false,
                },
              },
              applications: {
                create: {
                  businessName: details.businessName,
                  businessAddress: details.location,
                  status: VendorStatus.AWAITING_PAYMENT,
                },
              },
            },
          },
        },
        select: { id: true, email: true, fullName: true },
      });
      return user;
    });

    await setAccountSessionCookie(vendor.id, UserRole.VENDOR);
    const verifyUrl = verificationLink(await createEmailVerificationToken(vendor.id));
    after(async () => {
      try {
        await notify({
          audience: "VENDOR",
          userId: vendor.id,
          category: "ACCOUNT",
          event: "vendor.registered",
          title: "Welcome to Eatry Hub",
          body: "Confirm your email address and submit your subscription payment to activate your store.",
          href: "/vendor-dashboard",
          email: {
            event: "vendor.welcome",
            to: vendor.email,
            toUserId: vendor.id,
            context: { recipientName: vendor.fullName, businessName: details.businessName, verifyUrl },
            idempotencyParts: [vendor.id],
          },
        });
      } catch (error) {
        console.error("Vendor welcome email could not be queued.", error instanceof Error ? error.name : "Unknown error");
      }
    });
    return Response.json(
      {
        ok: true,
        userId: vendor.id,
        message: "Your vendor account, application, and selected plan are saved. No payment was taken. Your dashboard is ready.",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target : [target];
      if (fields.some((field) => field === "email" || field === "phone")) {
        return Response.json(
          { error: "An account with that email or phone number already exists." },
          { status: 409 },
        );
      }
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Vendor registration database connection failed.", error);
      return Response.json(
        { error: "The account database is unavailable. Start PostgreSQL and check DATABASE_URL in .env.local." },
        { status: 503 },
      );
    }
    console.error("Vendor registration failed.", error);
    return Response.json(
      { error: "Vendor registration is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
