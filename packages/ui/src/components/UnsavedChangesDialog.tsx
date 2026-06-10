import * as React from 'react'
import { StudioDialog } from './StudioDialog.js'
import { Button } from './ui/button.js'

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
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onCancel()
      }}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <p>
        This artifact has edits that are not saved. Save before closing, or discard them.
      </p>
    </StudioDialog>
  )
}
