"use client";

import useSWR from "swr";
import { getDashboard, getTRMHistory, getBanRepProjection, getUsuraProjection } from "@/lib/api";
import ForwardTable from "@/components/ForwardTable";
import TRMChart from "@/components/TRMChart";
import ProjectionChart from "@/components/ProjectionChart";
import MetricCard from "@/components/MetricCard";
import ForwardCalculator from "@/components/ForwardCalculator";

export default function Page() {
  const { data: dash, isLoading } = useSWR("dashboard", getDashboard, { refreshInterval: 300_000 });
  const { data: history } = useSWR("trm-history", () => getTRMHistory(365));
  const { data: banrep } = useSWR("banrep-proj", getBanRepProjection);
  const { data: usura } = useSWR("usura-proj", getUsuraProjection);

  const fmt = (n: number) =>
    n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const varClass = (n: number | null) =>
    n === null ? "" : n > 0 ? "text-red-400" : "text-emerald-400";

  return (
    <main className="min-h-screen bg-[#0A0F18] text-[#D8D2C6] font-sans">
      {/* Header */}
      <header className="bg-[#111925] border-b border-[#1E2E42] px-5 h-12 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 font-mono text-sm font-semibold text-[#C49B3C]">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          PesoDólar
        </div>
        <div className="font-mono text-xs text-[#3E5060]">
          Monitor FX Colombia — TRM · Forwards · Proyecciones
        </div>
      </header>

      {/* Hero */}
      <div className="bg-[#111925] border-b border-[#1E2E42] px-5 py-4">
        <div className="flex items-end gap-8 flex-wrap">
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase text-[#3E5060] mb-1">
              TRM · Banco de la República
            </div>
            <div className="font-mono text-4xl font-bold text-[#C49B3C] tabular-nums leading-none">
              {isLoading ? "—" : dash?.trm_hoy ? fmt(dash.trm_hoy.valor) : "—"}
              <span className="text-sm text-[#7A8C9E] ml-1">COP/USD</span>
            </div>
            {dash?.variacion_diaria != null && (
              <div className={`font-mono text-xs mt-1 ${varClass(dash.variacion_diaria)}`}>
                {dash.variacion_diaria > 0 ? "▲" : "▼"}{" "}
                {Math.abs(dash.variacion_diaria).toFixed(2)} (
                {Math.abs(dash.variacion_diaria_pct!).toFixed(2)}%) hoy
              </div>
            )}
          </div>
          <div className="flex gap-6 flex-wrap">
            {[
              { label: "IBR Overnight", val: dash ? `${dash.ibr_overnight.toFixed(2)}% E.A.` : "—" },
              { label: "SOFR", val: dash?.sofr ? `${dash.sofr.toFixed(2)}% N.A.` : "—" },
              { label: "Diferencial", val: dash ? `+${dash.diferencial_tasas.toFixed(2)} pp` : "—" },
              { label: "BanRep", val: dash ? `${dash.banrep_rate.toFixed(2)}% E.A.` : "—" },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-mono text-[9px] tracking-widest uppercase text-[#3E5060]">
                  {s.label}
                </div>
                <div className="font-mono text-sm tabular-nums text-[#D8D2C6] mt-1">{s.val}</div>
              </div>
            ))}
          </div>
          <div className="ml-auto text-right font-mono text-[10px] text-[#3E5060] leading-relaxed">
            <div>{new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</div>
            <div>Fuente: BanRep · NY Fed · datos.gov.co</div>
            <div className="mt-1 text-emerald-500">● Actualización diaria 9:30 AM COT</div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 max-w-[1200px] mx-auto space-y-5">
        {/* Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="TRM Spot"
            value={dash?.trm_hoy ? fmt(dash.trm_hoy.valor) : "—"}
            sub="COP por USD"
          />
          <MetricCard
            label="Devaluación YTD"
            value={dash?.variacion_ytd_pct != null
              ? `${dash.variacion_ytd_pct > 0 ? "+" : ""}${dash.variacion_ytd_pct.toFixed(2)}%`
              : "—"}
            sub={`vs. TRM Dic 2025`}
            valueColor={dash?.variacion_ytd_pct != null
              ? (dash.variacion_ytd_pct > 0 ? "#C04040" : "#2A9960")
              : undefined}
          />
          <MetricCard
            label="Tasa BanRep"
            value={dash ? `${dash.banrep_rate.toFixed(2)}%` : "—"}
            sub="E.A. vigente"
          />
          <MetricCard
            label="Tasa de Usura"
            value={dash?.usura_vigente ? `${dash.usura_vigente.toFixed(2)}%` : "—"}
            sub="Q3 2026 · SFC"
          />
        </div>

        {/* Forward + Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-5">
          <div>
            <SectionTitle>Curva Forward COP/USD</SectionTitle>
            {dash?.forward ? (
              <ForwardTable tenores={dash.forward.tenores} />
            ) : (
              <Skeleton h={180} />
            )}
          </div>
          <div>
            <SectionTitle>TRM Histórica + Curva Forward</SectionTitle>
            {history && dash?.forward ? (
              <TRMChart history={history} forward={dash.forward.tenores} spot={dash.forward.spot} />
            ) : (
              <Skeleton h={220} />
            )}
          </div>
        </div>

        {/* Calculadora */}
        <div>
          <SectionTitle>Calculadora Forward</SectionTitle>
          <ForwardCalculator
            defaultSpot={dash?.forward?.spot}
            defaultRCOP={dash?.ibr_overnight}
            defaultRUSD={dash?.sofr ?? undefined}
          />
        </div>

        {/* Proyecciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <SectionTitle>Proyección Tasa BanRep</SectionTitle>
            {banrep ? <ProjectionChart data={banrep.proyecciones} type="banrep" /> : <Skeleton h={200} />}
          </div>
          <div>
            <SectionTitle>Proyección Tasa de Usura</SectionTitle>
            {usura ? <ProjectionChart data={{ base: usura.proyecciones }} type="usura" /> : <Skeleton h={200} />}
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="font-mono text-[9px] tracking-widest uppercase text-[#3E5060]">{children}</span>
      <div className="flex-1 h-px bg-[#1E2E42]" />
    </div>
  );
}

function Skeleton({ h }: { h: number }) {
  return (
    <div
      className="bg-[#111925] border border-[#1E2E42] rounded-lg animate-pulse"
      style={{ height: h }}
    />
  );
}
