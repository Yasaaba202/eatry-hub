import { z } from "zod";
import {
  getClientKeyFromHeaders,
  hitRateLimit,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  getLegacyTrackingCutoff,
  issueOrderTrackingToken,
  readOrderTrackingToken,
} from "@/lib/order-tracking-token";
import { isLegacyTrackingAllowed } from "@/lib/security/tracking-token-core";

const querySchema = z.object({
  token: z.string().trim().min(20).max(512).optional(),
  orderNumber: z.string().trim().min(6).max(40).optional(),
  phone: z.string().trim().min(7).max(32).optional(),
});

const orderSelection = {
  id: true,
  orderNumber: true,
  guestName: true,
  status: true,
  paymentStatus: true,
  paymentMethod: true,
  total: true,
  currency: true,
  createdAt: true,
  vendorOrders: {
    select: {
      status: true,
      restaurant: { select: { name: true } },
    },
  },
  tracking: {
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { status: true, note: true, createdAt: true },
  },
} as const;

type OrderRecord = {
  id: string;
  orderNumber: string;
  guestName: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: unknown;
  currency: string;
  createdAt: Date;
  vendorOrders: Array<{ status: string; restaurant: { name: string } }>;
  tracking: Array<{ status: string; note: string | null; createdAt: Date }>;
};

function serializeOrder(order: OrderRecord) {
  return {
    order: {
      orderNumber: order.orderNumber,
      customerName: order.guestName ?? "Customer",
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: Number(order.total),
      currency: order.currency,
      createdAt: order.createdAt,
      vendors: order.vendorOrders.map((vendorOrder) => ({
        name: vendorOrder.restaurant.name,
        status: vendorOrder.status,
      })),
      updates: order.tracking.map((update) => ({
        status: update.status,
        note: update.note,
        createdAt: update.createdAt,
      })),
    },
  };
}

export async function GET(request: Request) {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const limit = await hitRateLimit("tracking", rateLimitKey("tracking", clientKey));
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSeconds, "Too many tracking requests. Please wait a minute and try again.");
  }

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Enter the order number and phone used at checkout, or use your secure tracking link." },
      { status: 400 },
    );
  }

  try {
    if (parsed.data.token) {
      const claims = readOrderTrackingToken(parsed.data.token);
      if (!claims) {
        return Response.json({ error: "This tracking link is invalid or has expired." }, { status: 401 });
      }
      const order = await prisma.order.findUnique({
        where: { id: claims.orderId },
        select: orderSelection,
      });
      if (!order) {
        return Response.json({ error: "We could not find that order." }, { status: 404 });
      }
      return Response.json(
        {
          ...serializeOrder(order as OrderRecord),
          trackingToken: parsed.data.token,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!parsed.data.orderNumber || !parsed.data.phone) {
      return Response.json(
        { error: "Enter the order number and phone used at checkout, or use your secure tracking link." },
        { status: 400 },
      );
    }

    const order = await prisma.order.findFirst({
      where: {
        orderNumber: parsed.data.orderNumber,
        guestPhone: parsed.data.phone,
      },
      select: orderSelection,
    });
    if (!order) {
      return Response.json({ error: "We could not find an order matching those details." }, { status: 404 });
    }

    const legacyAllowed = isLegacyTrackingAllowed(
      (order as OrderRecord).createdAt,
      getLegacyTrackingCutoff(),
    );
    if (!legacyAllowed) {
      return Response.json(
        { error: "Order-number tracking is no longer available for this order. Use the secure tracking link from your confirmation." },
        { status: 410 },
      );
    }

    return Response.json(
      {
        ...serializeOrder(order as OrderRecord),
        trackingToken: issueOrderTrackingToken((order as OrderRecord).id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Order tracking lookup failed.", error);
    return Response.json({ error: "Order tracking is temporarily unavailable." }, { status: 503 });
  }
}