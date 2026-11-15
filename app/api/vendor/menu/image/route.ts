import { UserRole, UserStatus, VendorStatus } from "@prisma/client";
import { getCurrentAccount } from "@/lib/account-auth";
import { isSameOrigin } from "@/lib/api-security";
import { uploadMealImage } from "@/lib/cloudinary-upload";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });

  const account = await getCurrentAccount();
  if (
    !account ||
    account.role !== UserRole.VENDOR ||
    account.status !== UserStatus.ACTIVE ||
    account.vendorProfile?.status !== VendorStatus.APPROVED
  ) {
    return Response.json({ error: "An approved vendor account is required." }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Vendor meal image form could not be read.", error);
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
    console.error("Vendor meal image upload failed.", error);
    return Response.json({ error: error instanceof Error ? error.message : "The image could not be uploaded." }, { status: 503 });
  }
}
