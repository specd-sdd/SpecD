import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js'
import { usePatchChange } from '../hooks/use-patch-change.js'

const POLICY_OPTIONS = [
  { value: 'downstream', label: 'Downstream (default)' },
  { value: 'surgical', label: 'Surgical' },
  { value: 'global', label: 'Global' },
  { value: 'none', label: 'None' },
] as const

export type InvalidationPolicyValue = (typeof POLICY_OPTIONS)[number]['value']

export function ChangeInvalidationPolicyEditor({
  change,
  onSaved,
}: {
  change: ChangeDetailDto
  onSaved?: (detail: ChangeDetailDto) => void
}): React.ReactElement {
  const saved = (change.invalidationPolicy ?? 'downstream') as InvalidationPolicyValue
  const [draft, setDraft] = React.useState<InvalidationPolicyValue>(saved)
  const { patch, isPatching, error, clearError } = usePatchChange(onSaved)

  React.useEffect(() => {
    setDraft(saved)
    clearError()
  }, [change.name, saved, clearError])

  const dirty = draft !== saved

  return (
    <Card data-testid="studio-change-invalidation-policy-editor">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>Invalidation policy</CardTitle>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Affects future drift invalidation only — does not invalidate approvals by itself.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isPatching}
          data-testid="studio-change-invalidation-policy-save"
          onClick={() => void patch(change.name, { invalidationPolicy: draft })}
        >
          {isPatching ? 'Saving…' : 'Save'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Select
          value={draft}
          disabled={isPatching}
          onValueChange={(value) => {
            clearError()
            setDraft(value as InvalidationPolicyValue)
          }}
        >
          <SelectTrigger className="max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {POLICY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {error ? <p className="text-[10px] text-destructive">{error.message}</p> : null}
      </CardContent>
    </Card>
  )
}
