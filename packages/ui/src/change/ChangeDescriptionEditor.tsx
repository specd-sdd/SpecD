import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'
import { usePatchChange } from '../hooks/use-patch-change.js'

export function ChangeDescriptionEditor({
  change,
  onSaved,
}: {
  change: ChangeDetailDto
  onSaved?: (detail: ChangeDetailDto) => void
}): React.ReactElement {
  const savedDescription = change.description ?? ''
  const [draft, setDraft] = React.useState(savedDescription)
  const { patch, isPatching, error, clearError } = usePatchChange(onSaved)

  React.useEffect(() => {
    setDraft(savedDescription)
    clearError()
  }, [change.name, savedDescription, clearError])

  const dirty = draft !== savedDescription

  const handleSave = () => {
    void patch(change.name, { description: draft })
  }

  return (
    <section className="studio-card p-3" data-testid="studio-change-description-editor">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Description
        </h2>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isPatching}
          data-testid="studio-change-description-save"
          onClick={handleSave}
        >
          {isPatching ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <textarea
        className={cn(
          'studio-scrollbar min-h-[4.5rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground shadow-sm',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        value={draft}
        placeholder="What is this change for?"
        rows={3}
        disabled={isPatching}
        onChange={(e) => {
          clearError()
          setDraft(e.target.value)
        }}
      />
      {error ? <p className="mt-2 text-[10px] text-destructive">{error.message}</p> : null}
      {!dirty && savedDescription ? (
        <p className="mt-1 text-[10px] text-muted-foreground">Saved — does not invalidate approvals.</p>
      ) : null}
    </section>
  )
}
