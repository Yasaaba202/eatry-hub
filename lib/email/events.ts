import { buildIdempotencyKey, formatMoney } from "@/lib/email/core";
import { renderOrderEmail, renderSimpleEmail, type EmailContent, type EmailItem } from "@/lib/email/templates";

export type OrderEmailContext = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  items?: EmailItem[];
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  status?: string;
};

export type EmailContext = {
  baseUrl: string;
  recipientName?: string;
  order?: OrderEmailContext;
  amount?: number;
  transactionId?: string;
  vendorName?: string;
  businessName?: string;
  reference?: string;
  destination?: string;
  status?: string;
  reason?: string;
  verifyUrl?: string;
  unsubscribeUrl?: string;
  supportEmail?: string;
};

function trackUrl(baseUrl: string, orderNumber: string): string {
  return `${baseUrl}/order-tracking?order=${encodeURIComponent(orderNumber)}`;
}

function orderItems(order: OrderEmailContext): EmailItem[] {
  return (order.items ?? []).map((item) => ({ name: item.name, quantity: item.quantity, total: item.total }));
}

function buildOrder(
  heading: string,
  intro: string,
  order: OrderEmailContext,
  baseUrl: string,
  options: { ctaLabel?: string; note?: string } = {},
): EmailContent {
  return renderOrderEmail({
    brand: "customer",
    heading,
    intro,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    items: orderItems(order),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    ctaUrl: trackUrl(baseUrl, order.orderNumber),
    ctaLabel: options.ctaLabel ?? "Track your order",
    note: options.note,
  });
}

