import type { ChangeDetailDto } from '@specd/client'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
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
    <section
      className="studio-card p-3"
      data-testid="studio-change-invalidation-policy-editor"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Invalidation policy
          </h2>
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
      </div>
      <select
        className="h-8 w-full max-w-md rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        value={draft}
        disabled={isPatching}
        onChange={(e) => {
          clearError()
          setDraft(e.target.value as InvalidationPolicyValue)
        }}
      >
        {POLICY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-2 text-[10px] text-destructive">{error.message}</p> : null}
    </section>
  )
}
