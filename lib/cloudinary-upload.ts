import "server-only";

import { createHash } from "node:crypto";

export async function uploadMealImage(file: File) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Meal image uploads are not configured. Set the Cloudinary server credentials.");
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new TypeError("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new RangeError("Choose an image smaller than 5 MB.");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder = "eatry-hub/meals";
  const signature = createHash("sha1")
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest("hex");
  const body = new FormData();
  body.set("file", file);
  body.set("api_key", apiKey);
  body.set("timestamp", timestamp);
  body.set("folder", folder);
  body.set("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
    method: "POST",
    body,
    cache: "no-store",
  });
  const result = await response.json() as { secure_url?: unknown; error?: { message?: string } };
  if (!response.ok || typeof result.secure_url !== "string" || !result.secure_url.startsWith("https://res.cloudinary.com/")) {
    throw new Error(result.error?.message ?? "The image service rejected the upload.");
  }
  return result.secure_url;
}
