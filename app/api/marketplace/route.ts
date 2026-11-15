import { UserStatus, VendorStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { resolveMenuTemplateImage } from "@/lib/menu-template-images";
import { prisma } from "@/lib/prisma";

const destinationSchema = z.object({
  MTN: z.object({ accountName: z.string().trim().min(2), accountNumber: z.string().trim().min(7) }),
  TELECEL: z.object({ accountName: z.string().trim().min(2), accountNumber: z.string().trim().min(7) }),
});

export async function GET() {
  try {
    const [restaurants, destinationSetting] = await Promise.all([
      prisma.restaurant.findMany({
      where: {
        isVisible: true,
        isPaused: false,
        vendor: {
          status: VendorStatus.APPROVED,
          user: { status: UserStatus.ACTIVE },
        },
        meals: {
          some: { status: "PUBLISHED", isAvailable: true },
        },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        vendorId: true,
        name: true,
        description: true,
        location: true,
        coverUrl: true,
        logoUrl: true,
        category: { select: { name: true } },
        meals: {
          where: { status: "PUBLISHED", isAvailable: true },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            discountedPrice: true,
            smallPrice: true,
            mediumPrice: true,
            largePrice: true,
            preparationMinutes: true,
            createdAt: true,
            category: { select: { name: true } },
            images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
          },
        },
      },
      }),
      prisma.platformSetting.findUnique({
        where: { key: "mobile_money_destinations" },
        select: { value: true },
      }),
    ]);
    const destinations = destinationSchema.safeParse(destinationSetting?.value);

    return Response.json({
      mobileMoneyDestinations: destinations.success ? destinations.data : null,
      vendors: restaurants.map((restaurant) => ({
        id: restaurant.vendorId,
        restaurantId: restaurant.id,
        name: restaurant.name,
        category: restaurant.category?.name ?? "Local food",
        location: restaurant.location,
        description: restaurant.description,
        cover: restaurant.coverUrl ?? restaurant.logoUrl ?? "/images/hero-jollof.webp",
      })),
      meals: restaurants.flatMap((restaurant) =>
        restaurant.meals.map((meal) => ({
          id: meal.id,
          name: meal.name,
          vendor: restaurant.name,
          vendorId: restaurant.vendorId,
          price: Number(meal.discountedPrice ?? meal.price),
          portions: [
            meal.smallPrice ? { size: "Small", price: Number(meal.smallPrice) } : null,
            meal.mediumPrice ? { size: "Medium", price: Number(meal.mediumPrice) } : null,
            meal.largePrice ? { size: "Large", price: Number(meal.largePrice) } : null,
          ].filter((portion): portion is { size: string; price: number } => portion !== null),
          category: meal.category?.name ?? restaurant.category?.name ?? "Food",
          image: resolveMenuTemplateImage(meal.images[0]?.url, meal.category?.name, meal.name),
          prepTime: meal.preparationMinutes ? `${meal.preparationMinutes} mins` : "Made fresh",
          description: meal.description,
          createdAt: meal.createdAt.toISOString(),
        })),
      ),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error("Marketplace database connection failed.", error);
    } else {
      console.error("Marketplace data could not be loaded.", error);
    }
    return Response.json({ error: "The live marketplace is temporarily unavailable." }, { status: 503 });
  }
}
