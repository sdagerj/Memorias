type Props = {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
};

export default function MetricCard({ label, value, sub, valueColor }: Props) {
  return (
    <div className="bg-[#111925] border border-[#1E2E42] rounded-lg p-4">
      <div className="font-mono text-[9px] tracking-widest uppercase text-[#3E5060] mb-2">{label}</div>
      <div
        className="font-mono text-xl font-semibold tabular-nums leading-none"
        style={{ color: valueColor ?? "#D8D2C6" }}
      >
        {value}
      </div>
      {sub && <div className="font-mono text-[10px] text-[#7A8C9E] mt-1">{sub}</div>}
    </div>
  );
}
