import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'
import { Button } from '../components/ui/button.js'
import { Textarea } from '../components/ui/textarea.js'
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
    <Card data-testid="studio-change-description-editor">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Description</CardTitle>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isPatching}
          data-testid="studio-change-description-save"
          onClick={handleSave}
        >
          {isPatching ? 'Saving…' : 'Save'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea
          className="min-h-[4.5rem] resize-y"
          value={draft}
          placeholder="What is this change for?"
          rows={3}
          disabled={isPatching}
          onChange={(e) => {
            clearError()
            setDraft(e.target.value)
          }}
        />
        {error ? <p className="text-[10px] text-destructive">{error.message}</p> : null}
        {!dirty && savedDescription ? (
          <p className="text-[10px] text-muted-foreground">
            Saved — does not invalidate approvals.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
