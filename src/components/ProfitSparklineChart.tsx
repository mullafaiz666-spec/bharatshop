"use client";

import React, { useState } from "react";

export interface DayMetric {
  day: string;
  revenue: number;
  profit: number;
  orders: number;
}

interface ProfitSparklineChartProps {
  data: DayMetric[];
}

export function ProfitSparklineChart({ data }: ProfitSparklineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const maxVal = Math.max(...data.map((d) => d.revenue), 100);
  const width = 640;
  const height = 180;
  const paddingX = 24;
  const paddingY = 24;

  const pointsRevenue = data.map((d, i) => {
    const x =
      paddingX + (i / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
    const y =
      height -
      paddingY -
      (d.revenue / maxVal) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  const pointsProfit = data.map((d, i) => {
    const x =
      paddingX + (i / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
    const y =
      height - paddingY - (d.profit / maxVal) * (height - paddingY * 2);
    return { x, y, ...d };
  });

  const pathRev = pointsRevenue
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaRev = `${pathRev} L ${pointsRevenue[pointsRevenue.length - 1].x} ${
    height - paddingY
  } L ${pointsRevenue[0].x} ${height - paddingY} Z`;

  const pathProfit = pointsProfit
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaProfit = `${pathProfit} L ${
    pointsProfit[pointsProfit.length - 1].x
  } ${height - paddingY} L ${pointsProfit[0].x} ${height - paddingY} Z`;

  const hovered =
    hoveredIdx !== null ? pointsProfit[hoveredIdx] : pointsProfit[pointsProfit.length - 1];

  return (
    <div className="relative w-full rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-wider text-emerald-400">
              TELEMETRY // 14-DAY GMV vs NET PROFIT
            </span>
          </div>
          <h3 className="font-heading text-lg font-semibold text-slate-100">
            Autonomous Daily Storefront Yield
          </h3>
        </div>

        {hovered && (
          <div className="flex items-center gap-5 rounded-lg border border-slate-800 bg-slate-950/80 px-4 py-2 text-right">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                {hovered.day} Orders
              </div>
              <div className="font-mono text-sm font-semibold text-slate-200">
                {hovered.orders} sales
              </div>
            </div>
            <div className="h-7 w-[1px] bg-slate-800" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400">
                Gross Revenue
              </div>
              <div className="font-mono text-sm font-semibold text-sky-400">
                ${hovered.revenue.toLocaleString()}
              </div>
            </div>
            <div className="h-7 w-[1px] bg-slate-800" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-emerald-400">
                Net Profit
              </div>
              <div className="font-mono text-base font-bold text-emerald-400">
                +${hovered.profit.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 select-none overflow-visible"
        >
          <defs>
            <linearGradient id="gradient-profit" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradient-rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75, 1].map((step) => (
            <line
              key={step}
              x1={paddingX}
              y1={height - paddingY - step * (height - paddingY * 2)}
              x2={width - paddingX}
              y2={height - paddingY - step * (height - paddingY * 2)}
              stroke="#1E293B"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
          ))}

          {/* Revenue area & line */}
          <path d={areaRev} fill="url(#gradient-rev)" />
          <path
            d={pathRev}
            fill="none"
            stroke="#6366F1"
            strokeWidth="2"
            strokeOpacity="0.65"
          />

          {/* Profit area & line */}
          <path d={areaProfit} fill="url(#gradient-profit)" />
          <path
            d={pathProfit}
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Interactive data points */}
          {pointsProfit.map((pt, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
              >
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  fill={isHovered ? "#10B981" : "#090D16"}
                  stroke="#10B981"
                  strokeWidth="2"
                  className="transition-all duration-150"
                />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Net Profit (After Supplier & Shipping)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" />
            Gross Storefront Revenue
          </span>
        </div>
        <span className="font-mono text-emerald-400">
          AVG ROAS: 4.84x // MARGIN +68.9%
        </span>
      </div>
    </div>
  );
}
