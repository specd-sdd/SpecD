import * as React from 'react'
import { StudioDialog } from '../components/StudioDialog.js'
import { Button } from '../components/ui/button.js'

export type LifecycleConfirmKind = 'draft' | 'restore' | 'discard' | 'archive'

function dialogCopy(kind: LifecycleConfirmKind, changeName: string): {
  title: string
  body: React.ReactNode
  confirmLabel: string
  destructive: boolean
} {
  switch (kind) {
    case 'draft':
      return {
        title: 'Shelf to drafts?',
        body: (
          <>
            <strong className="text-foreground">{changeName}</strong> will move to Drafts. You can
            restore it later from Overview.
          </>
        ),
        confirmLabel: 'Shelf to drafts',
        destructive: false,
      }
    case 'restore':
      return {
        title: 'Restore to active?',
        body: (
          <>
            <strong className="text-foreground">{changeName}</strong> will return to In Progress.
          </>
        ),
        confirmLabel: 'Restore',
        destructive: false,
      }
    case 'discard':
      return {
        title: 'Discard permanently?',
        body: (
          <>
            <p className="mb-2 text-destructive">
              This cannot be undone. There is no restore from discard.
            </p>
            <p>
              <strong className="text-foreground">{changeName}</strong> will be moved to Discarded
              and abandoned forever.
            </p>
          </>
        ),
        confirmLabel: 'Discard permanently',
        destructive: true,
      }
    case 'archive':
      return {
        title: 'Archive change?',
        body: (
          <>
            <strong className="text-foreground">{changeName}</strong> will be archived and its specs
            published to the workspace.
          </>
        ),
        confirmLabel: 'Archive',
        destructive: false,
      }
  }
}

export function ChangeLifecycleConfirmDialog({
  open,
  kind,
  changeName,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  kind: LifecycleConfirmKind | null
  changeName: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}): React.ReactElement | null {
  if (!open || kind === null) return null

  const copy = dialogCopy(kind, changeName)

  return (
    <StudioDialog
      open={open}
      title={copy.title}
      titleId="change-lifecycle-confirm-title"
      testId="studio-change-lifecycle-confirm-dialog"
      className={copy.destructive ? 'max-w-md border-destructive/40' : undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen && !busy) onCancel()
      }}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={copy.destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            data-testid="studio-lifecycle-confirm"
          >
            {busy ? 'Working…' : copy.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="leading-relaxed">{copy.body}</div>
    </StudioDialog>
  )
}
