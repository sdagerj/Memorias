import type { MemoDocument } from '@/core/export/memo';

/**
 * Vista previa del memo con la forma de un documento, no de un bloque de texto
 * monoespaciado: títulos, ficha de datos, cifras destacadas y tablas. Es el
 * mismo documento que sale a Word y a texto plano, solo que renderizado.
 */
export function MemoPreview({ doc }: { doc: MemoDocument }) {
  return (
    <article className="rounded-lg border bg-card p-5 sm:p-8">
      <h1 className="text-lg font-semibold leading-snug">{doc.title}</h1>

      <dl className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        {doc.meta.map((item) => (
          <div key={item.label} className="contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>

      {doc.sections.map((section) => (
        <section key={section.number} className="mt-7">
          <h2 className="border-b pb-1 text-sm font-semibold uppercase tracking-wide">
            {section.number}. {section.heading}
          </h2>
          <div className="mt-3 space-y-3">
            {section.blocks.map((block, i) => {
              switch (block.kind) {
                case 'p':
                  return (
                    <p key={i} className="text-sm leading-relaxed">
                      {block.text}
                    </p>
                  );
                case 'subheading':
                  return (
                    <h3 key={i} className="pt-2 text-sm font-semibold">
                      {block.text}
                    </h3>
                  );
                case 'highlight':
                  return (
                    <p
                      key={i}
                      className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm"
                    >
                      {block.label}: <strong className="tabular-nums">{block.value}</strong>
                    </p>
                  );
                case 'headline':
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-md border border-warn/40 bg-warn/5 p-3"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                        {block.index}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{block.title}</p>
                        {block.meaning && (
                          <p className="mt-1 text-sm leading-relaxed">{block.meaning}</p>
                        )}
                        {block.ask && (
                          <p className="mt-1 text-sm leading-relaxed">
                            <span className="font-medium">Qué hacer:</span> {block.ask}
                          </p>
                        )}
                        <p className="cell-mono mt-1 text-muted-foreground">{block.location}</p>
                      </div>
                      {block.figure && (
                        <p className="shrink-0 text-right text-base font-semibold tabular-nums">
                          {block.figure}
                        </p>
                      )}
                    </div>
                  );
                case 'note':
                  return (
                    <p key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span aria-hidden>•</span>
                      <span>{block.text}</span>
                      <span className="cell-mono text-muted-foreground">{block.reference}</span>
                    </p>
                  );
                case 'finding':
                  return (
                    <div key={i} className="border-l-2 pl-3">
                      <p className="text-sm font-medium">
                        {block.index}. {block.title}
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">{block.paragraph}</p>
                      {block.impact && (
                        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                          Impacto: {block.impact}
                        </p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {block.id} · {block.reference} · {block.status}
                      </p>
                    </div>
                  );
                case 'table':
                  return (
                    <div key={i} className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                            {block.head.map((h) => (
                              <th key={h} className="px-2 py-1 font-medium">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((row, r) => (
                            <tr key={r} className="border-b last:border-0">
                              {row.map((cell, c) => (
                                <td key={c} className="px-2 py-1 tabular-nums">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {block.foot && (
                            <tr className="font-semibold">
                              {block.foot.map((cell, c) => (
                                <td key={c} className="px-2 py-1 tabular-nums">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                default:
                  return null;
              }
            })}
          </div>
        </section>
      ))}
    </article>
  );
}
