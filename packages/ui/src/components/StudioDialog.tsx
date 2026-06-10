import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog.js'
import { cn } from '../lib/utils.js'

export type StudioDialogProps = {
  open: boolean
  title: string
  titleId: string
  children: React.ReactNode
  actions: React.ReactNode
  /** Optional test id on the panel (not the backdrop). */
  testId?: string
  className?: string
  /** Optional callback when the dialog's open state changes (e.g., clicking outside). */
  onOpenChange?: (open: boolean) => void
}

/**
 * Studio confirmation modal: thin shadcn-backed wrapper.
 */
export function StudioDialog({
  open,
  title,
  titleId,
  children,
  actions,
  testId,
  className,
  onOpenChange,
}: StudioDialogProps): React.ReactElement | null {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('text-xs', className)}
        data-testid={testId}
        onPointerDownOutside={(e) => {
          // If no onOpenChange is provided, prevent closing on outside click to match legacy behavior
          if (!onOpenChange) {
            e.preventDefault()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle id={titleId} className="text-sm font-medium">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="studio-dialog-body flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
        <DialogFooter className="flex shrink-0 flex-wrap justify-end">
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
