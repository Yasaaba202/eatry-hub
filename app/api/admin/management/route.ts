import {
  OrderStatus,
  PaymentProvider,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  SubscriptionStatus,
  UserRole,
  UserStatus,
  VendorStatus,
} from "@prisma/client";
import { z } from "zod";
import { after } from "next/server";
import { getAdminSessionConfig, verifyAdminCredentials } from "@/lib/admin-auth";
import { authorizeAdminRead, authorizeAdminRequest } from "@/lib/admin-api";
import { readJsonBody } from "@/lib/api-security";
import { prisma } from "@/lib/prisma";
import {
  getClientKeyFromHeaders,
  hitRateLimit,
  rateLimitKey,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { notify, notifyAdmins } from "@/lib/notify";

const destinationSchema = z.object({
  MTN: z.object({
    accountName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().min(7).max(32),
  }),
  TELECEL: z.object({
    accountName: z.string().trim().min(2).max(120),
    accountNumber: z.string().trim().min(7).max(32),
  }),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit-account"),
    userId: z.string().min(1),
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    phone: z.string().trim().max(32).nullable(),
    businessName: z.string().trim().min(2).max(120).optional(),
    businessPhone: z.string().trim().min(7).max(32).optional(),
    location: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().min(10).max(2000).optional(),
  }),
  z.object({
    action: z.literal("set-account-status"),
    userId: z.string().min(1),
    status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]),
  }),
  z.object({ action: z.literal("verify-payment"), paymentId: z.string().min(1) }),
  z.object({ action: z.literal("reject-payment"), paymentId: z.string().min(1) }),
  z.object({ action: z.literal("complete-payout"), payoutId: z.string().min(1) }),
  z.object({
    action: z.literal("save-payment-destinations"),
    destinations: destinationSchema,
  }),
  z.object({
    action: z.literal("approve-vendor"),
    userId: z.string().min(1),
  }),
  z.object({
    action: z.literal("reject-vendor"),
    userId: z.string().min(1),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("delete-account"), userId: z.string().min(1) }),
]);

const allApplicationTables = Prisma.raw(
  `"VendorOrderItem", "OrderTracking", "WalletTransaction", "VendorSubscription", "VendorApplication", "VendorOrder", "Payment", "WalletAccount", "Refund", "Payout", "Favorite", "MealImage", "Review", "Notification", "CartItem", "Cart", "Address", "CustomerProfile", "Promotion", "PlatformSetting", "RolePermission", "Permission", "ActivityLog", "VendorProfile", "Restaurant", "Meal", "Order", "User", "Category", "SubscriptionPlan"`,
);

