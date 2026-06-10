import type { ChangeDetailDto } from '@specd/client'
import { AlertTriangle, X } from 'lucide-react'
import * as React from 'react'
import { StudioDialog } from '../components/StudioDialog.js'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { ScopeSpecIdInput } from './scope-spec-suggestions.js'
import {
  buildScopeChangeConfirmMessage,
  computeSpecScopeDelta,
  hasSpecScopeDelta,
} from '../hooks/use-change-scope-patch.js'
import { usePatchChange } from '../hooks/use-patch-change.js'
import { sortSpecIds } from '../lib/sort-spec-ids.js'

function cloneDependsOn(
  source: Record<string, readonly string[]> | undefined,
  specIds: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const id of specIds) {
    out[id] = [...(source?.[id] ?? [])]
  }
  return out
}

function dependsOnChanged(
  saved: Record<string, readonly string[]>,
  draft: Record<string, string[]>,
  specIds: readonly string[],
): boolean {
  for (const specId of specIds) {
    const a = [...(saved[specId] ?? [])].sort().join('\0')
    const b = [...(draft[specId] ?? [])].sort().join('\0')
    if (a !== b) return true
  }
  return false
}

export function ChangeScopeDialog({
  open,
  change,
  specSuggestions = [],
  onClose,
  onSaved,
  onScopeInvalidated,
}: {
  open: boolean
  change: ChangeDetailDto
  specSuggestions?: readonly string[]
  onClose: () => void
  onSaved?: (detail: ChangeDetailDto, meta: { readonly scopeInvalidated: boolean }) => void
  onScopeInvalidated?: () => void
}): React.ReactElement | null {
  const port = useSpecdDataPort()
  const savedSpecIds = change.specIds
  const savedDepends = change.specDependsOn ?? {}

  const [draftSpecIds, setDraftSpecIds] = React.useState<readonly string[]>(() =>
    sortSpecIds(savedSpecIds),
  )
  const [draftDepends, setDraftDepends] = React.useState<Record<string, string[]>>(() =>
    cloneDependsOn(savedDepends, savedSpecIds),
  )
  const [addSpecInput, setAddSpecInput] = React.useState('')
  const [addDepSpecId, setAddDepSpecId] = React.useState<string | null>(null)
  const [addDepInput, setAddDepInput] = React.useState('')
  const [confirmScope, setConfirmScope] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  const { patch, isPatching, clearError: clearPatchError } = usePatchChange()

  React.useEffect(() => {
    if (!open) return
    setDraftSpecIds(sortSpecIds(savedSpecIds))
    setDraftDepends(cloneDependsOn(savedDepends, savedSpecIds))
    setAddSpecInput('')
    setAddDepSpecId(null)
    setAddDepInput('')
    setConfirmScope(false)
    setError(undefined)
    clearPatchError()
  }, [open, change.name, savedSpecIds.join('|'), clearPatchError])

  React.useEffect(() => {
    setDraftDepends((prev) => {
      const next = { ...prev }
      for (const id of draftSpecIds) {
        if (next[id] === undefined) next[id] = []
      }
      for (const key of Object.keys(next)) {
        if (!draftSpecIds.includes(key)) delete next[key]
      }
      return next
    })
  }, [draftSpecIds])

  const scopeDelta = computeSpecScopeDelta(savedSpecIds, draftSpecIds)
  const scopeDirty = hasSpecScopeDelta(savedSpecIds, draftSpecIds)
  const depsDirty = dependsOnChanged(savedDepends, draftDepends, draftSpecIds)
  const dirty = scopeDirty || depsDirty

  const suggestionSet = React.useMemo(() => {
    const set = new Set(specSuggestions)
    for (const id of savedSpecIds) set.add(id)
    return sortSpecIds([...set])
  }, [specSuggestions, savedSpecIds])

  const sortedDraftSpecIds = React.useMemo(() => sortSpecIds(draftSpecIds), [draftSpecIds])

  const addSpec = (raw: string) => {
    const id = raw.trim()
    if (!id || draftSpecIds.includes(id)) return
    setDraftSpecIds((prev) => sortSpecIds([...prev, id]))
    setAddSpecInput('')
  }

  const removeSpec = (id: string) => {
    setDraftSpecIds((prev) => prev.filter((x) => x !== id))
  }

  const addDep = (specId: string, raw: string) => {
    const dep = raw.trim()
    if (!dep || dep === specId) return
    setDraftDepends((prev) => {
      const list = prev[specId] ?? []
      if (list.includes(dep)) return prev
      return { ...prev, [specId]: sortSpecIds([...list, dep]) }
    })
    setAddDepInput('')
  }

  const removeDep = (specId: string, dep: string) => {
    setDraftDepends((prev) => ({
      ...prev,
      [specId]: (prev[specId] ?? []).filter((d) => d !== dep),
    }))
  }

  const runSave = async () => {
    setBusy(true)
    setError(undefined)
    try {
      let detail: ChangeDetailDto = change
      let scopeInvalidated = false

      if (scopeDirty) {
        const patched = await patch(change.name, {
          ...(scopeDelta.addSpecIds.length > 0 ? { addSpecIds: scopeDelta.addSpecIds } : {}),
          ...(scopeDelta.removeSpecIds.length > 0
            ? { removeSpecIds: scopeDelta.removeSpecIds }
            : {}),
        })
        if (!patched) {
          setBusy(false)
          return
        }
        detail = patched
        scopeInvalidated = scopeDelta.addSpecIds.length > 0 || scopeDelta.removeSpecIds.length > 0
        if (scopeInvalidated) onScopeInvalidated?.()
      }

      const depUpdates = draftSpecIds.filter((specId) => {
        const a = [...(savedDepends[specId] ?? [])].sort().join('\0')
        const b = [...(draftDepends[specId] ?? [])].sort().join('\0')
        return a !== b
      })

      for (const specId of depUpdates) {
        await port.updateSpecDependencies(change.name, {
          specId,
          set: draftDepends[specId] ?? [],
        })
      }

      if (depUpdates.length > 0 || scopeDirty) {
        detail = await port.getChange(change.name)
      }

      onSaved?.(detail, { scopeInvalidated })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setConfirmScope(false)
    }
  }

  const handleSaveClick = () => {
    if (!dirty) return
    if (scopeDirty) {
      setConfirmScope(true)
      return
    }
    void runSave()
  }

  if (!open) return null

  const saving = busy || isPatching

  return (
    <StudioDialog
      open={open}
      title={confirmScope ? 'Confirm scope change' : 'Edit spec scope & dependencies'}
      titleId="change-scope-dialog-title"
      testId="studio-change-scope-dialog"
      className="flex max-h-[90vh] !w-[70vw] max-w-none flex-col"
      onOpenChange={(isOpen) => {
        if (!isOpen && !saving) onClose()
      }}
      actions={
        confirmScope ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => setConfirmScope(false)}
            >
              Back
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => void runSave()}
            >
              {saving ? 'Applying…' : 'Apply scope change'}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!dirty || saving}
              data-testid="studio-change-scope-dialog-save"
              onClick={handleSaveClick}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        )
      }
    >
      {confirmScope ? (
        <div className="px-1">
          <p className="whitespace-pre-wrap text-foreground">
            {buildScopeChangeConfirmMessage(change.name, scopeDelta)}
          </p>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-4 px-1">
          <Alert className="shrink-0 border-amber-500/40 bg-amber-500/10 text-foreground [&>svg]:text-amber-500">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <AlertTitle className="text-[11px] font-medium text-amber-200/90">
              High-impact edits
            </AlertTitle>
            <AlertDescription className="space-y-1 text-[11px] leading-relaxed">
              <p>
                <strong>Removing</strong> a spec from scope drops its scaffolded artifact directories
                and <strong>invalidates</strong> prior spec approval and sign-off on this change.
              </p>
              <p>
                <strong>Adding</strong> specs may require new artifact work. Dependency edits affect
                compiled context only — they do not invalidate approvals.
              </p>
            </AlertDescription>
          </Alert>

          <section className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-2 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Specs in scope
            </h3>
            <form
              className="mb-3 flex shrink-0 gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                addSpec(addSpecInput)
              }}
            >
              <div className="min-w-0 flex-1">
                <ScopeSpecIdInput
                  value={addSpecInput}
                  specIds={suggestionSet}
                  placeholder="Add spec to scope (workspace:capability-path)"
                  disabled={saving}
                  onChange={setAddSpecInput}
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={saving}>
                Add spec
              </Button>
            </form>
            <p className="mb-2 shrink-0 text-[10px] text-muted-foreground">
              Each card is one spec: remove the spec with ✕ on the card, or add/remove dependencies
              below its id (same project spec picker).
            </p>

            <div className="flex min-h-0 flex-1">
              {sortedDraftSpecIds.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No specs in scope yet — add one above.
                </p>
              ) : (
                <div className="studio-scrollbar flex-1 min-h-0 overflow-y-auto pr-3">
                  <div className="pb-4">
                    <ul
                      className="flex flex-col gap-3"
                      data-testid="studio-change-scope-spec-cards"
                    >
                      {sortedDraftSpecIds.map((specId) => (
                        <li key={specId} data-testid={`studio-change-scope-spec-card-${specId}`}>
                          <Card className="overflow-hidden">
                            <CardHeader className="flex-row items-start gap-2 space-y-0">
                              <CardTitle className="min-w-0 flex-1 font-mono text-[11px] normal-case tracking-normal">
                                {specId}
                              </CardTitle>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                                aria-label={`Remove ${specId} from change scope`}
                                title="Remove spec from scope"
                                onClick={() => removeSpec(specId)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </CardHeader>
                            <CardContent>
                              <div className="mb-1.5 text-[10px] text-muted-foreground">Depends on</div>
                              <ul className="mb-2 flex flex-wrap gap-1">
                                {(draftDepends[specId] ?? []).length === 0 ? (
                                  <li className="text-[10px] text-muted-foreground">
                                    No dependencies
                                  </li>
                                ) : (
                                  sortSpecIds(draftDepends[specId] ?? []).map((dep) => (
                                    <li
                                      key={dep}
                                      className="flex items-center gap-0.5 rounded border border-border/60 bg-background/60 pl-1 font-mono text-[10px]"
                                    >
                                      <span className="py-0.5">{dep}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 rounded-none border-l border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label={`Remove dependency ${dep}`}
                                        onClick={() => removeDep(specId, dep)}
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </Button>
                                    </li>
                                  ))
                                )}
                              </ul>
                              <form
                                className="flex gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault()
                                  addDep(specId, addDepSpecId === specId ? addDepInput : '')
                                  setAddDepSpecId(null)
                                  setAddDepInput('')
                                }}
                              >
                                <div className="min-w-0 flex-1">
                                  <ScopeSpecIdInput
                                    className="text-[10px]"
                                    value={addDepSpecId === specId ? addDepInput : ''}
                                    specIds={suggestionSet.filter((id) => id !== specId)}
                                    placeholder="depends-on spec id"
                                    disabled={saving}
                                    onChange={(value) => {
                                      setAddDepSpecId(specId)
                                      setAddDepInput(value)
                                    }}
                                  />
                                </div>
                                <Button type="submit" size="sm" variant="ghost" disabled={saving}>
                                  Add dep
                                </Button>
                              </form>
                            </CardContent>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </section>

          {error ? <p className="shrink-0 px-1 text-destructive">{error}</p> : null}
        </div>
    )}
    </StudioDialog>
  )
}
