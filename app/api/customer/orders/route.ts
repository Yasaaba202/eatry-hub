import {
  MealStatus,
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  UserRole,
  UserStatus,
  VendorStatus,
  WalletTransactionType,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { beginIdempotency, hashIdempotencyRequest } from "@/lib/idempotency";
import { issueOrderTrackingToken } from "@/lib/order-tracking-token";
import { prisma } from "@/lib/prisma";
import {
  getClientKeyFromHeaders,
  hitRateLimit,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { notify, notifyAdmins } from "@/lib/notify";

const orderSchema = z.object({
  items: z.array(z.object({
    mealId: z.string().min(1),
    quantity: z.number().int().min(1).max(20),
    portionSize: z.enum(["Small", "Medium", "Large"]).optional(),
  })).min(1).max(50),
  phone: z.string().trim().min(7).max(32),
  checkoutMode: z.enum(["ACCOUNT", "GUEST"]),
  customerName: z.string().trim().min(2).max(120).optional(),
  customerEmail: z.string().trim().email().max(254).optional(),
  fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
  deliveryFeePayment: z.enum(["UPFRONT", "ON_DELIVERY"]).optional().default("UPFRONT"),
  deliveryAddress: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(["WALLET", "MOBILE_MONEY", "CASH_ON_DELIVERY"]),
  transactionId: z.string().trim().min(3).max(100).optional(),
  senderName: z.string().trim().min(2).max(120).optional(),
  senderMobileNumber: z.string().trim().min(7).max(32).optional(),
  senderNetwork: z.enum(["MTN", "TELECEL"]).optional(),
});

const destinationSchema = z.object({
  MTN: z.object({ accountName: z.string().trim().min(2), accountNumber: z.string().trim().min(7) }),
  TELECEL: z.object({ accountName: z.string().trim().min(2), accountNumber: z.string().trim().min(7) }),
});

class OrderRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function toMoney(cents: number) {
  return new Prisma.Decimal((cents / 100).toFixed(2));
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const account = await getCurrentAccount();
  const customerAccount = account?.role === UserRole.CUSTOMER && account.status === UserStatus.ACTIVE
    ? account
    : null;

  let input: unknown;
  try {
    input = await readJsonBody(request, 16384);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid order request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
  }
  if (parsed.data.fulfillmentType === "DELIVERY" && !parsed.data.deliveryAddress?.trim()) {
    return Response.json({ error: "Enter a delivery address or choose pickup." }, { status: 400 });
  }
  if (parsed.data.fulfillmentType === "DELIVERY" && parsed.data.deliveryFeePayment === "UPFRONT" && parsed.data.paymentMethod === "CASH_ON_DELIVERY") {
    return Response.json({ error: "Choose mobile money or account balance to pay the delivery fee upfront, or select pay on delivery." }, { status: 400 });
  }
  if (
    parsed.data.paymentMethod === "MOBILE_MONEY" &&
    (!parsed.data.transactionId || !parsed.data.senderName || !parsed.data.senderMobileNumber || !parsed.data.senderNetwork)
  ) {
    return Response.json({ error: "Enter the transaction ID, sender name, sender number, and network after sending payment." }, { status: 400 });
  }
  const accountCheckout = parsed.data.checkoutMode === "ACCOUNT";
  if (
    accountCheckout &&
    !customerAccount
  ) {
    return Response.json({ error: "Sign in with an active customer account or choose guest checkout." }, { status: 401 });
  }
  if (!accountCheckout && (!parsed.data.customerName || parsed.data.customerName.length < 2)) {
    return Response.json({ error: "Enter your name to continue as a guest." }, { status: 400 });
  }
  if (!accountCheckout && (parsed.data.fulfillmentType === "DELIVERY" || parsed.data.paymentMethod === "MOBILE_MONEY") && !parsed.data.customerEmail) {
    return Response.json({ error: "Enter an email address so we can send delivery or payment updates." }, { status: 400 });
  }
  if (parsed.data.paymentMethod === "WALLET" && (!accountCheckout || !customerAccount)) {
    return Response.json({ error: "Sign in to pay with your account balance." }, { status: 401 });
  }

  const checkoutActorKey = customerAccount?.id ?? `guest:${getClientKeyFromHeaders(request.headers)}:${parsed.data.phone}`;
  const checkoutLimit = await hitRateLimit("checkout", rateLimitKey("checkout", checkoutActorKey));
  if (!checkoutLimit.ok) {
    return rateLimitResponse(
      checkoutLimit.retryAfterSeconds,
      "You have attempted to place too many orders. Please wait and try again.",
    );
  }

  const idempotency = await beginIdempotency({
    request,
    scope: "customer-order",
    actorKey: checkoutActorKey,
    requestHash: hashIdempotencyRequest(parsed.data),
  });
  if (idempotency.replay) return idempotency.replay;

  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) {
    quantities.set(item.mealId, (quantities.get(item.mealId) ?? 0) + item.quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > 20)) {
    return Response.json({ error: "A maximum of 20 of each meal can be ordered at a time." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      if (parsed.data.paymentMethod === "MOBILE_MONEY") {
        const destinationSetting = await transaction.platformSetting.findUnique({
          where: { key: "mobile_money_destinations" },
          select: { value: true },
        });
        const destinations = destinationSchema.safeParse(destinationSetting?.value);
        if (!destinations.success || !parsed.data.senderNetwork) {
          throw new OrderRequestError("Mobile Money payment details are not configured. Choose cash on delivery or contact support.", 400);
        }
      }

      const meals = await transaction.meal.findMany({
        where: {
          id: { in: [...quantities.keys()] },
          status: MealStatus.PUBLISHED,
          isAvailable: true,
          restaurant: {
            isVisible: true,
            isPaused: false,
            vendor: {
              status: VendorStatus.APPROVED,
              user: { status: UserStatus.ACTIVE },
            },
          },
        },
        select: {
          id: true,
          name: true,
          price: true,
          discountedPrice: true,
          smallPrice: true,
          mediumPrice: true,
          largePrice: true,
          restaurantId: true,
          restaurant: { select: { vendorId: true, name: true, vendor: { select: { businessName: true, user: { select: { id: true, email: true } } } } } },
        },
      });
      if (meals.length !== quantities.size) {
        throw new OrderRequestError("One or more selected meals are no longer available. Refresh the marketplace and try again.", 409);
      }

      const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
      const lineItems = parsed.data.items.map((inputItem) => {
        const meal = mealsById.get(inputItem.mealId)!;
        const portionPrice = inputItem.portionSize === "Small"
          ? meal.smallPrice
          : inputItem.portionSize === "Medium"
            ? meal.mediumPrice
            : inputItem.portionSize === "Large"
              ? meal.largePrice
              : null;
        if (inputItem.portionSize && portionPrice === null) {
          throw new OrderRequestError(`${inputItem.portionSize} portions are no longer available for ${meal.name}. Refresh the marketplace and try again.`, 409);
        }
        const quantity = inputItem.quantity;
        const unitCents = Math.round(Number(portionPrice ?? meal.discountedPrice ?? meal.price) * 100);
        return {
          meal,
          quantity,
          portionSize: inputItem.portionSize ?? null,
          unitCents,
          lineCents: unitCents * quantity,
        };
      });
      const subtotalCents = lineItems.reduce((sum, item) => sum + item.lineCents, 0);
      const deliveryFeeCents = parsed.data.fulfillmentType === "DELIVERY" ? 5000 : 0;
      const deliveryFeePaidUpfront = parsed.data.fulfillmentType === "DELIVERY" && parsed.data.deliveryFeePayment === "UPFRONT";
      const totalCents = subtotalCents + (deliveryFeePaidUpfront ? deliveryFeeCents : 0);
      if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
        throw new OrderRequestError("The order total is invalid. Refresh the marketplace and try again.", 400);
      }

      const paidFromWallet = parsed.data.paymentMethod === "WALLET";
      const wallet = paidFromWallet && customerAccount
        ? await transaction.walletAccount.upsert({
            where: { userId: customerAccount.id },
            create: { userId: customerAccount.id },
            update: {},
          })
        : null;
      if (paidFromWallet) {
        if (!wallet) throw new OrderRequestError("Sign in to use your customer wallet.", 401);
        const debit = await transaction.walletAccount.updateMany({
          where: { id: wallet.id, balance: { gte: toMoney(totalCents) } },
          data: { balance: { decrement: toMoney(totalCents) } },
        });
        if (debit.count !== 1) {
          throw new OrderRequestError("Your wallet balance is too low for this order. Add funds or choose another payment method.", 409);
        }
      }

      const groups = new Map<string, typeof lineItems>();
      for (const item of lineItems) {
        const group = groups.get(item.meal.restaurantId) ?? [];
        group.push(item);
        groups.set(item.meal.restaurantId, group);
      }

      const vendorNotifications = new Map<string, { userId: string; email: string; businessName: string; items: Array<{ name: string; quantity: number; total: number }>; amount: number }>();
      for (const item of lineItems) {
        const profile = item.meal.restaurant.vendor;
        const alert = vendorNotifications.get(item.meal.restaurant.vendorId) ?? { userId: profile.user.id, email: profile.user.email, businessName: profile.businessName, items: [], amount: 0 };
        alert.items.push({ name: item.portionSize ? `${item.meal.name} (${item.portionSize})` : item.meal.name, quantity: item.quantity, total: item.lineCents / 100 });
        alert.amount += item.lineCents / 100;
        vendorNotifications.set(item.meal.restaurant.vendorId, alert);
      }

      const now = new Date();
      const orderNumber = `EH-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
      const order = await transaction.order.create({
        data: {
          orderNumber,
          customerId: accountCheckout ? customerAccount?.id : null,
          guestName: accountCheckout ? customerAccount?.fullName : parsed.data.customerName,
          guestEmail: accountCheckout ? customerAccount?.email : parsed.data.customerEmail,
          guestPhone: parsed.data.phone,
          fulfillmentType: parsed.data.fulfillmentType,
          paymentMethod: parsed.data.paymentMethod,
          deliveryAddress: parsed.data.fulfillmentType === "DELIVERY" ? parsed.data.deliveryAddress : null,
          status: paidFromWallet ? OrderStatus.PAYMENT_CONFIRMED : OrderStatus.ORDER_PLACED,
          paymentStatus: paidFromWallet ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
          subtotal: toMoney(subtotalCents),
          deliveryFee: toMoney(deliveryFeeCents),
          deliveryFeePayment: parsed.data.fulfillmentType === "DELIVERY" ? parsed.data.deliveryFeePayment : "UPFRONT",
          total: toMoney(totalCents),
          currency: "GHS",
          vendorOrders: {
            create: [...groups.entries()].map(([restaurantId, items]) => {
              const vendorSubtotalCents = items.reduce((sum, item) => sum + item.lineCents, 0);
              return {
                restaurantId,
                vendorId: items[0].meal.restaurant.vendorId,
                subtotal: toMoney(vendorSubtotalCents),
                vendorEarning: toMoney(vendorSubtotalCents),
                items: {
                  create: items.map((item) => ({
                    mealId: item.meal.id,
                    nameSnapshot: item.portionSize ? `${item.meal.name} (${item.portionSize})` : item.meal.name,
                    portionSize: item.portionSize,
                    price: toMoney(item.unitCents),
                    quantity: item.quantity,
                    lineTotal: toMoney(item.lineCents),
                  })),
                },
              };
            }),
          },
        },
        select: { id: true, orderNumber: true },
      });

      const payment = await transaction.payment.create({
        data: {
          reference: `FOOD-${randomUUID()}`,
          providerReference: parsed.data.paymentMethod === "MOBILE_MONEY" ? parsed.data.transactionId : null,
          senderName: parsed.data.paymentMethod === "MOBILE_MONEY" ? parsed.data.senderName : null,
          senderMobileNumber: parsed.data.paymentMethod === "MOBILE_MONEY" ? parsed.data.senderMobileNumber : null,
          senderNetwork: parsed.data.paymentMethod === "MOBILE_MONEY" ? parsed.data.senderNetwork : null,
          provider: paidFromWallet
            ? PaymentProvider.MANUAL
            : parsed.data.paymentMethod === "CASH_ON_DELIVERY"
              ? PaymentProvider.CASH
              : PaymentProvider.MANUAL,
          purpose: PaymentPurpose.FOOD_ORDER,
          status: paidFromWallet ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
          amount: toMoney(totalCents),
          currency: "GHS",
          userId: accountCheckout ? customerAccount?.id : null,
          orderId: order.id,
          verifiedAt: paidFromWallet ? now : null,
        },
        select: { id: true },
      });

      if (paidFromWallet) {
        if (!wallet) throw new OrderRequestError("The wallet could not be found.", 409);
        await transaction.walletTransaction.create({
          data: {
            walletId: wallet.id,
            paymentId: payment.id,
            orderId: order.id,
            type: WalletTransactionType.DEBIT,
            amount: toMoney(totalCents),
            description: `Payment for order ${order.orderNumber}`,
          },
        });
      }

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        total: Number(toMoney(totalCents)),
        subtotal: Number(toMoney(subtotalCents)),
        deliveryFee: Number(toMoney(deliveryFeeCents)),
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: paidFromWallet ? PaymentStatus.SUCCEEDED : PaymentStatus.PENDING,
        customerName: parsed.data.checkoutMode === "ACCOUNT" ? customerAccount?.fullName ?? "Customer" : parsed.data.customerName ?? "Customer",
        customerEmail: accountCheckout ? customerAccount?.email ?? null : parsed.data.customerEmail ?? null,
        paidFromWallet,
        items: lineItems.map((item) => ({ name: item.meal.name, quantity: item.quantity, total: item.lineCents / 100 })),
        vendors: [...new Set(lineItems.map((item) => item.meal.restaurant.name))],
        vendorNotifications: [...vendorNotifications.values()],
        customerPaymentEmail: parsed.data.paymentMethod === "CASH_ON_DELIVERY" ? null : {
          email: accountCheckout ? customerAccount?.email ?? null : parsed.data.customerEmail ?? null,
          amount: totalCents / 100,
          confirmed: paidFromWallet,
        },
        };
    });

    after(async () => {
      const orderContext = {
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        customerName: result.customerName,
        items: result.items,
        subtotal: result.subtotal,
        deliveryFee: result.deliveryFee,
        total: result.total,
        paymentMethod: result.paymentMethod,
        paymentStatus: result.paymentStatus,
      };

      if (result.customerEmail) {
        try {
          await notify({
            audience: "CUSTOMER",
            userId: accountCheckout ? customerAccount?.id ?? null : null,
            category: "ORDER",
            event: "customer.order_placed",
            title: `Order ${result.orderNumber} placed`,
            body: "We received your order and sent it to the vendor.",
            href: `/order-tracking?order=${encodeURIComponent(result.orderNumber)}`,
            email: {
              event: "customer.order_placed",
              to: result.customerEmail,
              toUserId: accountCheckout ? customerAccount?.id ?? null : null,
              context: { order: orderContext },
              idempotencyParts: [result.orderId],
            },
          });
        } catch (error) {
          console.error("Customer order email could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      }

      if (result.paidFromWallet && result.customerEmail) {
        try {
          await notify({
            audience: "CUSTOMER",
            userId: customerAccount?.id ?? null,
            category: "WALLET",
            event: "customer.wallet_debit",
            title: "Wallet payment",
            body: `We paid GHS ${result.total.toFixed(2)} for order ${result.orderNumber} from your wallet.`,
            href: "/customer-dashboard",
            email: {
              event: "customer.wallet_debit",
              to: result.customerEmail,
              toUserId: customerAccount?.id ?? null,
              context: { order: orderContext, amount: result.total },
              idempotencyParts: [result.orderId, "wallet-debit"],
            },
          });
        } catch (error) {
          console.error("Wallet debit email could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      }

      if (result.paymentMethod === "MOBILE_MONEY" && result.customerPaymentEmail?.email) {
        try {
          await notify({
            audience: "CUSTOMER",
            userId: customerAccount?.id ?? null,
            category: "PAYMENT",
            event: "customer.payment_received",
            title: "Payment details received",
            body: "We received your payment details. Your order is waiting for verification.",
            href: `/order-tracking?order=${encodeURIComponent(result.orderNumber)}`,
            email: {
              event: "customer.payment_received",
              to: result.customerPaymentEmail.email,
              toUserId: customerAccount?.id ?? null,
              context: { order: orderContext },
              idempotencyParts: [result.orderId, "payment-received"],
            },
          });
        } catch (error) {
          console.error("Customer payment email could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      }

      await Promise.all(result.vendorNotifications.map(async (vendor) => {
        try {
          await notify({
            audience: "VENDOR",
            userId: vendor.userId,
            category: "ORDER",
            event: "vendor.new_order",
            title: `New order ${result.orderNumber}`,
            body: "A new customer order is waiting for you to accept it.",
            href: "/vendor-dashboard",
            email: {
              event: "vendor.new_order",
              to: vendor.email,
              context: {
                order: {
                  orderId: result.orderId,
                  orderNumber: result.orderNumber,
                  customerName: result.customerName,
                  items: vendor.items,
                  subtotal: vendor.amount,
                  total: vendor.amount,
                  paymentMethod: result.paymentMethod,
                  paymentStatus: result.paymentStatus,
                },
              },
              idempotencyParts: [result.orderId, vendor.email],
            },
          });
        } catch (error) {
          console.error("Vendor new-order email could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      }));

      await notifyAdmins({
        event: "admin.order_placed",
        emailEvent: "admin.new_order",
        category: "ORDER",
        title: `New order ${result.orderNumber}`,
        body: `${result.customerName} placed an order for GHS ${result.total.toFixed(2)}.`,
        href: "/admin",
        context: { order: orderContext },
        idempotencyParts: [result.orderId],
        toggle: "adminOrderAlerts",
      });
    });

    const responseBody = {
      ok: true,
      orderNumber: result.orderNumber,
      trackingToken: issueOrderTrackingToken(result.orderId),
      total: result.total,
      paymentStatus: result.paymentStatus,
      vendors: result.vendors,
      message: parsed.data.paymentMethod === "MOBILE_MONEY"
        ? "Order placed. Payment is pending until an administrator verifies your mobile-money transfer."
        : parsed.data.paymentMethod === "CASH_ON_DELIVERY"
          ? "Order placed. Payment is due on delivery."
          : "Order placed and paid from your account balance.",
    };

    await idempotency.complete({ status: 201, body: responseBody }, result.orderId);

    return Response.json(responseBody, { status: 201 });
  } catch (error) {
    await idempotency.fail();
    if (error instanceof OrderRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This transaction ID has already been used. Check the ID or contact support." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Customer order database connection failed.", error);
      return Response.json({ error: "Ordering is temporarily unavailable. Please try again later." }, { status: 503 });
    }
    console.error("Customer order could not be placed.", error);
    return Response.json({ error: "Your order could not be placed. Please try again later." }, { status: 503 });
  }
}
