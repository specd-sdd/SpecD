import * as React from 'react'
import { cn } from '../lib/cn.js'

export type StudioDialogProps = {
  open: boolean
  title: string
  titleId: string
  children: React.ReactNode
  actions: React.ReactNode
  /** Optional test id on the panel (not the backdrop). */
  testId?: string
  className?: string
}

/**
 * Studio confirmation modal: dimmed scrim + opaque dialog panel.
 */
export function StudioDialog({
  open,
  title,
  titleId,
  children,
  actions,
  testId,
  className,
}: StudioDialogProps): React.ReactElement | null {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
    >
      <div
        className={cn(
          'w-full max-w-sm rounded-md border border-border bg-background p-4 text-xs text-foreground shadow-2xl',
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
      >
        <h2 id={titleId} className="mb-2 text-sm font-medium text-foreground">
          {title}
        </h2>
        <div className="mb-4 min-h-0 flex-1 overflow-hidden text-muted-foreground">{children}</div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  )
}
