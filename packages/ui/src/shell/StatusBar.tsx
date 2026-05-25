import type { ProjectDto, ProjectStatusDto } from '@specd/client'
import * as React from 'react'

export function StatusBar({
  project,
  projectStatus,
  connectionLabel,
  runtimeLabel,
  validationSummary,
}: {
  project: ProjectDto | undefined
  projectStatus: ProjectStatusDto | undefined
  connectionLabel: string
  runtimeLabel: string
  validationSummary: string
}): React.ReactElement {
  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 overflow-auto border-t border-border bg-[#11161d] px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
      <span>{project?.workspaces[0]?.name ?? 'workspace'}</span>
      <span className="text-border">|</span>
      <span>{connectionLabel}</span>
      <span className="text-border">|</span>
      <span>{runtimeLabel}</span>
      <span className="text-border">|</span>
      <span>auth {project?.auth.type ?? 'n/a'}</span>
      <span className="text-border">|</span>
      <span>{validationSummary}</span>
      {projectStatus?.graph ? (
        <>
          <span className="text-border">|</span>
          <span>
            graph {projectStatus.graph.stale ? 'stale' : 'fresh'}
          </span>
        </>
      ) : null}
    </footer>
  )
}
