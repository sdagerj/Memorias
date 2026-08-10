import { useCallback, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { Button, Card } from '@/components/ui/primitives';
import { useAuditStore } from '@/store/useAuditStore';
import { cn } from '@/lib/utils';

const ACCEPTED = ['.xlsx', '.xlsm', '.xlsb', '.xls'];

export function FileDropzone() {
  const { loadFile, status, error } = useAuditStore();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void loadFile(file);
    },
    [loadFile],
  );

  return (
    <Card
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        'flex flex-col items-center justify-center gap-4 border-2 border-dashed p-10 text-center transition-colors',
        dragging && 'border-primary bg-accent',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {status === 'parsing' ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Mapeando la estructura del modelo…</p>
        </>
      ) : (
        <>
          <FileSpreadsheet className="h-10 w-10 text-primary" />
          <div>
            <p className="text-sm font-medium">Arrastra el modelo de Aritmetika aqui</p>
            <p className="text-xs text-muted-foreground">
              Formatos {ACCEPTED.join(', ')} — fondo, nota offshore, buyout de tramo o analisis de
              cobertura
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Seleccionar archivo
          </Button>
        </>
      )}

      {error && (
        <p className="max-w-md rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        El archivo se procesa en tu navegador. No se sube a ningun servidor.
      </p>
    </Card>
  );
}
