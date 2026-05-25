import type { SpecDetailDto } from '@specd/client'
import * as React from 'react'

export function SpecOverview({ spec }: { spec: SpecDetailDto }): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
      <div className="mb-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Spec Overview
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{spec.title ?? spec.path}</h1>
        {spec.description ? (
          <p className="mt-2 max-w-3xl text-muted-foreground">{spec.description}</p>
        ) : null}
        <p className="mt-2 font-mono text-muted-foreground">{spec.specId}</p>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="studio-card p-3">
          <h2 className="mb-2 font-medium uppercase tracking-wide text-muted-foreground">
            Summary
          </h2>
          <dl className="space-y-1">
            <MetaRow label="Workspace" value={spec.workspace} />
            <MetaRow label="Path" value={spec.path} />
            <MetaRow label="Artifacts" value={String(spec.artifacts.length)} />
            <MetaRow label="Dependencies" value={String(spec.dependsOn?.length ?? 0)} />
          </dl>
        </section>

        <section className="studio-card p-3">
          <h2 className="mb-2 font-medium uppercase tracking-wide text-muted-foreground">
            Metadata
          </h2>
          <dl className="space-y-1">
            <MetaRow label="Spec ID" value={spec.specId} mono />
            <MetaRow label="Title" value={spec.title ?? 'Untitled'} />
          </dl>
        </section>

        <section className="studio-card p-3">
        <h2 className="mb-2 font-medium uppercase tracking-wide text-muted-foreground">
          Artifacts
        </h2>
        {spec.artifacts.length === 0 ? (
          <p className="text-muted-foreground">No artifacts listed.</p>
        ) : (
          <ul className="space-y-1 font-mono">
            {spec.artifacts.map((a) => (
              <li key={a.filename}>
                {a.filename}
                {a.hash ? <span className="ml-2 text-muted-foreground">{a.hash.slice(0, 12)}…</span> : null}
              </li>
            ))}
          </ul>
        )}
        </section>

        {spec.dependsOn && spec.dependsOn.length > 0 ? (
          <section className="studio-card p-3">
          <h2 className="mb-2 font-medium uppercase tracking-wide text-muted-foreground">
            Depends on
          </h2>
          <ul className="flex flex-wrap gap-1">
            {spec.dependsOn.map((dep) => (
              <li
                key={dep}
                className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono"
              >
                {dep}
              </li>
            ))}
          </ul>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? 'font-mono' : ''}>{value}</dd>
    </div>
  )
}
