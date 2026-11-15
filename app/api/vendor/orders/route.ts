import {
  OrderStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
  VendorStatus,
} from "@prisma/client";
import { z } from "zod";
import { after } from "next/server";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { notify, notifyAdmins } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  vendorOrderId: z.string().min(1),
  status: z.nativeEnum(OrderStatus),
});

const statusRank: Partial<Record<OrderStatus, number>> = {
  [OrderStatus.ORDER_PLACED]: 0,
  [OrderStatus.PAYMENT_CONFIRMED]: 0,
  [OrderStatus.ORDER_ACCEPTED]: 1,
  [OrderStatus.PREPARING]: 2,
  [OrderStatus.READY_FOR_PICKUP]: 3,
  [OrderStatus.OUT_FOR_DELIVERY]: 3,
  [OrderStatus.PICKED_UP]: 4,
  [OrderStatus.DELIVERED]: 4,
  [OrderStatus.COMPLETED]: 5,
};

async function getApprovedVendor() {
  const account = await getCurrentAccount();
  if (
    !account ||
    account.role !== UserRole.VENDOR ||
    account.status !== UserStatus.ACTIVE ||
    !account.vendorProfile ||
    account.vendorProfile.status !== VendorStatus.APPROVED
  ) return null;

  const restaurant = await prisma.restaurant.findUnique({
    where: { vendorId: account.vendorProfile.id },
    select: { id: true },
  });
  return restaurant
    ? { userId: account.id, vendorId: account.vendorProfile.id, restaurantId: restaurant.id }
    : null;
}

