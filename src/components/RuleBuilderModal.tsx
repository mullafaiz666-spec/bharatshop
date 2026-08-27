"use client";

import React, { useState } from "react";
import { X, Cpu, ShieldCheck, Zap, Plus } from "lucide-react";

interface RuleBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRuleCreated: () => void;
}

export function RuleBuilderModal({
  isOpen,
  onClose,
  onRuleCreated,
}: RuleBuilderModalProps) {
  const [name, setName] = useState(
    "Viral TikTok Surge (≥94 Score) 1-Click Auto-Import"
  );
  const [triggerType, setTriggerType] = useState("VIRAL_SCORE_ABOVE");
  const [triggerThreshold, setTriggerThreshold] = useState("94.00");
  const [actionType, setActionType] = useState("AUTO_IMPORT_AND_PUBLISH");
  const [actionParam, setActionParam] = useState(
    "Shopify Plus + TikTok Shop US + AI Copy"
  );
  const [description, setDescription] = useState(
    "Automatically ingest trending SKUs with score 94+ and generate high-ROAS hooks."
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          triggerType,
          triggerThreshold,
          actionType,
          actionParam,
          isEnabled: true,
        }),
      });
      if (res.ok) {
        onRuleCreated();
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-100">
                NEW AUTONOMOUS AI GOVERNOR RULE
              </h2>
              <p className="text-xs text-slate-400">
                IF condition trigger THEN zero-touch action
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Rule Display Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Trigger Event (IF)
              </label>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="VIRAL_SCORE_ABOVE">
                  Viral AI Score ≥ Threshold
                </option>
                <option value="ORDER_RECEIVED">
                  Customer Order Received (Instant Fulfill)
                </option>
                <option value="MARGIN_BELOW">
                  Profit Margin Drops Below %
                </option>
                <option value="STOCK_LOW">
                  Supplier Stock Drops Below Units
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Threshold Value
              </label>
              <input
                type="number"
                step="0.01"
                value={triggerThreshold}
                onChange={(e) => setTriggerThreshold(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-sm text-emerald-400 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Autonomous Action (THEN)
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                <option value="AUTO_IMPORT_AND_PUBLISH">
                  Auto-Import & Publish to Shopify/TikTok
                </option>
                <option value="AUTO_FULFILL">
                  Pay Supplier & Dispatch YunExpress Priority
                </option>
                <option value="DYNAMIC_REPRICE">
                  Dynamic Price Elastic Bump (+Margin Lock)
                </option>
                <option value="SWITCH_SUPPLIER">
                  Switch to Backup US East Warehouse
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Target Storefront / Carrier
              </label>
              <input
                type="text"
                value={actionParam}
                onChange={(e) => setActionParam(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Rule Rationale
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              <Zap className="h-4 w-4" />
              Engage Autonomous Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
