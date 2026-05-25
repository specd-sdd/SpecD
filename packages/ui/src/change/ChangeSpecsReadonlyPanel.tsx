import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import { sortSpecIds } from '../lib/sort-spec-ids.js'

/**
 * Read-only spec scope and per-spec `dependsOn` for Overview.
 */
export function ChangeSpecsReadonlyPanel({
  change,
}: {
  change: ChangeDetailDto
}): React.ReactElement {
  const depends = change.specDependsOn ?? {}

  if (change.specIds.length === 0) {
    return <p className="text-muted-foreground">No specs in scope.</p>
  }

  const specIds = React.useMemo(() => sortSpecIds(change.specIds), [change.specIds])

  return (
    <ul className="space-y-2" data-testid="studio-change-specs-readonly">
      {specIds.map((specId) => {
        const deps = sortSpecIds(depends[specId] ?? [])
        return (
          <li
            key={specId}
            className="rounded border border-border/80 bg-background/40 px-2 py-1.5"
          >
            <div className="font-mono text-foreground">{specId}</div>
            {deps.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-2 text-[10px] text-muted-foreground">
                {deps.map((dep) => (
                  <li key={dep} className="font-mono">
                    → {dep}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-[10px] text-muted-foreground">No declared dependencies</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
