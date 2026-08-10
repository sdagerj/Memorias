import { useState } from 'react';
import { Moon, RotateCcw, ScanSearch, Sun } from 'lucide-react';
import { Badge, Button, Tabs } from '@/components/ui/primitives';
import { FileDropzone } from '@/features/upload/FileDropzone';
import { StructureExplorer } from '@/features/structure/StructureExplorer';
import { FindingsPanel } from '@/features/findings/FindingsPanel';
import { FundConfigurator } from '@/features/fund/FundConfigurator';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { useAuditStore } from '@/store/useAuditStore';

type View = 'estructura' | 'hallazgos' | 'fondo' | 'resumen';

export default function App() {
  const { workbook, audit, clearWorkbook } = useAuditStore();
  const [view, setView] = useState<View>('hallazgos');
  const [dark, setDark] = useState(false);

  const toggleTheme = () => {
    setDark((d) => {
      document.documentElement.classList.toggle('dark', !d);
      return !d;
    });
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <ScanSearch className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-sm font-semibold leading-tight">
              Auditor de Modelos Economicos — Aritmetika
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Mapeo estructural · checklist de doce puntos · GP economics con las convenciones
              validadas
            </p>
          </div>

          {workbook && (
            <Badge variant="secondary" className="ml-2">
              {workbook.fileName}
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-2">
            {workbook && (
              <Button variant="ghost" size="sm" onClick={clearWorkbook}>
                <RotateCcw className="h-3.5 w-3.5" />
                Otro archivo
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Cambiar tema">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
        {!workbook || !audit ? (
          <>
            <FileDropzone />
            <Intro />
          </>
        ) : (
          <>
            <Tabs
              value={view}
              onChange={(v) => setView(v as View)}
              items={[
                { value: 'hallazgos', label: `Hallazgos (${audit.findings.length})` },
                { value: 'estructura', label: 'Estructura' },
                { value: 'fondo', label: 'Fondo / GP economics' },
                { value: 'resumen', label: 'Resumen y memo' },
              ]}
            />

            {view === 'hallazgos' && <FindingsPanel audit={audit} />}
            {view === 'estructura' && <StructureExplorer workbook={workbook} />}
            {view === 'fondo' && <FundConfigurator workbook={workbook} />}
            {view === 'resumen' && <Dashboard workbook={workbook} audit={audit} />}
          </>
        )}
      </main>
    </div>
  );
}

function Intro() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <IntroCard
        step="1"
        title="Mapeo estructural"
        body="Se parsean todas las hojas y se clasifica cada celda como formula, valor digitado o etiqueta. Se detectan las hojas huerfanas y la columna donde viven las etiquetas."
      />
      <IntroCard
        step="2"
        title="Motor de hallazgos"
        body="Corre el checklist H1-H12. Los estructurales se detectan solos; los que dependen de criterio de negocio quedan como candidatos para confirmar o descartar."
      />
      <IntroCard
        step="3"
        title="GP economics y memo"
        body="Pref yield con tasa simple, NPV con la convencion validada y split de carry por TIR de pagadas. La diferencia contra lo que trae el Excel es el hallazgo cuantificado."
      />
    </div>
  );
}

function IntroCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {step}
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
