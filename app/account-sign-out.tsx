"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AccountSignOut() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const signOut = async () => {
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok) {
        setError("Could not sign out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch (requestError) {
      console.error("Account sign-out request failed.", requestError);
      setError("Could not reach the server to sign out.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={signOut}
        className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Signing out..." : "Sign out"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
