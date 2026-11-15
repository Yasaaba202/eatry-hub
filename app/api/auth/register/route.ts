import { Prisma, UserRole } from "@prisma/client";
import { after } from "next/server";
import { z } from "zod";
import { hashPassword, setAccountSessionCookie } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { createEmailVerificationToken, verificationLink } from "@/lib/email-verification";
import { notify } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const registrationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(1024),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  let input: unknown;
  try {
    input = await readJsonBody(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }

  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: "Enter your name, a valid email, and a password of at least 8 characters." },
      { status: 400 },
    );
  }
  if (!process.env.AUTH_SESSION_SECRET || process.env.AUTH_SESSION_SECRET.length < 32) {
    return Response.json(
      { error: "Account registration is not configured on this server." },
      { status: 503 },
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        fullName: parsed.data.fullName,
        email: parsed.data.email.toLowerCase(),
        passwordHash: await hashPassword(parsed.data.password),
        role: UserRole.CUSTOMER,
        customerProfile: { create: {} },
        wallet: { create: {} },
      },
      select: { id: true, email: true, fullName: true },
    });
    await setAccountSessionCookie(user.id, UserRole.CUSTOMER);
    const verifyUrl = verificationLink(await createEmailVerificationToken(user.id));
    after(async () => {
      try {
        await notify({
          audience: "CUSTOMER",
          userId: user.id,
          category: "ACCOUNT",
          event: "customer.registered",
          title: "Welcome to Eatry Hub",
          body: "Confirm your email address to receive order updates and payment receipts.",
          href: "/customer-dashboard",
          email: {
            event: "customer.welcome",
            to: user.email,
            toUserId: user.id,
            context: { recipientName: user.fullName, verifyUrl },
            idempotencyParts: [user.id],
          },
        });
      } catch (error) {
        console.error("Welcome email could not be queued.", error instanceof Error ? error.name : "Unknown error");
      }
    });
    return Response.json({ ok: true, userId: user.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Customer registration database connection failed.", error);
      return Response.json(
        { error: "The account database is unavailable. Start PostgreSQL and check DATABASE_URL in .env.local." },
        { status: 503 },
      );
    }
    console.error("Customer registration failed.", error);
    return Response.json(
      { error: "Account registration is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
