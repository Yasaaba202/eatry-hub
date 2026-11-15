import { MealStatus, Prisma, UserRole, UserStatus, VendorStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { optionalMealImageUrlSchema } from "@/lib/menu-image-url";
import { resolveMenuTemplateImage } from "@/lib/menu-template-images";
import { prisma } from "@/lib/prisma";

const mealSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(5).max(1000),
  price: z.coerce.number().finite().min(0.01).max(100000),
  smallPrice: z.coerce.number().finite().min(0.01).max(100000).optional(),
  mediumPrice: z.coerce.number().finite().min(0.01).max(100000).optional(),
  largePrice: z.coerce.number().finite().min(0.01).max(100000).optional(),
  preparationMinutes: z.coerce.number().int().min(1).max(600).optional(),
  imageUrl: optionalMealImageUrlSchema,
  published: z.boolean(),
});

async function getApprovedVendor() {
  const account = await getCurrentAccount();
  if (
    !account ||
    account.role !== UserRole.VENDOR ||
    account.status !== UserStatus.ACTIVE ||
    !account.vendorProfile ||
    account.vendorProfile.status !== VendorStatus.APPROVED
  ) {
    return null;
  }
  const restaurant = await prisma.restaurant.findUnique({
    where: { vendorId: account.vendorProfile.id },
    select: { id: true },
  });
  return restaurant ? { vendorId: account.vendorProfile.id, restaurantId: restaurant.id } : null;
}

export async function GET() {
  const vendor = await getApprovedVendor();
  if (!vendor) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });

  try {
    const meals = await prisma.meal.findMany({
      where: { restaurantId: vendor.restaurantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        smallPrice: true,
        mediumPrice: true,
        largePrice: true,
        preparationMinutes: true,
        status: true,
        isAvailable: true,
        category: { select: { name: true } },
        images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
      },
    });
    return Response.json({
      meals: meals.map((meal) => ({
        ...meal,
        price: Number(meal.price),
        portionPrices: [
          meal.smallPrice ? { size: "Small", price: Number(meal.smallPrice) } : null,
          meal.mediumPrice ? { size: "Medium", price: Number(meal.mediumPrice) } : null,
          meal.largePrice ? { size: "Large", price: Number(meal.largePrice) } : null,
        ].filter((portion): portion is { size: string; price: number } => portion !== null),
        imageUrl: resolveMenuTemplateImage(meal.images[0]?.url, meal.category?.name, meal.name) ?? "",
        images: undefined,
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Vendor menu could not be loaded.", error);
    return Response.json({ error: "The menu could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const vendor = await getApprovedVendor();
  if (!vendor) return Response.json({ error: "An approved vendor account is required." }, { status: 403 });

  let input: unknown;
  try {
    input = await readJsonBody(request, 8192);
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 });
  }
  const parsed = mealSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });

  try {
    const meal = await prisma.meal.create({
      data: {
        restaurantId: vendor.restaurantId,
        name: parsed.data.name,
        slug: `${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "meal"}-${randomUUID().slice(0, 8)}`,
        description: parsed.data.description,
        price: new Prisma.Decimal(parsed.data.price.toFixed(2)),
        smallPrice: parsed.data.smallPrice === undefined ? null : new Prisma.Decimal(parsed.data.smallPrice.toFixed(2)),
        mediumPrice: parsed.data.mediumPrice === undefined ? null : new Prisma.Decimal(parsed.data.mediumPrice.toFixed(2)),
        largePrice: parsed.data.largePrice === undefined ? null : new Prisma.Decimal(parsed.data.largePrice.toFixed(2)),
        preparationMinutes: parsed.data.preparationMinutes,
        status: parsed.data.published ? MealStatus.PUBLISHED : MealStatus.DRAFT,
        isAvailable: true,
        images: parsed.data.imageUrl
          ? { create: { url: parsed.data.imageUrl } }
          : undefined,
      },
      select: { id: true },
    });
    return Response.json({ ok: true, mealId: meal.id, message: parsed.data.published ? "Meal published to the marketplace." : "Meal saved as a draft." }, { status: 201 });
  } catch (error) {
    console.error("Vendor menu item could not be created.", error);
    return Response.json({ error: "The meal could not be saved." }, { status: 503 });
  }
}
