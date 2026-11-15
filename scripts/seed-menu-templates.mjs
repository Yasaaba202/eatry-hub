import { createRequire } from "node:module";
import { ghanaianFoodCategories } from "../lib/ghanaian-food-catalog.ts";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function slugify(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

try {
  for (const section of ghanaianFoodCategories) {
    const category = await prisma.category.upsert({
      where: { slug: slugify(section.name) },
      create: {
        name: section.name,
        slug: slugify(section.name),
        isActive: true,
      },
      update: { name: section.name, isActive: true },
      select: { id: true },
    });

    await prisma.menuTemplate.createMany({
      data: section.items.map((item) => ({
        categoryId: category.id,
        name: item,
        description: `Traditional Ghanaian ${item} from the ${section.name.toLowerCase()} collection. Add your serving details and price before listing it.`,
      })),
      skipDuplicates: true,
    });
  }
  console.log(`Seeded ${ghanaianFoodCategories.length} categories and reusable menu templates.`);
} finally {
  await prisma.$disconnect();
}
