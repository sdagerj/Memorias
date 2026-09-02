const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json();
}

export type TRM = {
  fecha: string;
  valor: number;
  fuente: string;
};

export type ForwardTenor = {
  tenor: string;
  dias: number;
  spot: number;
  forward: number;
  puntos: number;
  devaluacion_implicita: number;
  costo_anual: number;
};

export type Dashboard = {
  trm_hoy: TRM | null;
  trm_ayer: TRM | null;
  variacion_diaria: number | null;
  variacion_diaria_pct: number | null;
  variacion_ytd_pct: number | null;
  banrep_rate: number;
  ibr_overnight: number;
  sofr: number | null;
  diferencial_tasas: number;
  forward: {
    fecha: string;
    spot: number;
    r_cop: number;
    r_usd: number;
    tenores: ForwardTenor[];
  } | null;
  usura_vigente: number | null;
};

export type ProjectionPoint = {
  periodo: string;
  valor: number;
  escenario: string;
};

export type BanRepProjection = {
  tasa_actual: number;
  proyecciones: Record<string, ProjectionPoint[]>;
};

export type UsuraProjection = {
  vigente: number | null;
  proyecciones: ProjectionPoint[];
};

export const getDashboard = () => apiFetch<Dashboard>("/dashboard");
export const getTRMHistory = (days = 365) => apiFetch<TRM[]>(`/trm/history?days=${days}`);
export const getBanRepProjection = () => apiFetch<BanRepProjection>("/rates/banrep/projection");
export const getUsuraProjection = () => apiFetch<UsuraProjection>("/rates/usura");
export const calculateForward = (body: { spot: number; r_cop: number; r_usd: number; base: number }) =>
  apiFetch("/forward/calculate", { method: "POST", body: JSON.stringify(body) });
