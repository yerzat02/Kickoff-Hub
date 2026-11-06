"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncButton({ leagueId }: { leagueId: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function run() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch(`/api/sync?leagueId=${leagueId}`, { method: "POST" });
      const json = await res.json();
      const r = json.results?.[0];
      if (r?.ok) {
        setState("ok");
        setMessage(
          r.mode === "public"
            ? `Обновлено (публичные данные): ${r.teams} команд`
            : `Обновлено: ${r.teams} команд, ${r.matches} матчей`,
        );
        router.refresh();
      } else {
        setState("error");
        setMessage(r?.reason ?? r?.error ?? json.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setState("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={state === "loading"}
        className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-orange-600 to-amber-500 text-black disabled:opacity-50"
      >
        {state === "loading" ? "Синхронизация…" : "Синхронизировать"}
      </button>
      {message && (
        <span className={`text-xs ${state === "error" ? "text-red-400" : "text-green-400"}`}>{message}</span>
      )}
    </div>
  );
}
