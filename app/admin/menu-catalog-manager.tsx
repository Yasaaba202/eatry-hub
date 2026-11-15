"use client";

import Image from "next/image";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/csrf-client";

type FoodTemplate = {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  imageSourceUrl: string | null;
  imageAuthor: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
  imageStatus: "PENDING" | "NEEDS_REVIEW" | "VERIFIED" | "AWAITING_IMAGE" | "FAILED";
  imageImportError: string | null;
  imageLastTriedAt: string | null;
};

type FoodCategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  templates: FoodTemplate[];
};

type CatalogResponse = { categories?: FoodCategory[]; error?: string; message?: string };
type ImageImportResponse = { counts?: Record<string, number>; recent?: FoodTemplate[]; log?: Array<Record<string, unknown>>; running?: boolean; error?: string; message?: string };

export function AdminMenuCatalogManager() {
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateImageUrl, setTemplateImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [imageImport, setImageImport] = useState<ImageImportResponse>({});
  const [importStarting, setImportStarting] = useState(false);

  const loadImageImport = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/menu/image-import", { cache: "no-store" });
      const result = await response.json() as ImageImportResponse;
      if (response.ok) setImageImport(result);
    } catch (loadError) {
      console.error("Food photo import status request failed.", loadError);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    try {
      const response = await apiFetch("/api/admin/menu", { cache: "no-store" });
      const result = await response.json() as CatalogResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not load the food catalog.");
        return;
      }
      const nextCategories = result.categories ?? [];
      setCategories(nextCategories);
      setSelectedCategoryId((current) =>
        nextCategories.some((category) => category.id === current)
          ? current
          : nextCategories[0]?.id ?? "",
      );
      await loadImageImport();
    } catch (loadError) {
      console.error("Admin food catalog request failed.", loadError);
      setError("Could not reach the server to load the food catalog.");
    } finally {
      setLoading(false);
    }
  }, [loadImageImport]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCatalog(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCatalog]);

  useEffect(() => {
    if (!imageImport.running) return;
    const timer = window.setInterval(() => void loadImageImport(), 3000);
    return () => window.clearInterval(timer);
  }, [imageImport.running, loadImageImport]);

  const save = async (payload: Record<string, unknown>) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/api/admin/menu", {
        method: "POST",
        
        body: JSON.stringify(payload),
      });
      const result = await response.json() as CatalogResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not save the catalog change.");
        return false;
      }
      setMessage(result.message ?? "Catalog updated.");
      await loadCatalog();
      return true;
    } catch (saveError) {
      console.error("Admin food catalog change failed.", saveError);
      setError("Could not reach the server to save the catalog change.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async (type: "category" | "food", id: string, label: string) => {
    if (!window.confirm(`Delete "${label}" from the default food catalog? Existing vendor menu items are not deleted.`)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/api/admin/menu", {
        method: "DELETE",
        
        body: JSON.stringify({ type, id }),
      });
      const result = await response.json() as CatalogResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not delete the catalog entry.");
        return;
      }
      setMessage(result.message ?? "Catalog entry deleted.");
      if (type === "category" && categoryId === id) setCategoryId("");
      if (type === "food" && editingTemplateId === id) resetTemplate();
      await loadCatalog();
    } catch (deleteError) {
      console.error("Admin catalog deletion failed.", deleteError);
      setError("Could not reach the server to delete the catalog entry.");
    } finally {
      setSaving(false);
    }
  };

  const resetTemplate = () => {
    setEditingTemplateId("");
    setTemplateName("");
    setTemplateDescription("");
    setTemplateImageUrl("");
  };

  const startImageImport = async () => {
    setImportStarting(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/api/admin/menu/image-import", { method: "POST" });
      const result = await response.json() as ImageImportResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not start the photo import.");
        return;
      }
      setMessage(result.message ?? "The photo import has started.");
      window.setTimeout(() => void loadImageImport(), 1000);
    } catch (startError) {
      console.error("Food photo import could not start.", startError);
      setError("Could not reach the server to start the photo import.");
    } finally {
      setImportStarting(false);
    }
  };

  const setImageStatus = async (id: string, status: "VERIFIED" | "AWAITING_IMAGE") => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch("/api/admin/menu", {
        method: "POST",
        
        body: JSON.stringify({ type: "image-status", id, status }),
      });
      const result = await response.json() as CatalogResponse;
      if (!response.ok) {
        setError(result.error ?? "Could not update the photo status.");
        return;
      }
      setMessage(result.message ?? "Photo status updated.");
      await loadCatalog();
    } catch (statusError) {
      console.error("Food photo status could not be changed.", statusError);
      setError("Could not reach the server to update the photo status.");
    } finally {
      setSaving(false);
    }
  };

  const submitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await save({
      type: "category",
      id: editingCategoryId || undefined,
      name: categoryName,
    });
    if (saved) {
      setCategoryName("");
      setEditingCategoryId("");
    }
  };

  const submitTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("imageFile");
    let imageUrl = templateImageUrl;
    if (file instanceof File && file.size > 0) {
      const body = new FormData();
      body.set("image", file);
      setSaving(true);
      setError("");
      try {
        const upload = await apiFetch("/api/admin/menu/image", { method: "POST", body });
        const result = await upload.json() as { imageUrl?: string; error?: string };
        if (!upload.ok || !result.imageUrl) {
          setError(result.error ?? "Could not upload the food image.");
          return;
        }
        imageUrl = result.imageUrl;
      } catch (uploadError) {
        console.error("Admin menu image upload failed.", uploadError);
        setError("Could not reach the server to upload the food image.");
        return;
      } finally {
        setSaving(false);
      }
    }

    const saved = await save({
      type: "food",
      id: editingTemplateId || undefined,
      categoryId,
      name: templateName,
      description: templateDescription,
      imageUrl,
    });
    if (saved) resetTemplate();
  };

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
  const photosNeedingReview = (imageImport.recent ?? []).filter((template) => template.imageStatus === "NEEDS_REVIEW");

  return (
    <section className="mt-8 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-2xl font-black">Food categories and default menu</h2>
        <p className="mt-1 text-sm text-slate-600">Manage the shared Ghanaian food catalog. Vendors can add catalog foods to their menus and set their own prices.</p>
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">Automatic food photo import</h3>
            <p className="text-sm text-slate-600">Searches Wikimedia Commons for reusable dish photos, uploads matches to Supabase Storage and records attribution. Imported matches wait for visual verification before vendors can use them.</p>
          </div>
          <button type="button" disabled={importStarting || imageImport.running} onClick={() => void startImageImport()} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{importStarting || imageImport.running ? "Importing photos…" : "Import missing photos"}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {(["VERIFIED", "NEEDS_REVIEW", "PENDING", "AWAITING_IMAGE", "FAILED"] as const).map((status) => <span key={status} className="rounded-full bg-white px-3 py-1">{status.replaceAll("_", " ")}: {imageImport.counts?.[status] ?? 0}</span>)}
        </div>
        {photosNeedingReview.length > 0 && <div className="mt-4 border-t border-orange-200 pt-4">
          <h4 className="font-bold">Photos needing review ({imageImport.counts?.NEEDS_REVIEW ?? photosNeedingReview.length})</h4>
          <p className="mt-1 text-sm text-slate-600">Check each photo and its source before approving it for vendor menus.</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {photosNeedingReview.map((template) => <li key={template.id} className="flex gap-3 rounded-xl border border-orange-200 bg-white p-3">
              {template.imageUrl ? <Image src={template.imageUrl} alt={`Photo for ${template.name}`} width={80} height={80} unoptimized className="h-20 w-20 shrink-0 rounded-lg object-cover" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs text-orange-800">No preview</div>}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{template.name}</p>
                <p className="text-xs text-slate-600">{template.imageLicense ?? "License unavailable"}{template.imageAuthor ? ` · ${template.imageAuthor}` : ""}</p>
                {template.imageSourceUrl && <a className="text-xs text-orange-700 underline" href={template.imageSourceUrl} target="_blank" rel="noreferrer">Open image source</a>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={saving} onClick={() => void setImageStatus(template.id, "VERIFIED")} className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800">Approve photo</button>
                  <button type="button" disabled={saving} onClick={() => void setImageStatus(template.id, "AWAITING_IMAGE")} className="rounded-lg border border-amber-300 px-2 py-1 text-xs text-amber-800">Reject match</button>
                </div>
              </div>
            </li>)}
          </ul>
        </div>}
        {imageImport.log?.length ? <div className="mt-3 border-t border-orange-100 pt-3"><p className="text-xs font-semibold text-slate-600">Recent import activity</p><ul className="mt-2 space-y-1">{imageImport.log.slice(0, 5).map((entry, index) => <li key={`${String(entry.at)}-${index}`} className="text-xs text-slate-600">{String(entry.dish ?? "Food item")} · {String(entry.result ?? "updated")}{entry.license ? ` · ${String(entry.license)}` : ""}{entry.error ? ` · ${String(entry.error)}` : ""}</li>)}</ul></div> : null}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-4">
          <form onSubmit={submitCategory} className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <h3 className="font-bold">{editingCategoryId ? "Edit category" : "Add category"}</h3>
            <input required minLength={2} maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Category name" className="w-full rounded-xl border px-3 py-2.5" />
            <div className="flex gap-2">
              <button disabled={saving} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{editingCategoryId ? "Save category" : "Add category"}</button>
              {editingCategoryId && <button type="button" onClick={() => { setEditingCategoryId(""); setCategoryName(""); }} className="rounded-full border px-4 py-2 text-sm">Cancel</button>}
            </div>
          </form>

          <div className="space-y-2">
            <h3 className="font-bold">Categories ({categories.length})</h3>
            {loading ? <p className="text-sm text-slate-500">Loading catalog…</p> : categories.map((category) => (
              <div key={category.id} className={`flex items-center gap-2 rounded-xl border p-3 ${category.id === selectedCategoryId ? "border-orange-400 bg-orange-50" : "border-slate-200"}`}>
                <button type="button" onClick={() => { setSelectedCategoryId(category.id); resetTemplate(); }} className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-semibold">{category.name}</span>
                  <span className="text-xs text-slate-500">{category.templates.length} foods</span>
                </button>
                <button type="button" aria-label={`Edit ${category.name}`} onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }} className="rounded-lg border bg-white px-2 py-1 text-xs">Edit</button>
                <button type="button" aria-label={`Delete ${category.name}`} disabled={saving} onClick={() => void remove("category", category.id, category.name)} className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-700">Delete</button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <form onSubmit={submitTemplate} className="space-y-3 rounded-2xl bg-slate-50 p-4">
            <h3 className="font-bold">{editingTemplateId ? "Edit catalog food" : "Add food to catalog"}</h3>
            <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="w-full rounded-xl border px-3 py-2.5">
              <option value="">Choose category</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <input required minLength={2} maxLength={120} value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Food name" className="w-full rounded-xl border px-3 py-2.5" />
            <textarea required minLength={5} maxLength={1000} value={templateDescription} onChange={(event) => setTemplateDescription(event.target.value)} placeholder="Food description" className="min-h-20 w-full rounded-xl border px-3 py-2.5" />
            {templateImageUrl && <div className="flex items-center gap-3 text-sm"><Image src={templateImageUrl} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-lg object-cover" /><span>Catalog image set</span><button type="button" onClick={() => setTemplateImageUrl("")} className="text-red-700 underline">Remove</button></div>}
            <label className="block space-y-1 text-sm font-medium">Food photo (JPEG, PNG, or WebP; up to 5 MB)<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp" className="w-full rounded-xl border bg-white px-3 py-2.5" /></label>
            <div className="flex gap-2">
              <button disabled={saving || !categories.length} className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : editingTemplateId ? "Save food" : "Add food"}</button>
              {editingTemplateId && <button type="button" onClick={resetTemplate} className="rounded-full border px-4 py-2 text-sm">Cancel</button>}
            </div>
          </form>

          <div>
            <h3 className="font-bold">{selectedCategory?.name ?? "Select a category"} {selectedCategory ? `(${selectedCategory.templates.length} foods)` : ""}</h3>
            {selectedCategory?.templates.length ? (
              <ul className="mt-3 max-h-[34rem] space-y-2 overflow-auto">
                {selectedCategory.templates.map((template) => (
                  <li key={template.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    {template.imageUrl
                      ? <Image src={template.imageUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded-lg object-cover" />
                      : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50 text-xs font-bold text-orange-700">Food</div>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{template.name}</p>
                      <p className="text-xs text-slate-500">{template.imageStatus.replaceAll("_", " ")}{template.imageLicense ? ` · ${template.imageLicense}` : ""}</p>
                      {template.imageAuthor && <p className="truncate text-xs text-slate-500">Photo: {template.imageAuthor}</p>}
                      {template.imageImportError && <p className="truncate text-xs text-amber-800">{template.imageImportError}</p>}
                      {template.imageSourceUrl && <a className="text-xs text-orange-700 underline" href={template.imageSourceUrl} target="_blank" rel="noreferrer">Image source</a>}
                    </div>
                    {template.imageStatus === "NEEDS_REVIEW" && <button type="button" disabled={saving} onClick={() => void setImageStatus(template.id, "VERIFIED")} className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800">Verify photo</button>}
                    {template.imageStatus === "NEEDS_REVIEW" && <button type="button" disabled={saving} onClick={() => void setImageStatus(template.id, "AWAITING_IMAGE")} className="rounded-lg border border-amber-300 px-2 py-1 text-xs text-amber-800">Reject match</button>}
                    <button type="button" onClick={() => { setEditingTemplateId(template.id); setCategoryId(selectedCategory.id); setTemplateName(template.name); setTemplateDescription(template.description); setTemplateImageUrl(template.imageUrl ?? ""); }} className="rounded-lg border px-2 py-1 text-xs">Edit</button>
                    <button type="button" disabled={saving} onClick={() => void remove("food", template.id, template.name)} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700">Delete</button>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{loading ? "Loading…" : "No catalog foods in this category yet."}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
