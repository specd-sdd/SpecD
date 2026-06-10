import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import { Badge } from '../components/ui/badge.js'
import {
  Card,
  CardContent,
} from '../components/ui/card.js'
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
          <li key={specId}>
            <Card>
              <CardContent className="flex flex-col gap-2">
                <div className="font-mono text-foreground">{specId}</div>
                {deps.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {deps.map((dep) => (
                      <li key={dep}>
                        <Badge>depends-on: {dep}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[10px] text-muted-foreground">No declared dependencies</p>
                )}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
