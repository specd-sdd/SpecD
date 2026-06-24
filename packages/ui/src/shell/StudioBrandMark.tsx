import * as React from 'react'
import { cn } from '../lib/utils.js'

export type StudioBrandMarkProps = {
  projectLabel?: string
  className?: string
}

export function StudioBrandMark({
  projectLabel,
  className,
}: StudioBrandMarkProps): React.ReactElement {
  return (
    <div
      className={cn('studio-sidebar-brand-header min-w-0 px-0 py-0', className)}
      data-testid="studio-brand-mark"
    >
      <div className="flex items-center gap-2">
        <div className="rounded-md border border-border bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          SpecD
        </div>
        <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Studio</span>
      </div>
      {projectLabel ? (
        <p className="mt-1 truncate border border-border px-2 font-mono text-[10px] text-muted-foreground">
          {projectLabel}
        </p>
      ) : null}
    </div>
  )
}
