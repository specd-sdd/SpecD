import * as React from 'react'
import { buildValidateConfirmMessage, type ValidateConfirmScope } from '../hooks/use-change-validate.js'
import { StudioDialog } from './StudioDialog.js'

export function ValidateConfirmDialog({
  open,
  scope,
  changeName,
  filename,
  validating = false,
  onContinue,
  onCancel,
}: {
  open: boolean
  scope: ValidateConfirmScope
  changeName: string
  filename?: string
  validating?: boolean
  onContinue: () => void
  onCancel: () => void
}): React.ReactElement | null {
  const title = scope === 'all' ? 'Validate entire change?' : 'Validate artifact?'

  return (
    <StudioDialog
      open={open}
      title={title}
      titleId="validate-confirm-dialog-title"
      testId="studio-validate-confirm-dialog"
      actions={
        <>
          <button
            type="button"
            className="rounded px-3 py-1.5 text-muted-foreground hover:bg-muted"
            onClick={onCancel}
            disabled={validating}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            onClick={onContinue}
            disabled={validating}
          >
            {validating ? 'Validating…' : 'Continue'}
          </button>
        </>
      }
    >
      <p className="whitespace-pre-wrap">
        {buildValidateConfirmMessage(scope, changeName, filename)}
      </p>
    </StudioDialog>
  )
}
