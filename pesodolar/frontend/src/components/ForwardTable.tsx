import type { ForwardTenor } from "@/lib/api";

type Props = { tenores: ForwardTenor[] };

export default function ForwardTable({ tenores }: Props) {
  const fmt = (n: number) =>
    n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const maxDev = Math.max(...tenores.map((t) => t.devaluacion_implicita));

  return (
    <div className="bg-[#111925] border border-[#1E2E42] rounded-lg overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Plazo", "Forward", "Puntos", "Dev. Impl."].map((h) => (
              <th
                key={h}
                className="font-mono text-[9px] tracking-widest uppercase text-[#3E5060] text-right px-3 py-2 border-b border-[#1E2E42] first:text-left"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenores.map((t) => (
            <tr
              key={t.tenor}
              className="border-b border-[#1E2E42] last:border-0 hover:bg-[#182233] transition-colors"
            >
              <td className="font-mono text-[11px] text-[#7A8C9E] px-3 py-2">
                {t.tenor === "3M" ? "3 meses" : t.tenor === "6M" ? "6 meses" : t.tenor === "12M" ? "12 meses" : "18 meses"}
              </td>
              <td className="font-mono text-[12px] tabular-nums text-right px-3 py-2">{fmt(t.forward)}</td>
              <td className="font-mono text-[12px] tabular-nums text-right px-3 py-2 text-[#C49B3C]">
                +{t.puntos.toFixed(2)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-2">
                  <span className="font-mono text-[12px] tabular-nums">
                    {t.devaluacion_implicita.toFixed(2)}% E.A.
                  </span>
                  <div className="w-9 h-[3px] bg-[#1E2E42] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C49B3C] rounded-full"
                      style={{ width: `${(t.devaluacion_implicita / maxDev) * 100}%` }}
                    />
                  </div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
