import { Prisma } from "@prisma/client";
import { z } from "zod";
import { authorizeAdminRequest } from "@/lib/admin-api";
import { isSameOrigin, readJsonBody } from "@/lib/api-security";
import { optionalMealImageUrlSchema } from "@/lib/menu-image-url";
import { resolveMenuTemplateImage } from "@/lib/menu-template-images";
import { prisma } from "@/lib/prisma";

const saveSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("category"),
    id: z.string().optional(),
    name: z.string().trim().min(2).max(100),
  }),
  z.object({
    type: z.literal("food"),
    id: z.string().optional(),
    categoryId: z.string().min(1),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(5).max(1000),
    imageUrl: optionalMealImageUrlSchema,
  }),
  z.object({
    type: z.literal("image-status"),
    id: z.string().min(1),
    status: z.enum(["VERIFIED", "NEEDS_REVIEW", "AWAITING_IMAGE"]),
  }),
]);

const deleteSchema = z.object({
  type: z.enum(["category", "food"]),
  id: z.string().min(1),
});

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(request: Request) {
  const denied = await authorizeAdminRequest(request);
  if (denied) return denied;

  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        templates: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            imageSourceUrl: true,
            imageAuthor: true,
            imageLicense: true,
            imageLicenseUrl: true,
            imageStatus: true,
            imageImportError: true,
            imageLastTriedAt: true,
          },
        },
      },
    });
    return Response.json({
      categories: categories.map((category) => ({
        ...category,
        templates: category.templates.map((template) => ({
          ...template,
          imageUrl: resolveMenuTemplateImage(template.imageUrl, category.name, template.name),
        })),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin menu catalog could not be loaded.", error);
    return Response.json({ error: "The food catalog could not be loaded." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await authorizeAdminRequest(request, true);
  if (denied) return denied;
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  let input: unknown;
  try {
    input = await readJsonBody(request, 8192);
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 });
  }
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(" ") }, { status: 400 });

  try {
    if (parsed.data.type === "image-status") {
      const template = await prisma.menuTemplate.findUnique({ where: { id: parsed.data.id }, select: { id: true, imageUrl: true, imageSourceUrl: true, imageLicense: true } });
      if (!template) return Response.json({ error: "The food item was not found." }, { status: 404 });
      if (parsed.data.status === "VERIFIED" && (!template.imageUrl || !template.imageSourceUrl || !template.imageLicense)) {
        return Response.json({ error: "A sourced, licensed photo is required before it can be verified." }, { status: 400 });
      }
      await prisma.menuTemplate.update({ where: { id: parsed.data.id }, data: { imageStatus: parsed.data.status, imageImportError: null } });
      return Response.json({ ok: true, message: parsed.data.status === "VERIFIED" ? "Food photo verified." : "Food photo status updated." });
    }

    if (parsed.data.type === "category") {
      const slug = slugify(parsed.data.name);
      if (!slug) return Response.json({ error: "Enter a category name containing letters or numbers." }, { status: 400 });
      if (parsed.data.id) {
        const category = await prisma.category.update({
          where: { id: parsed.data.id },
          data: { name: parsed.data.name, slug },
          select: { id: true },
        });
        return Response.json({ ok: true, id: category.id, message: "Category updated." });
      }
      const category = await prisma.category.create({
        data: { name: parsed.data.name, slug },
        select: { id: true },
      });
      return Response.json({ ok: true, id: category.id, message: "Category added." }, { status: 201 });
    }

    const slug = slugify(parsed.data.name);
    if (!slug) return Response.json({ error: "Enter a food name containing letters or numbers." }, { status: 400 });
    const food = parsed.data.id
      ? await prisma.menuTemplate.update({
          where: { id: parsed.data.id },
          data: {
            name: parsed.data.name,
            description: parsed.data.description,
            imageUrl: parsed.data.imageUrl || null,
            imageSourceUrl: null,
            imageAuthor: null,
            imageLicense: null,
            imageLicenseUrl: null,
            imageSha256: null,
            imageImportError: null,
            imageStatus: parsed.data.imageUrl ? "NEEDS_REVIEW" : "PENDING",
            categoryId: parsed.data.categoryId,
          },
          select: { id: true },
        })
      : await prisma.menuTemplate.create({
          data: {
            categoryId: parsed.data.categoryId,
            name: parsed.data.name,
            description: parsed.data.description,
            imageUrl: parsed.data.imageUrl || null,
            imageSourceUrl: null,
            imageAuthor: null,
            imageLicense: null,
            imageLicenseUrl: null,
            imageSha256: null,
            imageImportError: null,
            imageStatus: parsed.data.imageUrl ? "NEEDS_REVIEW" : "PENDING",
          },
          select: { id: true },
        });
    return Response.json({ ok: true, id: food.id, message: parsed.data.id ? "Food item updated." : "Food item added." }, { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return Response.json({ error: "A category or food item with that name already exists." }, { status: 409 });
      if (error.code === "P2025") return Response.json({ error: "The category or food item was not found." }, { status: 404 });
    }
    console.error("Admin menu catalog update failed.", error);
    return Response.json({ error: "The catalog change could not be saved." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const denied = await authorizeAdminRequest(request, true);
  if (denied) return denied;
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  let input: unknown;
  try {
    input = await readJsonBody(request, 2048);
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : "Invalid request." }, { status: error instanceof RangeError ? 413 : 400 });
  }
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "Choose a valid catalog entry to remove." }, { status: 400 });

  try {
    if (parsed.data.type === "category") {
      await prisma.category.delete({ where: { id: parsed.data.id } });
    } else {
      await prisma.menuTemplate.delete({ where: { id: parsed.data.id } });
    }
    return Response.json({ ok: true, message: "Catalog entry deleted." });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return Response.json({ error: "The catalog entry was not found." }, { status: 404 });
    }
    console.error("Admin menu catalog entry could not be deleted.", error);
    return Response.json({ error: "The catalog entry could not be deleted." }, { status: 503 });
  }
}
