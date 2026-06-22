import { Loader2 } from 'lucide-react'
import type { ProjectDto, ProjectStatusDto } from '@specd/client'
import * as React from 'react'

export function StatusBar({
  project,
  projectStatus,
  connectionLabel,
  loadingActive,
  loadingLabel,
}: {
  project: ProjectDto | undefined
  projectStatus: ProjectStatusDto | undefined
  connectionLabel: string
  loadingActive?: boolean
  loadingLabel?: string
}): React.ReactElement {
  const isRemote = connectionLabel !== 'Desktop session'

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 overflow-auto border-t border-border bg-panel-header px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      <span>{project?.name ?? 'workspace'}</span>
      <span className="text-muted-foreground/30">|</span>
      <span>{connectionLabel}</span>
      {isRemote && project?.auth.type ? (
        <>
          <span className="text-muted-foreground/30">|</span>
          <span>auth {project.auth.type}</span>
        </>
      ) : null}
      {projectStatus?.graph ? (
        <>
          <span className="text-muted-foreground/30">|</span>
          <span>
            graph {projectStatus.graph.stale ? 'stale' : 'fresh'}
          </span>
        </>
      ) : null}
      {loadingActive ? (
        <>
          <span className="text-muted-foreground/30">|</span>
          <span className="flex items-center gap-1.5 text-primary">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span>{loadingLabel ?? 'loading…'}</span>
          </span>
        </>
      ) : null}
    </footer>
  )
}
