import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseWorkbook } from '@/core/parser/parseWorkbook';
import { runAudit, DEFAULT_AUDIT_CONFIG, type AuditConfig, type AuditRunResult } from '@/core/findings';
import { DEFAULT_FUND_CONFIG, type Finding, type FindingStatus, type FundConfig, type ParsedWorkbook } from '@/core/types';

/**
 * Estado de la app.
 *
 * Se persiste SOLO la configuracion (mapeos de fondo, parametros del auditor).
 * El workbook nunca toca localStorage: son datos no publicos del family office y
 * viven en memoria mientras dura la sesion.
 */

interface PersistedState {
  fundConfigs: Record<string, FundConfig>;
  auditConfig: AuditConfig;
  activeFundName: string | null;
}

interface SessionState {
  workbook: ParsedWorkbook | null;
  audit: AuditRunResult | null;
  status: 'idle' | 'parsing' | 'ready' | 'error';
  error: string | null;
  /** Overrides manuales de estado por hallazgo (confirmado / descartado) */
  statusOverrides: Record<string, FindingStatus>;
}

interface Actions {
  loadFile: (file: File) => Promise<void>;
  clearWorkbook: () => void;
  setFindingStatus: (key: string, status: FindingStatus) => void;
  resetFindingStatus: (key: string) => void;
  setAuditConfig: (patch: Partial<AuditConfig>) => void;
  rerunAudit: () => void;
  upsertFundConfig: (config: FundConfig) => void;
  setActiveFund: (name: string | null) => void;
  deleteFundConfig: (name: string) => void;
}

export type AuditStore = PersistedState & SessionState & Actions;

const initialSession: SessionState = {
  workbook: null,
  audit: null,
  status: 'idle',
  error: null,
  statusOverrides: {},
};

export const useAuditStore = create<AuditStore>()(
  persist(
    (set, get) => ({
      ...initialSession,
      fundConfigs: {},
      auditConfig: DEFAULT_AUDIT_CONFIG,
      activeFundName: null,

      loadFile: async (file: File) => {
        set({ status: 'parsing', error: null });
        try {
          const buffer = await file.arrayBuffer();
          const workbook = parseWorkbook(buffer, file.name);
          const audit = runAudit(workbook, get().auditConfig);
          set({ workbook, audit, status: 'ready', statusOverrides: {} });
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'No fue posible leer el archivo.',
            workbook: null,
            audit: null,
          });
        }
      },

      clearWorkbook: () => set({ ...initialSession }),

      setFindingStatus: (key, status) =>
        set((state) => ({ statusOverrides: { ...state.statusOverrides, [key]: status } })),

      resetFindingStatus: (key) =>
        set((state) => {
          const next = { ...state.statusOverrides };
          delete next[key];
          return { statusOverrides: next };
        }),

      setAuditConfig: (patch) => {
        set((state) => ({ auditConfig: { ...state.auditConfig, ...patch } }));
        get().rerunAudit();
      },

      rerunAudit: () => {
        const { workbook, auditConfig } = get();
        if (!workbook) return;
        set({ audit: runAudit(workbook, auditConfig) });
      },

      upsertFundConfig: (config) =>
        set((state) => ({
          fundConfigs: { ...state.fundConfigs, [config.fundName]: config },
          activeFundName: config.fundName,
        })),

      setActiveFund: (name) => set({ activeFundName: name }),

      deleteFundConfig: (name) =>
        set((state) => {
          const next = { ...state.fundConfigs };
          delete next[name];
          return {
            fundConfigs: next,
            activeFundName: state.activeFundName === name ? null : state.activeFundName,
          };
        }),
    }),
    {
      name: 'auditor-aritmetika/config',
      partialize: (state): PersistedState => ({
        fundConfigs: state.fundConfigs,
        auditConfig: state.auditConfig,
        activeFundName: state.activeFundName,
      }),
    },
  ),
);

/** Hallazgos con el estado manual aplicado encima del automatico. */
export function applyStatusOverrides(
  findings: Finding[],
  overrides: Record<string, FindingStatus>,
): Finding[] {
  return findings.map((f) => (overrides[f.key] ? { ...f, status: overrides[f.key] } : f));
}

/** Config del fondo activo, o una nueva con los defaults validados. */
export function activeFundConfig(state: AuditStore): FundConfig {
  const name = state.activeFundName;
  if (name && state.fundConfigs[name]) return state.fundConfigs[name];
  return {
    ...DEFAULT_FUND_CONFIG,
    fundName: name ?? state.workbook?.fileName.replace(/\.[^.]+$/, '') ?? 'Fondo sin nombre',
    prefRateAnnual: state.auditConfig.prefRateAnnual,
    calculationDateThresholds: state.auditConfig.cdThresholds,
  };
}