export async function GET() {
  const vendor = await getApprovedVendor();
  if (!vendor) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });

  try {
    const orders = await prisma.vendorOrder.findMany({
      where: { vendorId: vendor.vendorId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        subtotal: true,
        createdAt: true,
        order: {
          select: {
            orderNumber: true,
            guestName: true,
            guestPhone: true,
            deliveryAddress: true,
            fulfillmentType: true,
            paymentMethod: true,
            paymentStatus: true,
            total: true,
            deliveryFee: true,
            deliveryFeePayment: true,
            currency: true,
            customer: { select: { fullName: true } },
          },
        },
        items: {
          select: {
            nameSnapshot: true,
            quantity: true,
            price: true,
            lineTotal: true,
          },
        },
      },
    });

    return Response.json({
      orders: orders.map((vendorOrder) => ({
        id: vendorOrder.id,
        status: vendorOrder.status,
        subtotal: Number(vendorOrder.subtotal),
        createdAt: vendorOrder.createdAt,
        orderNumber: vendorOrder.order.orderNumber,
        customerName: vendorOrder.order.customer?.fullName ?? vendorOrder.order.guestName ?? "Customer",
        customerPhone: vendorOrder.order.guestPhone,
        deliveryAddress: vendorOrder.order.deliveryAddress,
        fulfillmentType: vendorOrder.order.fulfillmentType,
        paymentMethod: vendorOrder.order.paymentMethod,
        paymentStatus: vendorOrder.order.paymentStatus,
        orderTotal: Number(vendorOrder.order.total),
        deliveryFee: Number(vendorOrder.order.deliveryFee),
        deliveryFeePayment: vendorOrder.order.deliveryFeePayment,
        currency: vendorOrder.order.currency,
        items: vendorOrder.items.map((item) => ({
          name: item.nameSnapshot,
          quantity: item.quantity,
          price: Number(item.price),
          total: Number(item.lineTotal),
        })),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Vendor orders could not be loaded.", error);
    return Response.json({ error: "Customer orders could not be loaded." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const vendor = await getApprovedVendor();
  if (!vendor) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });

  let input: unknown;
  try {
    input = await readJsonBody(request, 4096);
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const vendorOrder = await transaction.vendorOrder.findFirst({
        where: { id: parsed.data.vendorOrderId, vendorId: vendor.vendorId },
        select: {
          id: true,
          orderId: true,
          status: true,
          order: {
            select: {
              status: true,
              orderNumber: true,
              guestName: true,
              guestEmail: true,
              fulfillmentType: true,
              paymentMethod: true,
              paymentStatus: true,
              total: true,
            },
          },
        },
      });
      if (!vendorOrder) throw new VendorOrderError("Order not found for this vendor.", 404);
      if (
        vendorOrder.order.paymentMethod !== "CASH_ON_DELIVERY" &&
        vendorOrder.order.paymentStatus !== PaymentStatus.SUCCEEDED
      ) {
        throw new VendorOrderError("This order is awaiting payment verification and cannot be accepted yet.", 409);
      }

      const validNextStatuses: OrderStatus[] = vendorOrder.status === OrderStatus.ORDER_PLACED
        ? [OrderStatus.ORDER_ACCEPTED]
        : vendorOrder.status === OrderStatus.ORDER_ACCEPTED
          ? [OrderStatus.PREPARING]
          : vendorOrder.status === OrderStatus.PREPARING
            ? vendorOrder.order.fulfillmentType === "PICKUP"
              ? [OrderStatus.READY_FOR_PICKUP]
              : [OrderStatus.OUT_FOR_DELIVERY]
            : vendorOrder.status === OrderStatus.READY_FOR_PICKUP
              ? [OrderStatus.PICKED_UP]
              : vendorOrder.status === OrderStatus.PICKED_UP || vendorOrder.status === OrderStatus.DELIVERED
                ? [OrderStatus.COMPLETED]
                : vendorOrder.status === OrderStatus.OUT_FOR_DELIVERY
                  ? [OrderStatus.DELIVERED]
                  : [];

      if (!validNextStatuses.includes(parsed.data.status)) {
        throw new VendorOrderError("That status change is not allowed from the order's current status.", 409);
      }

      const changed = await transaction.vendorOrder.updateMany({
        where: { id: vendorOrder.id, vendorId: vendor.vendorId, status: vendorOrder.status },
        data: { status: parsed.data.status },
      });
      if (changed.count !== 1) throw new VendorOrderError("This order changed while you were updating it. Refresh and try again.", 409);

      await transaction.orderTracking.create({
        data: {
          orderId: vendorOrder.orderId,
          vendorOrderId: vendorOrder.id,
          status: parsed.data.status,
          actorId: vendor.userId,
          note: `Vendor updated order to ${parsed.data.status.replaceAll("_", " ").toLowerCase()}.`,
        },
      });

      const siblingOrders = await transaction.vendorOrder.findMany({
        where: { orderId: vendorOrder.orderId },
        select: { status: true },
      });
      const overallStatus = siblingOrders.reduce((slowest, item) =>
        (statusRank[item.status] ?? -1) < (statusRank[slowest] ?? -1) ? item.status : slowest,
      siblingOrders[0]?.status ?? parsed.data.status);
      await transaction.order.update({
        where: { id: vendorOrder.orderId },
        data: { status: overallStatus },
      });

      const shouldEmailCustomer = Boolean(vendorOrder.order.guestEmail);
      return {
        message: parsed.data.status === OrderStatus.ORDER_ACCEPTED ? "Customer order approved." : "Order status updated.",
        customerEmail: shouldEmailCustomer ? vendorOrder.order.guestEmail : null,
        orderId: vendorOrder.orderId,
        orderNumber: vendorOrder.order.orderNumber,
        orderStatus: overallStatus,
        customerName: vendorOrder.order.guestName ?? "Customer",
        paymentMethod: vendorOrder.order.paymentMethod,
        paymentStatus: vendorOrder.order.paymentStatus,
        total: Number(vendorOrder.order.total),
      };
    });

    const customerEmail = result.customerEmail;
    if (customerEmail) {
      after(async () => {
        try {
          await notify({
            audience: "CUSTOMER",
            userId: null,
            category: "ORDER",
            event: "customer.order_status",
            title: `Order ${result.orderNumber}: ${result.orderStatus.replaceAll("_", " ")}`,
            body: `Your order status is now ${result.orderStatus.replaceAll("_", " ").toLowerCase()}.`,
            href: `/order-tracking?order=${encodeURIComponent(result.orderNumber)}`,
            email: {
              event: "customer.order_status",
              to: customerEmail,
              context: {
                order: {
                  orderId: result.orderId,
                  orderNumber: result.orderNumber,
                  customerName: result.customerName,
                  status: result.orderStatus,
                  paymentMethod: result.paymentMethod,
                  paymentStatus: result.paymentStatus,
                  total: result.total,
                },
              },
              idempotencyParts: [result.orderId, result.orderStatus],
            },
          });
        } catch (error) {
          console.error("Customer order status email could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      });

      if (result.orderStatus === OrderStatus.DELIVERED) {
        after(async () => {
          await notifyAdmins({
            event: "admin.order_delivered",
            category: "ORDER",
            title: `Order ${result.orderNumber} delivered`,
            body: `${result.customerName}'s order was marked delivered.`,
            href: "/admin",
            idempotencyParts: [result.orderId],
            toggle: "adminOrderAlerts",
          });
        });
      }
    }

    return Response.json({ ok: true, message: result.message });
  } catch (error) {
    if (error instanceof VendorOrderError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Vendor order status could not be updated.", error);
    return Response.json({ error: "The order status could not be updated." }, { status: 503 });
  }
}

class VendorOrderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
