"use client";

import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AccountSignOut } from "@/app/account-sign-out";
import { NotificationBell } from "@/app/notification-bell";
import { foodCatalogPhotos } from "@/lib/menu-template-images";
import { VendorOrdersPanel } from "./vendor-orders-panel";
import { VendorPayoutsPanel } from "./vendor-payouts-panel";

type MenuMeal = {
  id: string;
  name: string;
  description: string;
  price: number;
  portionPrices: Array<{ size: "Small" | "Medium" | "Large"; price: number }>;
  preparationMinutes: number | null;
  status: "DRAFT" | "PUBLISHED" | "SOLD_OUT" | "ARCHIVED";
  isAvailable: boolean;
  imageUrl: string;
};

type MenuResponse = { meals?: MenuMeal[]; error?: string; message?: string };
type FoodTemplate = { id: string; name: string; description: string; imageUrl: string | null };
type FoodTemplateCategory = { id: string; name: string; templates: FoodTemplate[] };

export function VendorDashboardPreview({ storeName }: { storeName: string }) {
  const [meals, setMeals] = useState<MenuMeal[]>([]);
  const [templateCategories, setTemplateCategories] = useState<FoodTemplateCategory[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadMeals = useCallback(async () => {
    try {
      const response = await fetch("/api/vendor/menu", { cache: "no-store" });
      const result = await response.json() as MenuResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not load your menu.");
        return;
      }
      setMeals(result.meals ?? []);
      setError("");
    } catch (loadError) {
      console.error("Vendor menu request failed.", loadError);
      setError("Could not reach the server to load your menu.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const response = await fetch("/api/vendor/menu/templates", { cache: "no-store" });
      const result = await response.json() as { categories?: FoodTemplateCategory[]; error?: string };
      if (!response.ok) {
        setError(result.error ?? "Could not load the Ghanaian food catalog.");
        return;
      }
      setTemplateCategories(result.categories ?? []);
    } catch (loadError) {
      console.error("Vendor food catalog request failed.", loadError);
      setError("Could not reach the server to load the Ghanaian food catalog.");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadMeals(); void loadTemplates(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadMeals, loadTemplates]);

  const uploadImage = async (file: File) => {
    const body = new FormData();
    body.set("image", file);
    const response = await fetch("/api/vendor/menu/image", { method: "POST", body });
    const result = await response.json() as { imageUrl?: string; error?: string };
    if (!response.ok || !result.imageUrl) throw new Error(result.error ?? "Could not upload the image.");
    return result.imageUrl;
  };

  const createMeal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const imageFile = formData.get("imageFile");
      const imageUrl = imageFile instanceof File && imageFile.size > 0
        ? await uploadImage(imageFile)
        : String(formData.get("catalogImageUrl") || formData.get("imageUrl") || "");
      const response = await fetch("/api/vendor/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          description: formData.get("description"),
          price: Number(formData.get("price")),
          smallPrice: formData.get("smallPrice") ? Number(formData.get("smallPrice")) : undefined,
          mediumPrice: formData.get("mediumPrice") ? Number(formData.get("mediumPrice")) : undefined,
          largePrice: formData.get("largePrice") ? Number(formData.get("largePrice")) : undefined,
          preparationMinutes: formData.get("preparationMinutes") ? Number(formData.get("preparationMinutes")) : undefined,
          imageUrl,
          published: formData.get("published") === "on",
        }),
      });
      const result = await response.json() as MenuResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not save your meal.");
        return;
      }
      setMessage(result.message ?? "Menu item saved.");
      form.reset();
      await loadMeals();
    } catch (saveError) {
      console.error("Vendor menu item creation failed.", saveError);
      setError(saveError instanceof Error ? saveError.message : "Could not save your meal.");
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const imageFile = formData.get("imageFile");
      const imageUrl = imageFile instanceof File && imageFile.size > 0
        ? await uploadImage(imageFile)
        : String(formData.get("catalogImageUrl") || selectedTemplate?.imageUrl || "");
      const response = await fetch("/api/vendor/menu/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          description: formData.get("description"),
          price: Number(formData.get("price")),
          smallPrice: formData.get("smallPrice") ? Number(formData.get("smallPrice")) : undefined,
          mediumPrice: formData.get("mediumPrice") ? Number(formData.get("mediumPrice")) : undefined,
          largePrice: formData.get("largePrice") ? Number(formData.get("largePrice")) : undefined,
          imageUrl,
          published: formData.get("published") === "on",
        }),
      });
      const result = await response.json() as MenuResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not add that food to your menu.");
        return;
      }
      setMessage(result.message ?? "Food added to your menu.");
      form.reset();
      setSelectedTemplateId("");
      await loadMeals();
    } catch (addError) {
      console.error("Vendor could not add a food template.", addError);
      setError(addError instanceof Error ? addError.message : "Could not add the food item.");
    } finally {
      setSaving(false);
    }
  };

  const selectedTemplate = templateCategories.flatMap((category) => category.templates)
    .find((template) => template.id === selectedTemplateId);
  const updateMeal = async (meal: MenuMeal, changes: { isAvailable?: boolean; published?: boolean; soldOut?: boolean }) => {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/vendor/menu/${encodeURIComponent(meal.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const result = await response.json() as MenuResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not update the menu item.");
        return;
      }
      setMessage(result.message ?? "Menu item updated.");
      await loadMeals();
    } catch (updateError) {
      console.error("Vendor menu item update failed.", updateError);
      setError("Could not reach the server to update the menu.");
    }
  };

  const editMeal = async (event: FormEvent<HTMLFormElement>, meal: MenuMeal) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const file = formData.get("imageFile");
      const imageUrl = file instanceof File && file.size > 0
        ? await uploadImage(file)
        : String(formData.get("catalogImageUrl") || formData.get("imageUrl") || "");
      const preparationMinutes = String(formData.get("preparationMinutes") ?? "");
      const response = await fetch(`/api/vendor/menu/${encodeURIComponent(meal.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          description: formData.get("description"),
          price: Number(formData.get("price")),
          smallPrice: formData.get("smallPrice") ? Number(formData.get("smallPrice")) : null,
          mediumPrice: formData.get("mediumPrice") ? Number(formData.get("mediumPrice")) : null,
          largePrice: formData.get("largePrice") ? Number(formData.get("largePrice")) : null,
          preparationMinutes: preparationMinutes ? Number(preparationMinutes) : null,
          imageUrl,
        }),
      });
      const result = await response.json() as MenuResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not save your menu changes.");
        return;
      }
      setMessage(result.message ?? "Menu item updated.");
      await loadMeals();
    } catch (editError) {
      console.error("Vendor menu item edit failed.", editError);
      setError(editError instanceof Error ? editError.message : "Could not save your menu changes.");
    } finally {
      setSaving(false);
    }
  };

  const removeMeal = async (meal: MenuMeal) => {
    if (!window.confirm(`Remove "${meal.name}" from the marketplace?`)) return;
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/vendor/menu/${encodeURIComponent(meal.id)}`, { method: "DELETE" });
      const result = await response.json() as MenuResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not remove the menu item.");
        return;
      }
      setMessage(result.message ?? "Menu item removed.");
      await loadMeals();
    } catch (removeError) {
      console.error("Vendor menu item removal failed.", removeError);
      setError("Could not reach the server to remove the menu item.");
    }
  };

  return (
    <main className="min-h-screen bg-[#fffaf4] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/brand/logo-mark.svg" alt="" width={30} height={30} className="h-[30px] w-[30px]" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Vendor dashboard</p>
            </div>
            <h1 className="mt-1 text-2xl font-black">{storeName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Marketplace</Link>
            <NotificationBell />
            <AccountSignOut />
          </div>
        </header>

        {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        <VendorOrdersPanel />
        <VendorPayoutsPanel />

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <form onSubmit={createMeal} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-xl font-black">Add a menu item</h2>
              <p className="mt-1 text-sm text-slate-600">Published and available meals appear in the customer marketplace.</p>
            </div>
            <label className="block space-y-1 text-sm font-medium">Name<input required minLength={2} maxLength={120} name="name" className="w-full rounded-xl border px-3 py-2.5" /></label>
            <label className="block space-y-1 text-sm font-medium">Description<textarea required minLength={5} maxLength={1000} name="description" className="w-full rounded-xl border px-3 py-2.5" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm font-medium">Price (GHS)<input required type="number" min="0.01" step="0.01" max="100000" name="price" className="w-full rounded-xl border px-3 py-2.5" /></label>
              <label className="block space-y-1 text-sm font-medium">Prep time (minutes)<input type="number" min="1" max="600" name="preparationMinutes" className="w-full rounded-xl border px-3 py-2.5" /></label>
            </div>
            <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
              <legend className="px-1 text-sm font-semibold">Optional portion prices (GHS)</legend>
              <label className="space-y-1 text-xs">Small<input type="number" min="0.01" step="0.01" max="100000" name="smallPrice" className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
              <label className="space-y-1 text-xs">Medium<input type="number" min="0.01" step="0.01" max="100000" name="mediumPrice" className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
              <label className="space-y-1 text-xs">Large<input type="number" min="0.01" step="0.01" max="100000" name="largePrice" className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
            </fieldset>
            <label className="block space-y-1 text-sm font-medium">Choose a ready-made food photo
              <select name="catalogImageUrl" defaultValue="" className="w-full rounded-xl border px-3 py-2.5">
                <option value="">No photo selected</option>
                {foodCatalogPhotos.map((photo) => <option key={photo.src} value={photo.src}>{photo.label}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium">Or upload your own photo (requires Cloudinary setup; JPEG, PNG, or WebP, up to 5 MB)<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" className="w-full rounded-xl border px-3 py-2.5" /></label>
            <label className="block space-y-1 text-sm font-medium">Or image URL<input type="url" maxLength={2048} name="imageUrl" placeholder="https://..." className="w-full rounded-xl border px-3 py-2.5" /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked /> Publish this item now</label>
            <button disabled={saving} className="w-full rounded-full bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save menu item"}</button>
            </form>

            <form onSubmit={addTemplate} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <h2 className="text-xl font-black">Add a Ghanaian food</h2>
                <p className="mt-1 text-sm text-slate-600">Choose a catalog item, set your own price and description, and upload your dish photo. Nothing is listed until you add it.</p>
              </div>
              <label className="block space-y-1 text-sm font-medium">
                Category and food
                <select required value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="w-full rounded-xl border px-3 py-2.5">
                  <option value="">{templatesLoading ? "Loading food catalog…" : "Choose a food"}</option>
                  {templateCategories.map((category) => (
                    <optgroup key={category.id} label={category.name}>
                      {category.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              {selectedTemplate?.imageUrl && (
                <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-3">
                  <Image src={selectedTemplate.imageUrl} alt={selectedTemplate.name} width={96} height={72} unoptimized className="h-[4.5rem] w-24 rounded-lg object-cover" />
                  <div>
                    <p className="text-sm font-semibold">{selectedTemplate.name}</p>
                    <p className="text-xs text-slate-600">Catalog photo for this dish. Upload your own serving photo to replace it.</p>
                  </div>
                </div>
              )}
              <label className="block space-y-1 text-sm font-medium">Description<textarea required minLength={5} maxLength={1000} name="description" key={selectedTemplate?.id ?? "template-description"} defaultValue={selectedTemplate?.description ?? ""} className="w-full rounded-xl border px-3 py-2.5" /></label>
              <label className="block space-y-1 text-sm font-medium">Your price (GHS)<input required type="number" min="0.01" step="0.01" max="100000" name="price" className="w-full rounded-xl border px-3 py-2.5" /></label>
              <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
                <legend className="px-1 text-sm font-semibold">Optional portion prices (GHS)</legend>
                <label className="space-y-1 text-xs">Small<input type="number" min="0.01" step="0.01" max="100000" name="smallPrice" className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
                <label className="space-y-1 text-xs">Medium<input type="number" min="0.01" step="0.01" max="100000" name="mediumPrice" className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
                <label className="space-y-1 text-xs">Large<input type="number" min="0.01" step="0.01" max="100000" name="largePrice" className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
              </fieldset>
              <label className="block space-y-1 text-sm font-medium">Choose a ready-made photo or keep the food&apos;s default
                <select name="catalogImageUrl" key={selectedTemplate?.id ?? "template-photo"} defaultValue={selectedTemplate?.imageUrl ?? ""} className="w-full rounded-xl border px-3 py-2.5">
                  <option value="">Use the selected food&apos;s default photo</option>
                  {foodCatalogPhotos.map((photo) => <option key={photo.src} value={photo.src}>{photo.label}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm font-medium">Or upload your own photo (requires Cloudinary setup)<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" className="w-full rounded-xl border px-3 py-2.5" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked /> Publish this item now</label>
              <button disabled={saving || templatesLoading || !selectedTemplateId} className="w-full rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Adding…" : "Add food to my menu"}</button>
            </form>
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">My Kitchen Menu</h2>
                <p className="mt-1 text-sm text-slate-600">Only published, available meals can be ordered.</p>
              </div>
              <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-800">{meals.length} items</span>
            </div>
            {loading ? <p className="mt-5 text-sm text-slate-500">Loading menu...</p> : meals.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">Your menu is empty. Add and publish meals so customers can discover them.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {meals.map((meal) => (
                  <li key={meal.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      {meal.imageUrl ? (
                        <Image src={meal.imageUrl} alt={meal.name} width={96} height={72} unoptimized className="h-[4.5rem] w-24 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-[4.5rem] w-24 items-center justify-center rounded-xl bg-orange-50 text-xs text-orange-800">No photo</div>
                      )}
                      {meal.imageUrl.startsWith("/images/food-catalog/") && (
                        <span className="text-xs text-slate-500">Representative category photo — upload your dish photo to replace it.</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{meal.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">{meal.description}</p>
                        <p className="mt-2 text-sm font-semibold">GHS {meal.price.toFixed(2)} · {meal.status.replaceAll("_", " ")} · {meal.isAvailable ? "Available" : "Unavailable"}</p>
                        {meal.portionPrices.length > 0 && <p className="mt-1 text-xs text-slate-500">{meal.portionPrices.map((portion) => `${portion.size}: GHS ${portion.price.toFixed(2)}`).join(" · ")}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={(event) => {
                          const editor = event.currentTarget.closest("li")?.querySelector("details");
                          if (editor) editor.open = !editor.open;
                        }} className="rounded-full border px-3 py-1.5 text-xs font-semibold">Edit details</button>
                        <button onClick={() => void updateMeal(meal, { published: meal.status !== "PUBLISHED" })} className="rounded-full border px-3 py-1.5 text-xs font-semibold">{meal.status === "PUBLISHED" ? "Unpublish" : "Publish"}</button>
                        <button onClick={() => void updateMeal(meal, { isAvailable: !meal.isAvailable })} className="rounded-full border px-3 py-1.5 text-xs font-semibold">{meal.isAvailable ? "Mark unavailable" : "Mark available"}</button>
                        <button onClick={() => void updateMeal(meal, { soldOut: meal.status !== "SOLD_OUT" })} className="rounded-full border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800">{meal.status === "SOLD_OUT" ? "Return to menu" : "Mark sold out"}</button>
                        <button onClick={() => void removeMeal(meal)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">Remove</button>
                      </div>
                    </div>
                    <details className="mt-4 border-t border-slate-100 pt-3">
                      <summary className="sr-only">Edit {meal.name}</summary>
                      <form onSubmit={(event) => void editMeal(event, meal)} className="space-y-3">
                        <label className="block space-y-1 text-sm font-medium">Name<input required minLength={2} maxLength={120} name="name" defaultValue={meal.name} className="w-full rounded-xl border px-3 py-2.5" /></label>
                        <label className="block space-y-1 text-sm font-medium">Description<textarea required minLength={5} maxLength={1000} name="description" defaultValue={meal.description} className="w-full rounded-xl border px-3 py-2.5" /></label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block space-y-1 text-sm font-medium">Price (GHS)<input required type="number" min="0.01" step="0.01" max="100000" name="price" defaultValue={meal.price} className="w-full rounded-xl border px-3 py-2.5" /></label>
                          <label className="block space-y-1 text-sm font-medium">Prep time (minutes)<input type="number" min="1" max="600" name="preparationMinutes" defaultValue={meal.preparationMinutes ?? ""} className="w-full rounded-xl border px-3 py-2.5" /></label>
                        </div>
                        <fieldset className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
                          <legend className="px-1 text-sm font-semibold">Optional portion prices (GHS)</legend>
                          <label className="space-y-1 text-xs">Small<input type="number" min="0.01" step="0.01" max="100000" name="smallPrice" defaultValue={meal.portionPrices.find((portion) => portion.size === "Small")?.price ?? ""} className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
                          <label className="space-y-1 text-xs">Medium<input type="number" min="0.01" step="0.01" max="100000" name="mediumPrice" defaultValue={meal.portionPrices.find((portion) => portion.size === "Medium")?.price ?? ""} className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
                          <label className="space-y-1 text-xs">Large<input type="number" min="0.01" step="0.01" max="100000" name="largePrice" defaultValue={meal.portionPrices.find((portion) => portion.size === "Large")?.price ?? ""} className="w-full rounded-lg border px-2 py-2 text-sm" /></label>
                        </fieldset>
                        <label className="block space-y-1 text-sm font-medium">Image URL or local catalog path (leave blank to remove)<input type="text" maxLength={2048} name="imageUrl" defaultValue={meal.imageUrl} className="w-full rounded-xl border px-3 py-2.5" /></label>
                        <label className="block space-y-1 text-sm font-medium">Or choose a ready-made photo
                          <select name="catalogImageUrl" defaultValue={meal.imageUrl.startsWith("/images/food-catalog/") ? meal.imageUrl : ""} className="w-full rounded-xl border px-3 py-2.5">
                            <option value="">Keep image URL above</option>
                            {foodCatalogPhotos.map((photo) => <option key={photo.src} value={photo.src}>{photo.label}</option>)}
                          </select>
                        </label>
                        <label className="block space-y-1 text-sm font-medium">Or upload a replacement photo (requires Cloudinary setup)<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" className="w-full rounded-xl border px-3 py-2.5" /></label>
                        <button disabled={saving} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save menu changes"}</button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
