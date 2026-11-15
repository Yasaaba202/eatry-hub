import { z } from "zod";

const catalogImagePath = z.string()
  .max(2048)
  .regex(/^\/images\/food-catalog\/[a-z0-9][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i);

export const mealImageUrlSchema = z.union([
  z.string().url().max(2048),
  catalogImagePath,
]);

export const optionalMealImageUrlSchema = z.union([
  z.string().url().max(2048),
  catalogImagePath,
  z.literal(""),
]).optional();
