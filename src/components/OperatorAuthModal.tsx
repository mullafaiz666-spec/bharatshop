"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Lock,
  UserCheck,
  X,
  Sliders,
  CheckCircle2,
} from "lucide-react";

interface OperatorAuthModalProps {
  isOpen: boolean;
  user: {
    id: number;
    email: string;
    name: string;
    role: string;
    minProfitMarginPct: string;
    maxDailySpendUsd: string;
  } | null;
  onClose: () => void;
  onUserUpdated: () => void;
}

export function OperatorAuthModal({
  isOpen,
  user,
  onClose,
  onUserUpdated,
}: OperatorAuthModalProps) {
  const [mode, setMode] = useState<"governor" | "login">("governor");
  const [operatorName, setOperatorName] = useState(
    user?.name || "Aria Vance // Lead AI Operator"
  );
  const [minProfitMarginPct, setMinProfitMarginPct] = useState(
    user?.minProfitMarginPct || "42.50"
  );
  const [maxDailySpendUsd, setMaxDailySpendUsd] = useState(
    user?.maxDailySpendUsd || "5000.00"
  );

  const [loginEmail, setLoginEmail] = useState("operator@aerodrop.ai");
  const [loginPassword, setLoginPassword] = useState("aerodrop2026");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (user) {
      setOperatorName(user.name);
      setMinProfitMarginPct(user.minProfitMarginPct);
      setMaxDailySpendUsd(user.maxDailySpendUsd);
    }
  }, [user]);

  if (!isOpen) return null;

  async function handleSaveGovernor(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSettings",
          name: operatorName,
          minProfitMarginPct,
          maxDailySpendUsd,
        }),
      });
      if (res.ok) {
        setStatusMessage("AI Risk Governor parameters updated.");
        onUserUpdated();
        setTimeout(() => onClose(), 650);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          email: loginEmail,
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(data.message);
        onUserUpdated();
        setTimeout(() => onClose(), 650);
      } else {
        setStatusMessage(data.error || "Login error");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-100">
                OPERATOR PROFILE & AI RISK GOVERNOR
              </h2>
              <p className="text-xs text-slate-400">
                Authorization credentials & automated margin protection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            onClick={() => setMode("governor")}
            className={`border-b-2 py-2.5 text-xs font-semibold uppercase tracking-wider ${
              mode === "governor"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            AI Risk Governor Thresholds
          </button>
          <button
            onClick={() => setMode("login")}
            className={`ml-6 border-b-2 py-2.5 text-xs font-semibold uppercase tracking-wider ${
              mode === "login"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Operator Authentication
          </button>
        </div>

        {statusMessage && (
          <div className="mx-6 mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-300">
            {statusMessage}
          </div>
        )}

        {mode === "governor" ? (
          <form onSubmit={handleSaveGovernor} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Authorized Operator Callsign
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Min Margin Safeguard Floor (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={minProfitMarginPct}
                  onChange={(e) => setMinProfitMarginPct(e.target.value)}
                  className="h-10 w-full rounded-lg border border-emerald-500/40 bg-slate-950 px-3 font-mono text-sm text-emerald-400 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Max Daily Auto-Spend Cap ($)
                </label>
                <input
                  type="number"
                  step="50"
                  value={maxDailySpendUsd}
                  onChange={(e) => setMaxDailySpendUsd(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4" />
                Apply Risk Governor
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Operator Email
              </label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Master Security Key
              </label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
              >
                <UserCheck className="h-4 w-4" />
                Authenticate Command Deck
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
