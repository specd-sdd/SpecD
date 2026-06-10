import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/utils.js'

export type StudioLoadingBandProps = {
  active: boolean
  label?: string
  className?: string
}

/**
 * Fixed-height activity strip above the status bar. Does not reflow main panels.
 */
export function StudioLoadingBand({
  active,
  label = 'Loading…',
  className,
}: StudioLoadingBandProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex h-6 shrink-0 items-center gap-2 border-t border-border/80 bg-panel-header/80 px-3 font-mono text-[10px] uppercase tracking-[0.14em]',
        className,
      )}
      aria-live="polite"
      aria-busy={active}
    >
      {active ? (
        <>
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
          <span className="truncate text-muted-foreground">{label}</span>
        </>
      ) : (
        <span className="sr-only">Idle</span>
      )}
    </div>
  )
}
