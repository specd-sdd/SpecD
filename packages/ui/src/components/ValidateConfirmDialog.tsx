import * as React from 'react'
import { buildValidateConfirmMessage, type ValidateConfirmScope } from '../hooks/use-change-validate.js'
import { StudioDialog } from './StudioDialog.js'
import { Button } from './ui/button.js'

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
      onOpenChange={(isOpen) => {
        if (!isOpen && !validating) onCancel()
      }}
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            onClick={onCancel}
            disabled={validating}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onContinue}
            disabled={validating}
          >
            {validating ? 'Validating…' : 'Continue'}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-wrap">
        {buildValidateConfirmMessage(scope, changeName, filename)}
      </p>
    </StudioDialog>
  )
}
