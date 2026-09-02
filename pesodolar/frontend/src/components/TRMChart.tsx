"use client";

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { TRM, ForwardTenor } from "@/lib/api";

type Props = {
  history: TRM[];
  forward: ForwardTenor[];
  spot: number;
};

type ChartPoint = {
  fecha: string;
  historico?: number;
  proyeccion?: number;
  bandaSup?: number;
  bandaInf?: number;
};

export default function TRMChart({ history, forward, spot }: Props) {
  // Construir serie histórica
  const histPoints: ChartPoint[] = history.slice(-13).map((r) => ({
    fecha: r.fecha.slice(0, 7), // YYYY-MM
    historico: r.valor,
  }));

  // Agregar punto de unión
  const today = new Date().toISOString().slice(0, 7);
  const lastHist = histPoints[histPoints.length - 1];
  if (lastHist && lastHist.fecha !== today) {
    histPoints.push({ fecha: today, historico: spot, proyeccion: spot });
  } else if (lastHist) {
    lastHist.proyeccion = spot;
  }

  // Construir curva forward con banda de incertidumbre
  const fwdMap: Record<number, number> = {};
  forward.forEach((t) => { fwdMap[t.dias] = t.forward; });

  // Interpolación mensual de la curva forward
  const addMonths = (base: Date, months: number) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 7);
  };
  const baseDate = new Date();

  const fwdPoints: ChartPoint[] = [];
  for (let m = 1; m <= 18; m++) {
    const dias = m * 30.4;
    // Interpolar entre los tenores conocidos
    const keys = Object.keys(fwdMap).map(Number).sort((a, b) => a - b);
    let val = spot;
    for (let i = 0; i < keys.length - 1; i++) {
      if (dias >= keys[i] && dias <= keys[i + 1]) {
        const t = (dias - keys[i]) / (keys[i + 1] - keys[i]);
        val = fwdMap[keys[i]] + t * (fwdMap[keys[i + 1]] - fwdMap[keys[i]]);
        break;
      } else if (dias > keys[keys.length - 1]) {
        val = fwdMap[keys[keys.length - 1]];
      }
    }
    const spread = (m / 18) * 200;
    fwdPoints.push({
      fecha: addMonths(baseDate, m),
      proyeccion: Math.round(val * 100) / 100,
      bandaSup: Math.round((val + spread) * 100) / 100,
      bandaInf: Math.round((val - spread) * 100) / 100,
    });
  }

  const data = [...histPoints, ...fwdPoints];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload as ChartPoint;
    const val = p.historico ?? p.proyeccion;
    return (
      <div className="bg-[#1F2D42] border border-[#1E2E42] rounded-lg p-2 font-mono text-xs">
        <div className="text-[#3E5060] uppercase tracking-wider text-[9px] mb-1">{label}</div>
        <div className="text-[#C49B3C] text-sm font-semibold">
          {val?.toLocaleString("es-CO", { minimumFractionDigits: 2 })} COP
        </div>
        <div className="text-[#3E5060] text-[9px] mt-1">
          {p.historico ? "Histórico" : "Proyección forward"}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-[#111925] border border-[#1E2E42] rounded-lg p-4">
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E2E42" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fill: "#3E5060", fontSize: 9, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            interval={2}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fill: "#3E5060", fontSize: 9, fontFamily: "monospace" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toLocaleString("es-CO")}
            width={54}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            x={today}
            stroke="#3E5060"
            strokeDasharray="3 3"
            label={{ value: "Hoy", fill: "#3E5060", fontSize: 9, fontFamily: "monospace" }}
          />
          {/* Banda de incertidumbre */}
          <Area
            type="monotone"
            dataKey="bandaSup"
            stroke="none"
            fill="#C49B3C"
            fillOpacity={0.06}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="bandaInf"
            stroke="none"
            fill="#C49B3C"
            fillOpacity={0}
            legendType="none"
          />
          {/* Línea histórica */}
          <Line
            type="monotone"
            dataKey="historico"
            stroke="#C49B3C"
            strokeWidth={2}
            dot={false}
            name="TRM histórica"
          />
          {/* Curva forward */}
          <Line
            type="monotone"
            dataKey="proyeccion"
            stroke="#C49B3C"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
            name="Forward"
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2">
        {[
          { color: "#C49B3C", dash: false, label: "TRM histórica" },
          { color: "#C49B3C", dash: true, label: "Curva forward" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div
              className="h-[2px] w-4 rounded-full"
              style={{
                background: l.color,
                opacity: l.dash ? 0.6 : 1,
                borderTop: l.dash ? `2px dashed ${l.color}` : undefined,
              }}
            />
            <span className="font-mono text-[10px] text-[#7A8C9E]">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
