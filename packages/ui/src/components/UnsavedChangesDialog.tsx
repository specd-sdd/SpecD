import * as React from 'react'
import { StudioDialog } from './StudioDialog.js'

export function UnsavedChangesDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
  saving = false,
}: {
  open: boolean
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
  saving?: boolean
}): React.ReactElement | null {
  return (
    <StudioDialog
      open={open}
      title="Unsaved changes"
      titleId="unsaved-dialog-title"
      testId="studio-unsaved-dialog"
      actions={
        <>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-muted-foreground hover:bg-muted"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-destructive hover:bg-destructive/10"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard
          </button>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <p>
        This artifact has edits that are not saved. Save before closing, or discard them.
      </p>
    </StudioDialog>
  )
}
