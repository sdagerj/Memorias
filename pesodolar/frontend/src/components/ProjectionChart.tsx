"use client";

import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import type { ProjectionPoint } from "@/lib/api";

type Props = {
  data: Record<string, ProjectionPoint[]>;
  type: "banrep" | "usura";
};

const SC_COLORS: Record<string, string> = {
  base: "#C49B3C",
  dove: "#2A9960",
  hawk: "#C04040",
};

const SC_LABELS: Record<string, string> = {
  base: "Base",
  dove: "Dovish",
  hawk: "Hawkish",
};

export default function ProjectionChart({ data, type }: Props) {
  const scenarios = Object.keys(data);
  const [active, setActive] = useState("base");

  const chartData = data[active] ?? [];

  return (
    <div className="bg-[#111925] border border-[#1E2E42] rounded-lg p-4">
      {scenarios.length > 1 && (
        <div className="flex gap-1.5 mb-3">
          {scenarios.map((sc) => (
            <button
              key={sc}
              onClick={() => setActive(sc)}
              className="px-2.5 py-1 rounded text-[10px] font-mono border transition-all"
              style={{
                borderColor: active === sc ? SC_COLORS[sc] : "#1E2E42",
                background: active === sc ? `${SC_COLORS[sc]}20` : "transparent",
                color: active === sc ? SC_COLORS[sc] : "#7A8C9E",
              }}
            >
              {SC_LABELS[sc] ?? sc}
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2E42" vertical={false} />
          <XAxis
            dataKey="periodo"
            tick={{ fill: "#3E5060", fontSize: 8, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#3E5060", fontSize: 8, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v.toFixed(2)}%`}
            width={44}
          />
          <Tooltip
            contentStyle={{
              background: "#1F2D42",
              border: "1px solid #1E2E42",
              borderRadius: 6,
              fontFamily: "monospace",
              fontSize: 11,
            }}
            labelStyle={{ color: "#3E5060", fontSize: 9 }}
            formatter={(v: number) => [`${v.toFixed(2)}% E.A.`, type === "banrep" ? "BanRep" : "Usura"]}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={SC_COLORS[active]}
            strokeWidth={2}
            dot={{ fill: SC_COLORS[active], r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 space-y-0.5">
        {chartData.map((p) => (
          <div key={p.periodo} className="flex justify-between font-mono text-[11px] py-0.5 border-b border-[#1E2E42] last:border-0">
            <span className="text-[#7A8C9E]">{p.periodo}</span>
            <span style={{ color: SC_COLORS[active] }}>{p.valor.toFixed(2)}% E.A.</span>
          </div>
        ))}
      </div>
    </div>
  );
}
