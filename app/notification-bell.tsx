"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/csrf-client";

type NotificationItem = {
  id: string;
  category: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { notifications?: NotificationItem[]; unreadCount?: number };
      setItems(data.notifications ?? []);
      setUnread(data.unreadCount ?? 0);
    } catch {
      /* notification polling is best effort */
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAll = async () => {
    try {
      const response = await apiFetch("/api/notifications", {
        method: "POST",
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        setError("Notifications could not be updated.");
        return;
      }
      await load();
    } catch {
      setError("Notifications could not be updated.");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-lg text-slate-700 shadow-sm transition hover:border-orange-200 hover:text-orange-600"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold text-slate-900">Notifications</p>
            <button type="button" onClick={() => void markAll()} className="text-xs font-semibold text-orange-600 hover:underline">
              Mark all read
            </button>
          </div>
          {error && <p className="px-4 py-2 text-xs text-red-600">{error}</p>}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>}
            {items.map((item) => {
              const content = (
                <>
                  <p className={`text-sm ${item.readAt ? "font-medium text-slate-700" : "font-bold text-slate-900"}`}>{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                </>
              );
              return (
                <div key={item.id} className={`border-b border-slate-100 px-4 py-3 ${item.readAt ? "" : "bg-orange-50/60"}`}>
                  {item.href ? (
                    <Link href={item.href} onClick={() => setOpen(false)} className="block">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}