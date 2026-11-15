import { MealStatus, Prisma, UserRole, UserStatus, VendorStatus } from "@prisma/client";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { optionalMealImageUrlSchema } from "@/lib/menu-image-url";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  isAvailable: z.boolean().optional(),
  soldOut: z.boolean().optional(),
  published: z.boolean().optional(),
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().min(5).max(1000).optional(),
  price: z.coerce.number().finite().min(0.01).max(100000).optional(),
  smallPrice: z.coerce.number().finite().min(0.01).max(100000).nullable().optional(),
  mediumPrice: z.coerce.number().finite().min(0.01).max(100000).nullable().optional(),
  largePrice: z.coerce.number().finite().min(0.01).max(100000).nullable().optional(),
  preparationMinutes: z.number().int().min(1).max(600).nullable().optional(),
  imageUrl: optionalMealImageUrlSchema,
}).refine((value) => Object.values(value).some((entry) => entry !== undefined), {
  message: "Choose an availability or publishing change.",
});

async function getRestaurantId() {
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
  return restaurant?.id ?? null;
}

export async function PATCH(request: Request, context: { params: Promise<{ mealId: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });

  let input: unknown;
  try {
    input = await readJsonBody(request, 2048);
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 });
  }
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });

  const { mealId } = await context.params;
  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const meal = await transaction.meal.findFirst({
        where: { id: mealId, restaurantId },
        select: { id: true },
      });
      if (!meal) return false;

      await transaction.meal.update({
        where: { id: meal.id },
        data: {
          isAvailable: parsed.data.soldOut === true ? false : parsed.data.soldOut === false ? true : parsed.data.isAvailable,
          name: parsed.data.name,
          description: parsed.data.description,
          price: parsed.data.price === undefined ? undefined : new Prisma.Decimal(parsed.data.price.toFixed(2)),
          smallPrice: parsed.data.smallPrice === undefined ? undefined : parsed.data.smallPrice === null ? null : new Prisma.Decimal(parsed.data.smallPrice.toFixed(2)),
          mediumPrice: parsed.data.mediumPrice === undefined ? undefined : parsed.data.mediumPrice === null ? null : new Prisma.Decimal(parsed.data.mediumPrice.toFixed(2)),
          largePrice: parsed.data.largePrice === undefined ? undefined : parsed.data.largePrice === null ? null : new Prisma.Decimal(parsed.data.largePrice.toFixed(2)),
          preparationMinutes: parsed.data.preparationMinutes,
          status: parsed.data.soldOut === true
            ? MealStatus.SOLD_OUT
            : parsed.data.soldOut === false
              ? MealStatus.PUBLISHED
              : parsed.data.published === undefined
            ? undefined
            : parsed.data.published
              ? MealStatus.PUBLISHED
              : MealStatus.DRAFT,
        },
      });

      if (parsed.data.imageUrl !== undefined) {
        await transaction.mealImage.deleteMany({ where: { mealId: meal.id } });
        if (parsed.data.imageUrl) {
          await transaction.mealImage.create({
            data: { mealId: meal.id, url: parsed.data.imageUrl },
          });
        }
      }
      return true;
    });
    if (!updated) return Response.json({ error: "Menu item not found." }, { status: 404 });
    return Response.json({ ok: true, message: "Menu item updated." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("Vendor menu item update failed.", error);
    } else {
      console.error("Vendor menu item update failed.", error);
    }
    return Response.json({ error: "The menu item could not be updated." }, { status: 503 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ mealId: string }> }) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });

  const { mealId } = await context.params;
  try {
    const meal = await prisma.meal.findFirst({
      where: { id: mealId, restaurantId },
      select: { id: true, orderItems: { select: { id: true }, take: 1 } },
    });
    if (!meal) return Response.json({ error: "Menu item not found." }, { status: 404 });
    if (meal.orderItems.length) {
      await prisma.meal.update({
        where: { id: meal.id },
        data: { status: MealStatus.ARCHIVED, isAvailable: false },
      });
    } else {
      await prisma.meal.delete({ where: { id: meal.id } });
    }
    return Response.json({ ok: true, message: "Menu item removed from the marketplace." });
  } catch (error) {
    console.error("Vendor menu item could not be removed.", error);
    return Response.json({ error: "The menu item could not be removed." }, { status: 503 });
  }
}
