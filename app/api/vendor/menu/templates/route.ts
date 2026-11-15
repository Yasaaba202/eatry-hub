import { MealStatus, Prisma, UserRole, UserStatus, VendorStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { optionalMealImageUrlSchema } from "@/lib/menu-image-url";
import { resolveMenuTemplateImage } from "@/lib/menu-template-images";
import { prisma } from "@/lib/prisma";

const addTemplateSchema = z.object({
  templateId: z.string().min(1),
  description: z.string().trim().min(5).max(1000),
  price: z.coerce.number().finite().min(0.01).max(100000),
  smallPrice: z.coerce.number().finite().min(0.01).max(100000).optional(),
  mediumPrice: z.coerce.number().finite().min(0.01).max(100000).optional(),
  largePrice: z.coerce.number().finite().min(0.01).max(100000).optional(),
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
  ) return null;

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
    const categories = await prisma.category.findMany({
      where: { isActive: true, templates: { some: {} } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        templates: {
          orderBy: { name: "asc" },
          select: { id: true, name: true, description: true, imageUrl: true, imageStatus: true },
        },
      },
    });
    return Response.json({
      categories: categories.map((category) => ({
        ...category,
        templates: category.templates.map((template) => ({
          ...template,
          imageUrl: template.imageStatus === "VERIFIED" && template.imageUrl && !template.imageUrl.startsWith("/images/food-catalog/")
            ? template.imageUrl
            : resolveMenuTemplateImage(null, category.name, template.name),
        })),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Vendor food templates could not be loaded.", error);
    return Response.json({ error: "The food catalog could not be loaded." }, { status: 503 });
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
  const parsed = addTemplateSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });

  try {
    const template = await prisma.menuTemplate.findUnique({
      where: { id: parsed.data.templateId },
      select: { id: true, name: true, category: { select: { id: true, name: true } }, imageUrl: true, imageStatus: true },
    });
    if (!template) return Response.json({ error: "Food template not found." }, { status: 404 });

    const existing = await prisma.meal.findFirst({
      where: {
        restaurantId: vendor.restaurantId,
        name: { equals: template.name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existing) return Response.json({ error: "This food is already on your menu." }, { status: 409 });

    const imageUrl = parsed.data.imageUrl
      || (template.imageStatus === "VERIFIED" && template.imageUrl && !template.imageUrl.startsWith("/images/food-catalog/")
        ? template.imageUrl
        : resolveMenuTemplateImage(null, template.category.name, template.name));
    const meal = await prisma.meal.create({
      data: {
        restaurantId: vendor.restaurantId,
        categoryId: template.category.id,
        name: template.name,
        slug: `${template.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-${randomUUID().slice(0, 8)}`,
        description: parsed.data.description,
        price: new Prisma.Decimal(parsed.data.price.toFixed(2)),
        smallPrice: parsed.data.smallPrice === undefined ? null : new Prisma.Decimal(parsed.data.smallPrice.toFixed(2)),
        mediumPrice: parsed.data.mediumPrice === undefined ? null : new Prisma.Decimal(parsed.data.mediumPrice.toFixed(2)),
        largePrice: parsed.data.largePrice === undefined ? null : new Prisma.Decimal(parsed.data.largePrice.toFixed(2)),
        status: parsed.data.published ? MealStatus.PUBLISHED : MealStatus.DRAFT,
        isAvailable: true,
        images: imageUrl
          ? { create: { url: imageUrl } }
          : undefined,
      },
      select: { id: true },
    });
    return Response.json({ ok: true, mealId: meal.id, message: "Food added to your menu." }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return Response.json({ error: "This food is already on your menu." }, { status: 409 });
    }
    console.error("Vendor could not add a food template.", error);
    return Response.json({ error: "The food could not be added to your menu." }, { status: 503 });
  }
}