export async function GET(request: Request) {
  const denied = await authorizeAdminRead(request);
  if (denied) return denied;

  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [accounts, payments, payouts, activeVendors, pendingApprovals, monthlyRevenue, monthlyPaymentCount, destinationSetting, orders, monthlyOrderCount] =
      await Promise.all([
        prisma.user.findMany({
          where: { role: { in: [UserRole.VENDOR, UserRole.CUSTOMER] } },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
            vendorProfile: {
              select: {
                id: true,
                businessName: true,
                businessPhone: true,
                location: true,
                description: true,
                status: true,
                approvedAt: true,
                category: { select: { name: true } },
                restaurant: { select: { isVisible: true } },
                subscriptions: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: {
                    status: true,
                    plan: { select: { name: true, monthlyPrice: true } },
                  },
                },
              },
            },
          },
        }),
        prisma.payment.findMany({
          where: {
            purpose: {
              in: [
                PaymentPurpose.VENDOR_SUBSCRIPTION,
                PaymentPurpose.WALLET_TOP_UP,
                PaymentPurpose.FOOD_ORDER,
              ],
            },
            status: PaymentStatus.PENDING,
            provider: PaymentProvider.MANUAL,
          },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: {
            id: true,
            providerReference: true,
            senderName: true,
            senderMobileNumber: true,
            amount: true,
            currency: true,
            createdAt: true,
            purpose: true,
            senderNetwork: true,
            user: { select: { fullName: true, email: true } },
            application: {
              select: {
                id: true,
                status: true,
                businessName: true,
                vendor: { select: { userId: true, status: true } },
              },
            },
            order: { select: { orderNumber: true, guestName: true, guestPhone: true } },
          },
        }),
        prisma.payout.findMany({
          where: { status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
          orderBy: { createdAt: "asc" },
          take: 200,
          select: { id: true, reference: true, amount: true, feeAmount: true, netAmount: true, destinationNumber: true, destinationNetwork: true, createdAt: true, vendor: { select: { businessName: true, user: { select: { email: true } } } } },
        }),
        prisma.vendorProfile.count({ where: { status: VendorStatus.APPROVED } }),
        prisma.vendorProfile.count({ where: { status: VendorStatus.PAYMENT_VERIFIED } }),
        prisma.payment.aggregate({
          where: {
            status: PaymentStatus.SUCCEEDED,
            purpose: { not: PaymentPurpose.WALLET_TOP_UP },
            createdAt: { gte: monthStart },
            currency: "GHS",
          },
          _sum: { amount: true },
        }),
        prisma.payment.count({
          where: {
            status: PaymentStatus.SUCCEEDED,
            purpose: { not: PaymentPurpose.WALLET_TOP_UP },
            createdAt: { gte: monthStart },
            currency: "GHS",
          },
        }),
        prisma.platformSetting.findUnique({
          where: { key: "mobile_money_destinations" },
          select: { value: true },
        }),
        prisma.order.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            orderNumber: true,
            guestName: true,
            guestPhone: true,
            status: true,
            paymentStatus: true,
            paymentMethod: true,
            total: true,
            deliveryFee: true,
            deliveryFeePayment: true,
            currency: true,
            createdAt: true,
            vendorOrders: {
              select: {
                status: true,
                restaurant: { select: { name: true } },
                items: { select: { nameSnapshot: true, quantity: true } },
              },
            },
          },
        }),
        prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
      ]);

    const destinations = destinationSchema.safeParse(destinationSetting?.value);
    return Response.json({
      accounts,
      payments,
      payouts: payouts.map((payout) => ({ ...payout, amount: Number(payout.amount), feeAmount: Number(payout.feeAmount), netAmount: Number(payout.netAmount) })),
      orders: orders.map((order) => ({
        ...order,
        total: Number(order.total),
        deliveryFee: Number(order.deliveryFee),
        vendorOrders: order.vendorOrders.map((vendorOrder) => ({
          ...vendorOrder,
          items: vendorOrder.items,
        })),
      })),
      mobileMoneyDestinations: destinations.success
        ? destinations.data
        : {
            MTN: { accountName: "", accountNumber: "" },
            TELECEL: { accountName: "", accountNumber: "" },
          },
      stats: {
        activeVendors,
        pendingApprovals,
        pendingPayments: payments.length,
        customers: accounts.filter((account) => account.role === UserRole.CUSTOMER).length,
        monthlyRevenue: Number(monthlyRevenue._sum.amount ?? 0),
        monthlyPaymentCount,
        monthlyOrderCount,
        month: monthStart.toISOString(),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin management data could not be loaded.", error);
    return Response.json({ error: "Admin data could not be loaded. Please try again." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await authorizeAdminRequest(request, true);
  if (denied) return denied;

  let input: unknown;
  try {
    input = await readJsonBody(request, 8192);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });
  }

  try {
    type CustomerPaymentNotification =
      | { type: "order"; status: "verified" | "rejected"; email: string; orderNumber: string; amount: number; userId: string | null; vendors: Array<{ email: string; businessName: string }> }
      | { type: "topup"; status: "verified" | "rejected"; email: string; amount: number; transactionId: string; userId: string | null };
    type PayoutNotification = { email: string; businessName: string; reference: string; amount: number; destination: string };
    type VendorAccountNotification = { email: string; businessName: string; status: string; reason?: string };
    const notifications: {
      customerPayment: CustomerPaymentNotification | null;
      payout: PayoutNotification | null;
      vendorAccount: VendorAccountNotification | null;
    } = { customerPayment: null, payout: null, vendorAccount: null };
    const result = await prisma.$transaction(async (transaction) => {
      const action = parsed.data;

      if (action.action === "save-payment-destinations") {
        await transaction.platformSetting.upsert({
          where: { key: "mobile_money_destinations" },
          create: { key: "mobile_money_destinations", value: action.destinations },
          update: { value: action.destinations },
        });
        return "Mobile Money deposit details saved.";
      }

      if (action.action === "edit-account") {
        const account = await transaction.user.findUnique({
          where: { id: action.userId },
          select: { id: true, role: true, vendorProfile: { select: { id: true } } },
        });
        if (!account || (account.role !== UserRole.CUSTOMER && account.role !== UserRole.VENDOR)) {
          throw new ManagementError("Account not found.", 404);
        }

        await transaction.user.update({
          where: { id: account.id },
          data: {
            fullName: action.fullName,
            email: action.email.toLowerCase(),
            phone: action.phone || null,
          },
        });
        if (account.role === UserRole.VENDOR) {
          if (!account.vendorProfile || !action.businessName || !action.businessPhone || !action.location || !action.description) {
            throw new ManagementError("Complete vendor business details are required.", 400);
          }
          await transaction.vendorProfile.update({
            where: { id: account.vendorProfile.id },
            data: {
              businessName: action.businessName,
              businessPhone: action.businessPhone,
              location: action.location,
              description: action.description,
            },
          });
          await transaction.restaurant.updateMany({
            where: { vendorId: account.vendorProfile.id },
            data: {
              name: action.businessName,
              description: action.description,
              location: action.location,
            },
          });
          await transaction.vendorApplication.updateMany({
            where: { vendorId: account.vendorProfile.id },
            data: { businessName: action.businessName, businessAddress: action.location },
          });
        }
        await transaction.activityLog.create({
          data: { action: "ACCOUNT_EDITED", entityType: account.role, entityId: account.id },
        });
        return "Account updated.";
      }

      if (action.action === "set-account-status") {
        const account = await transaction.user.findUnique({
          where: { id: action.userId },
          select: { id: true, role: true, email: true, fullName: true, vendorProfile: { select: { id: true, status: true, approvedAt: true, businessName: true } } },
        });
        if (!account || (account.role !== UserRole.CUSTOMER && account.role !== UserRole.VENDOR)) {
          throw new ManagementError("Account not found.", 404);
        }
        const status = action.status as UserStatus;
        await transaction.user.update({ where: { id: account.id }, data: { status } });
        if (account.role === UserRole.VENDOR) {
          notifications.vendorAccount = {
            email: account.email,
            businessName: account.vendorProfile?.businessName ?? account.fullName,
            status: status === UserStatus.ACTIVE ? "ACTIVE" : "SUSPENDED",
          };
        }
        if (account.role === UserRole.VENDOR && account.vendorProfile) {
          if (status !== UserStatus.ACTIVE) {
            await transaction.vendorProfile.update({
              where: { id: account.vendorProfile.id },
              data: { status: VendorStatus.SUSPENDED },
            });
            await transaction.restaurant.updateMany({
              where: { vendorId: account.vendorProfile.id },
              data: { isVisible: false },
            });
          } else if (account.vendorProfile.status === VendorStatus.SUSPENDED) {
            const verifiedPayment = await transaction.payment.findFirst({
              where: {
                userId: account.id,
                purpose: PaymentPurpose.VENDOR_SUBSCRIPTION,
                status: PaymentStatus.SUCCEEDED,
              },
              select: { id: true },
            });
            const vendorStatus = account.vendorProfile.approvedAt && verifiedPayment
              ? VendorStatus.APPROVED
              : verifiedPayment
                ? VendorStatus.PAYMENT_VERIFIED
                : VendorStatus.AWAITING_PAYMENT;
            await transaction.vendorProfile.update({
              where: { id: account.vendorProfile.id },
              data: { status: vendorStatus },
            });
            await transaction.restaurant.updateMany({
              where: { vendorId: account.vendorProfile.id },
              data: { isVisible: vendorStatus === VendorStatus.APPROVED },
            });
          }
        }
        await transaction.activityLog.create({
          data: { action: "ACCOUNT_STATUS_CHANGED", entityType: account.role, entityId: account.id, metadata: { status } },
        });
        return "Account status updated.";
      }

      if (action.action === "verify-payment") {
        const payment = await transaction.payment.findUnique({
          where: { id: action.paymentId },
          include: {
            application: {
              include: { vendor: { include: { subscriptions: { orderBy: { createdAt: "desc" }, take: 1 } } } },
            },
            order: { select: { id: true, orderNumber: true, guestEmail: true } },
            user: { select: { email: true } },
          },
        });
        if (
          !payment ||
          payment.status !== PaymentStatus.PENDING ||
          !payment.providerReference ||
          (payment.purpose === PaymentPurpose.WALLET_TOP_UP
            ? !payment.senderName
            : !payment.senderMobileNumber)
        ) {
          throw new ManagementError("This payment is no longer pending.", 409);
        }
        const verifiedAt = new Date();
        const claimed = await transaction.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.SUCCEEDED, verifiedAt },
        });
        if (claimed.count !== 1) throw new ManagementError("This payment was already reviewed.", 409);

        if (payment.purpose === PaymentPurpose.VENDOR_SUBSCRIPTION) {
          if (
            !payment.application ||
            payment.application.status !== VendorStatus.AWAITING_PAYMENT ||
            payment.application.vendor.status !== VendorStatus.AWAITING_PAYMENT
          ) {
            throw new ManagementError("This vendor application is no longer awaiting payment.", 409);
          }
          await transaction.vendorProfile.update({
            where: { id: payment.application.vendorId },
            data: { status: VendorStatus.PAYMENT_VERIFIED },
          });
          await transaction.vendorApplication.update({
            where: { id: payment.applicationId! },
            data: { status: VendorStatus.PAYMENT_VERIFIED },
          });
          const subscription = payment.application.vendor.subscriptions[0];
          if (subscription) {
            const renewsAt = new Date(verifiedAt);
            renewsAt.setDate(renewsAt.getDate() + 30);
            await transaction.vendorSubscription.update({
              where: { id: subscription.id },
              data: { status: SubscriptionStatus.ACTIVE, startsAt: verifiedAt, renewsAt },
            });
          }
        } else if (payment.purpose === PaymentPurpose.WALLET_TOP_UP) {
          if (!payment.userId) throw new ManagementError("This top-up has no customer account.", 409);
          const wallet = await transaction.walletAccount.upsert({
            where: { userId: payment.userId },
            create: { userId: payment.userId },
            update: {},
          });
          await transaction.walletAccount.update({
            where: { id: wallet.id },
            data: { balance: { increment: payment.amount } },
          });
          await transaction.walletTransaction.create({
            data: {
              walletId: wallet.id,
              paymentId: payment.id,
              type: "CREDIT",
              amount: payment.amount,
              description: "Admin-verified mobile-money wallet top-up",
            },
          });
          if (payment.user?.email && payment.providerReference) {
            notifications.customerPayment = {
              type: "topup",
              status: "verified",
              email: payment.user.email,
              amount: Number(payment.amount),
              transactionId: payment.providerReference,
              userId: payment.userId ?? null,
            };
          }
        } else if (payment.purpose === PaymentPurpose.FOOD_ORDER) {
          if (!payment.orderId || !payment.order) throw new ManagementError("This payment has no linked order.", 409);
          await transaction.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: PaymentStatus.SUCCEEDED, status: OrderStatus.PAYMENT_CONFIRMED },
          });
          if (payment.order.guestEmail) {
            const vendorRows = await transaction.vendorOrder.findMany({
              where: { orderId: payment.orderId },
              select: { vendor: { select: { user: { select: { email: true } }, businessName: true } } },
            });
            notifications.customerPayment = {
              type: "order",
              status: "verified",
              email: payment.order.guestEmail,
              orderNumber: payment.order.orderNumber,
              amount: Number(payment.amount),
              userId: null,
              vendors: vendorRows.map((row) => ({ email: row.vendor.user.email, businessName: row.vendor.businessName })),
            };
          }
        } else {
          throw new ManagementError("This payment type cannot be verified here.", 409);
        }
        await transaction.activityLog.create({
          data: {
            action: `${payment.purpose}_PAYMENT_VERIFIED`,
            entityType: "Payment",
            entityId: payment.id,
            metadata: { purpose: payment.purpose },
          },
        });
        if (payment.purpose === PaymentPurpose.VENDOR_SUBSCRIPTION) return "Payment verified. The vendor can now be approved.";
        if (payment.purpose === PaymentPurpose.WALLET_TOP_UP) return "Top-up verified and wallet credited.";
        return "Order payment verified.";
      }

      if (action.action === "reject-payment") {
        const payment = await transaction.payment.findUnique({
          where: { id: action.paymentId },
          select: {
            id: true,
            status: true,
            purpose: true,
            orderId: true,
            userId: true,
            amount: true,
            providerReference: true,
            user: { select: { email: true } },
            order: { select: { orderNumber: true, guestEmail: true } },
          },
        });
        if (
          !payment ||
          payment.status !== PaymentStatus.PENDING ||
          (payment.purpose !== PaymentPurpose.VENDOR_SUBSCRIPTION &&
            payment.purpose !== PaymentPurpose.WALLET_TOP_UP &&
            payment.purpose !== PaymentPurpose.FOOD_ORDER)
        ) {
          throw new ManagementError("This payment is no longer pending.", 409);
        }
        const rejected = await transaction.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        if (rejected.count !== 1) throw new ManagementError("This payment was already reviewed.", 409);
        if (payment.purpose === PaymentPurpose.FOOD_ORDER && payment.orderId) {
          await transaction.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: PaymentStatus.FAILED, status: OrderStatus.CANCELLED },
          });
          await transaction.vendorOrder.updateMany({
            where: { orderId: payment.orderId },
            data: { status: OrderStatus.CANCELLED },
          });
          if (payment.order?.guestEmail) {
            const vendorRows = await transaction.vendorOrder.findMany({
              where: { orderId: payment.orderId },
              select: { vendor: { select: { user: { select: { email: true } }, businessName: true } } },
            });
            notifications.customerPayment = {
              type: "order",
              status: "rejected",
              email: payment.order.guestEmail,
              orderNumber: payment.order.orderNumber,
              amount: 0,
              userId: null,
              vendors: vendorRows.map((row) => ({ email: row.vendor.user.email, businessName: row.vendor.businessName })),
            };
          }
        } else if (payment.purpose === PaymentPurpose.WALLET_TOP_UP && payment.user?.email) {
          notifications.customerPayment = {
            type: "topup",
            status: "rejected",
            email: payment.user.email,
            amount: Number(payment.amount ?? 0),
            transactionId: payment.providerReference ?? "",
            userId: payment.userId ?? null,
          };
        }
        await transaction.activityLog.create({
          data: {
            action: `${payment.purpose}_PAYMENT_REJECTED`,
            entityType: "Payment",
            entityId: payment.id,
          },
        });
        return payment.purpose === PaymentPurpose.VENDOR_SUBSCRIPTION
          ? "Payment submission rejected. The vendor can submit corrected details."
          : "Payment submission rejected.";
      }

      if (action.action === "complete-payout") {
        const ghTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Accra", hour: "2-digit", hourCycle: "h23" }).format(new Date());
        const hour = Number(ghTime);
        if (hour < 6 || hour >= 12) throw new ManagementError("Vendor withdrawals can only be marked paid from 6:00 AM to 12:00 PM Ghana time.", 409);
        const payout = await transaction.payout.findUnique({
          where: { id: action.payoutId },
          select: {
            id: true,
            status: true,
            reference: true,
            amount: true,
            destinationNumber: true,
            destinationNetwork: true,
            vendor: { select: { businessName: true, user: { select: { email: true } } } },
          },
        });
        if (!payout || (payout.status !== PaymentStatus.PENDING && payout.status !== PaymentStatus.PROCESSING)) throw new ManagementError("This withdrawal request is no longer pending.", 409);
        const changed = await transaction.payout.updateMany({ where: { id: payout.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } }, data: { status: PaymentStatus.SUCCEEDED, paidAt: new Date() } });
        if (changed.count !== 1) throw new ManagementError("This withdrawal request changed. Refresh and try again.", 409);
        notifications.payout = {
          email: payout.vendor.user.email,
          businessName: payout.vendor.businessName,
          reference: payout.reference,
          amount: Number(payout.amount),
          destination: `${payout.destinationNumber ?? ""} (${payout.destinationNetwork ?? ""})`,
        };
        return "Withdrawal marked paid. Confirm the MoMo transfer was sent before recording it.";
      }

      if (action.action === "approve-vendor") {
        const vendor = await transaction.vendorProfile.findUnique({
          where: { userId: action.userId },
          include: {
            user: { select: { email: true } },
            applications: { orderBy: { submittedAt: "desc" }, take: 1 },
            restaurant: { select: { id: true } },
          },
        });
        if (!vendor || vendor.status !== VendorStatus.PAYMENT_VERIFIED || !vendor.applications[0]) {
          throw new ManagementError("Verify the vendor's payment before approving the application.", 409);
        }
        const paid = await transaction.payment.findFirst({
          where: {
            applicationId: vendor.applications[0].id,
            purpose: PaymentPurpose.VENDOR_SUBSCRIPTION,
            status: PaymentStatus.SUCCEEDED,
          },
          select: { id: true },
        });
        if (!paid) throw new ManagementError("A verified subscription payment is required before approval.", 409);

        const reviewedAt = new Date();
        await transaction.vendorProfile.update({
          where: { id: vendor.id },
          data: { status: VendorStatus.APPROVED, approvedAt: reviewedAt },
        });
        await transaction.vendorApplication.update({
          where: { id: vendor.applications[0].id },
          data: { status: VendorStatus.APPROVED, reviewedAt },
        });
        await transaction.user.update({
          where: { id: vendor.userId },
          data: { status: UserStatus.ACTIVE },
        });
        await transaction.restaurant.updateMany({
          where: { vendorId: vendor.id },
          data: { isVisible: true },
        });
        await transaction.activityLog.create({
          data: { action: "VENDOR_APPROVED", entityType: "VendorProfile", entityId: vendor.id },
        });
        notifications.vendorAccount = { email: vendor.user.email, businessName: vendor.businessName, status: "APPROVED" };
        return "Vendor approved and store made visible.";
      }

      if (action.action === "reject-vendor") {
        const vendor = await transaction.vendorProfile.findUnique({
          where: { userId: action.userId },
          include: { user: { select: { email: true } }, applications: { orderBy: { submittedAt: "desc" }, take: 1 } },
        });
        if (!vendor || !vendor.applications[0]) throw new ManagementError("Vendor application not found.", 404);
        await transaction.vendorProfile.update({
          where: { id: vendor.id },
          data: { status: VendorStatus.REJECTED, rejectionReason: action.reason || null },
        });
        await transaction.vendorApplication.update({
          where: { id: vendor.applications[0].id },
          data: { status: VendorStatus.REJECTED, reviewedAt: new Date(), reviewReason: action.reason || null },
        });
        await transaction.restaurant.updateMany({ where: { vendorId: vendor.id }, data: { isVisible: false } });
        await transaction.activityLog.create({
          data: { action: "VENDOR_REJECTED", entityType: "VendorProfile", entityId: vendor.id },
        });
        notifications.vendorAccount = {
          email: vendor.user.email,
          businessName: vendor.businessName,
          status: "REJECTED",
          reason: action.reason || undefined,
        };
        return "Vendor application rejected.";
      }

      const account = await transaction.user.findUnique({
        where: { id: action.userId },
        select: {
          id: true,
          role: true,
          vendorProfile: { select: { id: true, _count: { select: { vendorOrders: true, payouts: true } } } },
        },
      });
      if (!account || (account.role !== UserRole.CUSTOMER && account.role !== UserRole.VENDOR)) {
        throw new ManagementError("Account not found.", 404);
      }
      if (account.vendorProfile && (account.vendorProfile._count.vendorOrders > 0 || account.vendorProfile._count.payouts > 0)) {
        throw new ManagementError("This vendor has order or payout history. Suspend the account instead to preserve financial records.", 409);
      }
      await transaction.user.delete({ where: { id: account.id } });
      return "Account deleted.";
    });

    if (notifications.customerPayment) {
      const notification = notifications.customerPayment;
      after(async () => {
        try {
          if (notification.type === "order") {
            const verified = notification.status === "verified";
            await notify({
              audience: "CUSTOMER",
              userId: notification.userId,
              category: "PAYMENT",
              event: verified ? "customer.payment_verified" : "customer.payment_failed",
              title: verified ? `Payment verified for ${notification.orderNumber}` : `Payment not verified for ${notification.orderNumber}`,
              body: verified
                ? "Your payment has been verified and your order is confirmed."
                : "We could not verify your payment, so the order was cancelled.",
              href: `/order-tracking?order=${encodeURIComponent(notification.orderNumber)}`,
              email: {
                event: verified ? "customer.payment_verified" : "customer.payment_failed",
                to: notification.email,
                toUserId: notification.userId,
                context: {
                  order: {
                    orderId: notification.orderNumber,
                    orderNumber: notification.orderNumber,
                    customerName: "Customer",
                    total: notification.amount,
                    status: verified ? "PAYMENT_CONFIRMED" : "CANCELLED",
                  },
                },
                idempotencyParts: [notification.orderNumber, notification.status],
              },
            });

            for (const vendor of notification.vendors) {
              await notify({
                audience: "VENDOR",
                userId: null,
                category: verified ? "PAYMENT" : "ORDER",
                event: verified ? "vendor.payment_verified" : "vendor.order_cancelled",
                title: verified ? `Payment verified for ${notification.orderNumber}` : `Order ${notification.orderNumber} cancelled`,
                body: verified
                  ? "The customer's payment has been verified. You can prepare the order."
                  : "This order was cancelled because payment could not be verified.",
                href: "/vendor-dashboard",
                email: {
                  event: verified ? "vendor.payment_verified" : "vendor.order_cancelled",
                  to: vendor.email,
                  context: {
                    order: {
                      orderId: notification.orderNumber,
                      orderNumber: notification.orderNumber,
                      customerName: "Customer",
                      total: notification.amount,
                      status: verified ? "PAYMENT_CONFIRMED" : "CANCELLED",
                      paymentStatus: verified ? "SUCCEEDED" : "FAILED",
                    },
                  },
                  idempotencyParts: [notification.orderNumber, vendor.email, notification.status],
                },
              });
            }
          } else {
            const verified = notification.status === "verified";
            await notify({
              audience: "CUSTOMER",
              userId: notification.userId,
              category: "WALLET",
              event: verified ? "customer.wallet_topup_confirmed" : "customer.wallet_topup_failed",
              title: verified ? "Wallet top-up confirmed" : "Wallet top-up not verified",
              body: verified
                ? "Your mobile money transfer has been verified and your wallet has been credited."
                : "We could not verify your mobile money payment, so your wallet was not credited.",
              href: "/customer-dashboard",
              email: {
                event: verified ? "customer.wallet_topup_confirmed" : "customer.wallet_topup_failed",
                to: notification.email,
                toUserId: notification.userId,
                context: { amount: notification.amount, transactionId: notification.transactionId },
                idempotencyParts: [notification.transactionId || notification.email, notification.status],
              },
            });
          }

          await notifyAdmins({
            event: notification.type === "order"
              ? (notification.status === "verified" ? "admin.payment_verified" : "admin.payment_rejected")
              : (notification.status === "verified" ? "admin.wallet_topup_verified" : "admin.wallet_topup_rejected"),
            emailEvent: notification.status === "verified" ? "admin.payment_verified" : "admin.payment_rejected",
            category: "PAYMENT",
            title: notification.status === "verified" ? "Payment verified" : "Payment rejected",
            body: notification.type === "order"
              ? `Order ${notification.orderNumber}: ${notification.status}.`
              : `Wallet top-up ${notification.transactionId}: ${notification.status}.`,
            href: "/admin",
            context: {
              transactionId: notification.type === "order" ? notification.orderNumber : notification.transactionId,
              amount: notification.amount,
            },
            idempotencyParts: [notification.type, notification.type === "order" ? notification.orderNumber : notification.transactionId, notification.status],
            toggle: "adminPaymentAlerts",
          });
        } catch (error) {
          console.error("Payment notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      });
    }

    if (notifications.payout) {
      const payout = notifications.payout;
      after(async () => {
        try {
          await notify({
            audience: "VENDOR",
            userId: null,
            category: "PAYOUT",
            event: "vendor.payout_completed",
            title: `Withdrawal ${payout.reference} paid`,
            body: "Your withdrawal has been marked as paid.",
            href: "/vendor-dashboard",
            email: {
              event: "vendor.payout_completed",
              to: payout.email,
              context: { businessName: payout.businessName, reference: payout.reference, amount: payout.amount, destination: payout.destination },
              idempotencyParts: [payout.reference],
            },
          });
          await notifyAdmins({
            event: "admin.payout_completed",
            emailEvent: "admin.payout_completed",
            category: "PAYOUT",
            title: `Withdrawal ${payout.reference} paid`,
            body: `${payout.businessName}'s withdrawal of GHS ${payout.amount.toFixed(2)} was marked paid.`,
            href: "/admin",
            context: { businessName: payout.businessName, reference: payout.reference, amount: payout.amount },
            idempotencyParts: [payout.reference],
            toggle: "adminPayoutAlerts",
          });
        } catch (error) {
          console.error("Payout notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      });
    }

    if (notifications.vendorAccount) {
      const vendor = notifications.vendorAccount;
      after(async () => {
        try {
          await notify({
            audience: "VENDOR",
            userId: null,
            category: "ACCOUNT",
            event: "vendor.account_status",
            title: `Vendor account ${vendor.status.toLowerCase()}`,
            body: `Your vendor account is now ${vendor.status.toLowerCase()}.`,
            href: "/vendor-dashboard",
            email: {
              event: "vendor.account_status",
              to: vendor.email,
              context: { businessName: vendor.businessName, status: vendor.status, reason: vendor.reason },
              idempotencyParts: [vendor.email, vendor.status],
            },
          });
          await notifyAdmins({
            event: "admin.vendor_status_changed",
            category: "ACCOUNT",
            title: `Vendor ${vendor.status.toLowerCase()}`,
            body: `${vendor.businessName} is now ${vendor.status.toLowerCase()}.`,
            href: "/admin",
            idempotencyParts: [vendor.email, vendor.status],
            toggle: "adminVendorAlerts",
          });
        } catch (error) {
          console.error("Vendor account notification could not be queued.", error instanceof Error ? error.name : "Unknown error");
        }
      });
    }

    return Response.json({ ok: true, message: result });
  } catch (error) {
    if (error instanceof ManagementError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "That email or phone number is already assigned to another account." }, { status: 409 });
    }
    console.error("Admin management operation failed.", error);
    return Response.json({ error: "The requested admin action could not be completed." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizeAdminRequest(request, true);
  if (denied) return denied;

  let input: unknown;
  try {
    input = await readJsonBody(request, 2048);
  } catch (error) {
    return Response.json(
      { error: error instanceof RangeError ? error.message : "Invalid request." },
      { status: error instanceof RangeError ? 413 : 400 },
    );
  }
  const resetSchema = z.object({
    confirmation: z.literal("CLEAR ALL DATA"),
    password: z.string().min(1).max(1024),
  });
  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { error: 'Type "CLEAR ALL DATA" and re-enter your admin password to confirm this irreversible reset.' },
      { status: 400 },
    );
  }

  const adminConfig = getAdminSessionConfig();
  if (!adminConfig) {
    return Response.json({ error: "Administrator access is not configured on this server." }, { status: 503 });
  }

  const resetLimit = await hitRateLimit(
    "adminReset",
    rateLimitKey("admin-reset", adminConfig.email, getClientKeyFromHeaders(request.headers)),
  );
  if (!resetLimit.ok) {
    return rateLimitResponse(
      resetLimit.retryAfterSeconds,
      "Too many reset attempts. Please wait before trying again.",
    );
  }

  let credentials: Awaited<ReturnType<typeof verifyAdminCredentials>>;
  try {
    credentials = await verifyAdminCredentials(adminConfig.email, parsed.data.password);
  } catch (error) {
    console.error("Admin reset credentials could not be verified.", error instanceof Error ? error.name : "Unknown error");
    return Response.json({ error: "Could not verify admin credentials." }, { status: 503 });
  }
  if (!credentials.configured || !credentials.valid) {
    return Response.json(
      { error: "Administrator password is incorrect." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    await prisma.$executeRaw`TRUNCATE TABLE ${allApplicationTables} RESTART IDENTITY CASCADE`;
    await prisma.activityLog.create({
      data: {
        action: "admin.reset_all_application_data",
        entityType: "database",
        metadata: {
          confirmedBy: adminConfig.email,
          source: "admin-management-api",
        },
      },
    });
    return Response.json({
      ok: true,
      message: "All application accounts, vendors, orders, payments, revenue records, and related data were cleared. The schema and admin sign-in remain intact.",
    });
  } catch (error) {
    console.error("Admin database reset failed.", error);
    return Response.json({ error: "The database reset failed. No success was reported; check the server logs." }, { status: 503 });
  }
}

class ManagementError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
