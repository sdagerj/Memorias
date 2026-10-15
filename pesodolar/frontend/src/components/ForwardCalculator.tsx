"use client";

import { useState, useEffect } from "react";
import { calculateForward } from "@/lib/api";
import type { ForwardTenor } from "@/lib/api";
import ForwardTable from "./ForwardTable";

type Props = {
  defaultSpot?: number;
  defaultRCOP?: number;
  defaultRUSD?: number;
};

export default function ForwardCalculator({ defaultSpot, defaultRCOP, defaultRUSD }: Props) {
  const [spot, setSpot] = useState(defaultSpot ?? 4285.4);
  const [rCOP, setRCOP] = useState(defaultRCOP ?? 8.62);
  const [rUSD, setRUSD] = useState(defaultRUSD ?? 4.33);
  const [tenores, setTenores] = useState<ForwardTenor[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultSpot) setSpot(defaultSpot);
    if (defaultRCOP) setRCOP(defaultRCOP);
    if (defaultRUSD) setRUSD(defaultRUSD);
  }, [defaultSpot, defaultRCOP, defaultRUSD]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!spot || !rCOP || !rUSD) return;
      setLoading(true);
      try {
        const res = await calculateForward({ spot, r_cop: rCOP, r_usd: rUSD, base: 360 });
        setTenores((res as any).tenores);
      } catch {
        // fallback: calcular local
        const tenoresLocal = [
          { tenor: "3M", dias: 91 }, { tenor: "6M", dias: 182 },
          { tenor: "12M", dias: 365 }, { tenor: "18M", dias: 548 },
        ].map(({ tenor, dias }) => {
          const f = spot * (1 + rCOP / 100 * dias / 360) / (1 + rUSD / 100 * dias / 360);
          return {
            tenor, dias, spot,
            forward: Math.round(f * 100) / 100,
            puntos: Math.round((f - spot) * 100) / 100,
            devaluacion_implicita: Math.round((f / spot - 1) * (360 / dias) * 10000) / 100,
            costo_anual: Math.round((rCOP - rUSD) * 100) / 100,
          };
        });
        setTenores(tenoresLocal);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [spot, rCOP, rUSD]);

  const dev12 = tenores.find((t) => t.tenor === "12M")?.devaluacion_implicita;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
      <div className="space-y-3">
        {[
          { label: "TRM Spot (COP/USD)", val: spot, set: setSpot, step: 0.01, hint: "Última TRM publicada por BanRep" },
          { label: "IBR Overnight (% E.A.)", val: rCOP, set: setRCOP, step: 0.01, hint: "Tasa COP de referencia" },
          { label: "SOFR (% N.A. 360)", val: rUSD, set: setRUSD, step: 0.01, hint: "Tasa USD de referencia" },
        ].map((f) => (
          <div key={f.label}>
            <label className="font-mono text-[9px] tracking-widest uppercase text-[#3E5060] block mb-1">
              {f.label}
            </label>
            <input
              type="number"
              value={f.val}
              step={f.step}
              onChange={(e) => f.set(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#182233] border border-[#1E2E42] rounded-md px-3 py-2 font-mono text-sm text-[#D8D2C6] tabular-nums outline-none focus:border-[#C49B3C] transition-colors"
            />
            <div className="font-mono text-[9px] text-[#3E5060] mt-1">{f.hint}</div>
          </div>
        ))}

        <div className="bg-[#182233] border border-[#1E2E42] border-l-[3px] border-l-[#C49B3C] rounded-r-lg p-3 font-mono text-[11px] text-[#7A8C9E] leading-loose">
          <span className="text-[#C49B3C] font-semibold">F = S × (1 + r<sub>COP</sub>·T/360) / (1 + r<sub>USD</sub>·T/360)</span>
          <br />
          Dev. impl. = (F/S − 1) × (360/T) × 100
          {dev12 != null && (
            <div className="mt-2 text-[#D8D2C6]">
              Cobertura 12M: <span className="text-[#C49B3C]">{dev12.toFixed(2)}% E.A.</span>
            </div>
          )}
        </div>
      </div>

      <div>
        {loading ? (
          <div className="bg-[#111925] border border-[#1E2E42] rounded-lg h-40 animate-pulse" />
        ) : tenores.length > 0 ? (
          <ForwardTable tenores={tenores} />
        ) : null}
      </div>
    </div>
  );
}
