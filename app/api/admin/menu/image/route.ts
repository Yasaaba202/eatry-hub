import { authorizeAdminRequest } from "@/lib/admin-api";
import { isSameOrigin } from "@/lib/api-security";
import { uploadMealImage } from "@/lib/cloudinary-upload";

export async function POST(request: Request) {
  const denied = await authorizeAdminRequest(request, true);
  if (denied) return denied;
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Admin food image form could not be read.", error);
    return Response.json({ error: "The image upload request is invalid." }, { status: 400 });
  }
  const file = formData.get("image");
  if (!(file instanceof File)) return Response.json({ error: "Choose an image file to upload." }, { status: 400 });

  try {
    const imageUrl = await uploadMealImage(file);
    return Response.json({ imageUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Admin food image upload failed.", error);
    return Response.json({ error: error instanceof Error ? error.message : "The image could not be uploaded." }, { status: 503 });
  }
}