const builders: Record<string, (ctx: EmailContext) => EmailContent> = {
  "customer.welcome": (ctx) =>
    renderSimpleEmail({
      subject: "Welcome to Eatry Hub",
      heading: `Welcome to Eatry Hub${ctx.recipientName ? `, ${ctx.recipientName}` : ""}`,
      intro: "Your account is ready. Order Ghanaian favourites from local kitchens and pay the way that suits you.",
      paragraphs: [
        "Confirm your email address so we can send order updates and receipts.",
        "You can order as a guest or sign in to use your wallet balance.",
      ],
      cta: ctx.verifyUrl ? { label: "Confirm my email", url: ctx.verifyUrl } : undefined,
      note: "If you did not create this account, you can ignore this email.",
    }),
  "customer.verify_email": (ctx) =>
    renderSimpleEmail({
      subject: "Confirm your Eatry Hub email address",
      heading: "Confirm your email address",
      intro: "Confirm this address so we can send order updates and payment receipts.",
      cta: ctx.verifyUrl ? { label: "Confirm email address", url: ctx.verifyUrl } : undefined,
      note: "This link expires in 7 days.",
    }),
  "customer.email_verified": (ctx) =>
    renderSimpleEmail({
      subject: "Your Eatry Hub email is confirmed",
      heading: "Email confirmed",
      intro: "Your email address is confirmed. You will now receive order updates and payment receipts.",
      cta: { label: "Start ordering", url: ctx.baseUrl },
    }),
  "customer.password_changed": (ctx) =>
    renderSimpleEmail({
      subject: "Your Eatry Hub password was changed",
      heading: "Your password was changed",
      intro: "The password for your Eatry Hub account was changed successfully.",
      paragraphs: [
        "If this was you, no further action is needed.",
        "If this was not you, reset your password immediately and contact support.",
      ],
      cta: { label: "Go to Eatry Hub", url: ctx.baseUrl },
    }),
  "customer.signed_in": (ctx) =>
    renderSimpleEmail({
      subject: "New sign-in to your Eatry Hub account",
      heading: "New sign-in detected",
      intro: "Your Eatry Hub customer account was just used to sign in.",
      paragraphs: [
        "If this was you, no further action is needed.",
        "If this was not you, change your password immediately and contact support.",
      ],
      cta: { label: "Go to your dashboard", url: `${ctx.baseUrl}/customer-dashboard` },
    }),
  "customer.order_placed": (ctx) => {
    const order = ctx.order!;
    return buildOrder(
      "Order placed",
      "We received your order and sent it to the vendor.",
      order,
      ctx.baseUrl,
      { note: order.paymentStatus === "SUCCEEDED" ? undefined : "Your order is confirmed once payment is verified." },
    );
  },
  "customer.order_status": (ctx) => {
    const order = ctx.order!;
    const labels: Record<string, string> = {
      ORDER_ACCEPTED: "The vendor accepted your order.",
      PREPARING: "The vendor is preparing your food.",
      READY_FOR_PICKUP: "Your order is ready for pickup.",
      PICKED_UP: "Your order has been picked up.",
      OUT_FOR_DELIVERY: "Your order is out for delivery.",
      DELIVERED: "Your order has been delivered.",
      COMPLETED: "Your order is complete. Thank you for ordering from Eatry Hub.",
      CANCELLED: "Your order was cancelled.",
    };
    return buildOrder(
      `Order update: ${(order.status ?? "").replaceAll("_", " ")}`,
      labels[order.status ?? ""] ?? "Your order status changed.",
      order,
      ctx.baseUrl,
    );
  },
  "customer.payment_received": (ctx) => {
    const order = ctx.order!;
    return buildOrder(
      "Payment details received",
      "We received your payment details. Your order is waiting for payment verification.",
      order,
      ctx.baseUrl,
      { note: "You will receive another email as soon as an administrator verifies the payment." },
    );
  },
  "customer.payment_verified": (ctx) => {
    const order = ctx.order!;
    return buildOrder("Payment verified", "Your payment has been verified and your order is confirmed.", order, ctx.baseUrl);
  },
  "customer.payment_failed": (ctx) => {
    const order = ctx.order!;
    return buildOrder(
      "Payment could not be verified",
      "We could not verify your payment, so the order was cancelled.",
      order,
      ctx.baseUrl,
      { note: "If you believe this is a mistake, contact support with your transaction reference." },
    );
  },
  "customer.wallet_topup_submitted": (ctx) =>
    renderSimpleEmail({
      subject: "Eatry Hub wallet payment submitted",
      heading: "Wallet top-up submitted",
      intro: "We received your mobile money payment details.",
      rows: [
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Transaction ID", ctx.transactionId ?? ""],
      ],
      note: "Your wallet will be credited after an administrator verifies the transfer.",
    }),
  "customer.wallet_topup_confirmed": (ctx) =>
    renderSimpleEmail({
      subject: "Eatry Hub wallet top-up confirmed",
      heading: "Wallet top-up confirmed",
      intro: "Your mobile money transfer has been verified and your wallet has been credited.",
      rows: [
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Transaction ID", ctx.transactionId ?? ""],
      ],
      cta: { label: "Open my wallet", url: `${ctx.baseUrl}/customer-dashboard` },
    }),
  "customer.wallet_topup_failed": (ctx) =>
    renderSimpleEmail({
      subject: "Eatry Hub wallet top-up not verified",
      heading: "Top-up not verified",
      intro: "We could not verify your mobile money payment, so your wallet was not credited.",
      rows: [
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Transaction ID", ctx.transactionId ?? ""],
      ],
      note: "If you believe this is a mistake, contact support with your transaction reference.",
    }),
  "customer.wallet_debit": (ctx) => {
    const order = ctx.order;
    return renderSimpleEmail({
      subject: "Eatry Hub wallet payment",
      heading: "Payment taken from your wallet",
      intro: "We paid for your order using your Eatry Hub wallet balance.",
      rows: [
        ...(order ? ([["Order number", order.orderNumber]] as [string, string][]) : []),
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ...(ctx.transactionId ? ([["Reference", ctx.transactionId]] as [string, string][]) : []),
      ],
      cta: order ? { label: "Track your order", url: trackUrl(ctx.baseUrl, order.orderNumber) } : undefined,
    });
  },
  "vendor.welcome": (ctx) =>
    renderSimpleEmail({
      subject: "Welcome to Eatry Hub",
      heading: `Welcome to Eatry Hub${ctx.recipientName ? `, ${ctx.recipientName}` : ""}`,
      intro: "Your vendor account has been created. Complete your store setup and submit your subscription payment to go live.",
      cta: { label: "Open vendor dashboard", url: `${ctx.baseUrl}/vendor-dashboard` },
      note: "Confirm your email address so we can send order and payout notifications.",
    }),
  "vendor.password_changed": (ctx) =>
    renderSimpleEmail({
      subject: "Your Eatry Hub vendor password was changed",
      heading: "Your password was changed",
      intro: "The password for your Eatry Hub vendor account was changed successfully.",
      paragraphs: ["If this was you, no further action is needed.", "If this was not you, reset your password immediately and contact support."],
      cta: { label: "Open vendor dashboard", url: `${ctx.baseUrl}/vendor-dashboard` },
    }),
  "vendor.signed_in": (ctx) =>
    renderSimpleEmail({
      subject: "New sign-in to your Eatry Hub vendor account",
      heading: "New sign-in detected",
      intro: "Your Eatry Hub vendor account was just used to sign in.",
      paragraphs: [
        "If this was you, no further action is needed.",
        "If this was not you, change your password immediately and contact support.",
      ],
      cta: { label: "Open vendor dashboard", url: `${ctx.baseUrl}/vendor-dashboard` },
    }),
  "vendor.new_order": (ctx) => {
    const order = ctx.order!;
    return renderOrderEmail({
      brand: "vendor",
      heading: "New customer order",
      intro: "A new order was placed and is waiting for you to accept it.",
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items: orderItems(order),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      ctaUrl: `${ctx.baseUrl}/vendor-dashboard`,
      ctaLabel: "Review order",
      note: "Accept the order before preparing it.",
    });
  },
  "vendor.payment_verified": (ctx) => {
    const order = ctx.order!;
    return renderOrderEmail({
      brand: "vendor",
      heading: "Payment verified",
      intro: "The customer's payment for this order has been verified. You can prepare it now.",
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items: orderItems(order),
      total: order.total,
      paymentStatus: order.paymentStatus,
      ctaUrl: `${ctx.baseUrl}/vendor-dashboard`,
      ctaLabel: "Open order",
    });
  },
  "vendor.order_cancelled": (ctx) => {
    const order = ctx.order!;
    return renderOrderEmail({
      brand: "vendor",
      heading: "Order cancelled",
      intro: "This order was cancelled. No further preparation is required.",
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items: orderItems(order),
      total: order.total,
      status: "CANCELLED",
      ctaUrl: `${ctx.baseUrl}/vendor-dashboard`,
      ctaLabel: "Open dashboard",
      note: ctx.reason ? `Reason: ${ctx.reason}` : undefined,
    });
  },
  "vendor.payout_requested": (ctx) =>
    renderSimpleEmail({
      subject: "Withdrawal request received",
      heading: "Withdrawal request received",
      intro: "We received your withdrawal request and queued it for the next processing window.",
      rows: [
        ["Reference", ctx.reference ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Destination", ctx.destination ?? ""],
      ],
      cta: { label: "Open payouts", url: `${ctx.baseUrl}/vendor-dashboard` },
      note: "You will be notified once the transfer is marked paid.",
    }),
  "vendor.payout_completed": (ctx) =>
    renderSimpleEmail({
      subject: "Withdrawal marked paid",
      heading: "Withdrawal paid",
      intro: "Your withdrawal has been marked as paid by an administrator.",
      rows: [
        ["Reference", ctx.reference ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Destination", ctx.destination ?? ""],
      ],
      cta: { label: "Open payouts", url: `${ctx.baseUrl}/vendor-dashboard` },
    }),
  "vendor.account_status": (ctx) =>
    renderSimpleEmail({
      subject: `Your Eatry Hub vendor account: ${(ctx.status ?? "").replaceAll("_", " ")}`,
      heading: "Vendor account update",
      intro: `Your vendor account is now ${(ctx.status ?? "").replaceAll("_", " ").toLowerCase()}.`,
      rows: [
        ["Business", ctx.businessName ?? ""],
        ["Status", (ctx.status ?? "").replaceAll("_", " ")],
      ],
      paragraphs: ctx.reason ? [ctx.reason] : undefined,
      cta: { label: "Open vendor dashboard", url: `${ctx.baseUrl}/vendor-dashboard` },
    }),
  "admin.new_order": (ctx) => {
    const order = ctx.order!;
    return renderOrderEmail({
      brand: "admin",
      heading: "New order placed",
      intro: "A new customer order was placed on Eatry Hub.",
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      items: orderItems(order),
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      ctaUrl: `${ctx.baseUrl}/admin`,
      ctaLabel: "Open admin dashboard",
    });
  },
  "admin.signed_in": (ctx) =>
    renderSimpleEmail({
      subject: "Admin sign-in on Eatry Hub",
      heading: "Administrator signed in",
      intro: "An administrator session was created on Eatry Hub.",
      paragraphs: ["If this was you, no further action is needed.", "If this was not you, change the admin password immediately."],
      cta: { label: "Open admin dashboard", url: `${ctx.baseUrl}/admin` },
    }),
  "admin.payment_submitted": (ctx) =>
    renderSimpleEmail({
      subject: "Payment awaiting verification",
      heading: "Payment awaiting verification",
      intro: "A customer payment submission is waiting for manual verification.",
      rows: [
        ["Reference", ctx.transactionId ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Customer", ctx.recipientName ?? ""],
      ],
      cta: { label: "Review payments", url: `${ctx.baseUrl}/admin` },
    }),
  "admin.payment_verified": (ctx) =>
    renderSimpleEmail({
      subject: "Payment verified",
      heading: "Payment verified",
      intro: "An administrator verified a customer payment.",
      rows: [
        ["Reference", ctx.transactionId ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
      ],
      cta: { label: "Open admin dashboard", url: `${ctx.baseUrl}/admin` },
    }),
  "admin.payment_rejected": (ctx) =>
    renderSimpleEmail({
      subject: "Payment rejected",
      heading: "Payment rejected",
      intro: "An administrator rejected a customer payment submission.",
      rows: [
        ["Reference", ctx.transactionId ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ...(ctx.reason ? ([["Reason", ctx.reason]] as [string, string][]) : []),
      ],
      cta: { label: "Open admin dashboard", url: `${ctx.baseUrl}/admin` },
    }),
  "admin.payout_requested": (ctx) =>
    renderSimpleEmail({
      subject: "Vendor withdrawal requested",
      heading: "Vendor withdrawal requested",
      intro: "A vendor requested a withdrawal.",
      rows: [
        ["Business", ctx.businessName ?? ""],
        ["Reference", ctx.reference ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
        ["Destination", ctx.destination ?? ""],
      ],
      cta: { label: "Review withdrawals", url: `${ctx.baseUrl}/admin` },
      note: "Process between 6:00 AM and 12:00 PM Ghana time.",
    }),
  "admin.payout_completed": (ctx) =>
    renderSimpleEmail({
      subject: "Withdrawal marked paid",
      heading: "Withdrawal marked paid",
      intro: "A vendor withdrawal was marked as paid.",
      rows: [
        ["Business", ctx.businessName ?? ""],
        ["Reference", ctx.reference ?? ""],
        ["Amount", formatMoney(ctx.amount ?? 0)],
      ],
      cta: { label: "Open admin dashboard", url: `${ctx.baseUrl}/admin` },
    }),
};

export function buildEventEmail(event: string, ctx: EmailContext): EmailContent {
  const builder = builders[event];
  if (!builder) {
    throw new Error(`Unknown email event: ${event}`);
  }
  return builder(ctx);
}

export function idempotencyKeyFor(event: string, ...parts: Array<string | number>): string {
  return buildIdempotencyKey(event, ...parts);
}

export function isKnownEmailEvent(event: string): boolean {
  return Object.prototype.hasOwnProperty.call(builders, event);
}