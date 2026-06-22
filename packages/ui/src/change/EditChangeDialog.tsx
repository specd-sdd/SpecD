import type { ChangeDetailDto } from '@specd/client'
import { AlertTriangle, X } from 'lucide-react'
import * as React from 'react'
import { StudioDialog } from '../components/StudioDialog.js'
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Input } from '../components/ui/input.js'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js'
import { Textarea } from '../components/ui/textarea.js'
import { RemoteMultiCombobox } from '../components/RemoteMultiCombobox.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import {
  buildScopeChangeConfirmMessage,
  computeSpecScopeDelta,
  hasSpecScopeDelta,
} from '../hooks/use-change-scope-patch.js'
import { usePatchChange } from '../hooks/use-patch-change.js'
import { sortSpecIds } from '../lib/sort-spec-ids.js'

type SpecSearchResult = {
  specId: string
  title: string
  workspace: string
  path: string
  description: string
}

function specIdTestToken(specId: string): string {
  return specId.replace(/[^a-zA-Z0-9]+/g, '-')
}

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

export function EditChangeDialog({
  open,
  change,
  onClose,
  onSaved,
  onScopeInvalidated,
}: {
  open: boolean
  change?: ChangeDetailDto
  onClose: () => void
  onSaved?: (detail: ChangeDetailDto, meta: { readonly scopeInvalidated: boolean; readonly isNew: boolean }) => void
  onScopeInvalidated?: () => void
}): React.ReactElement | null {
  const port = useSpecdDataPort()
  const isCreate = !change
  const savedSpecIds = change?.specIds ?? []
  const savedDepends = change?.specDependsOn ?? {}

  const [draftName, setDraftName] = React.useState(change?.name ?? '')
  const [draftDescription, setDraftDescription] = React.useState(change?.description ?? '')
  const [draftPolicy, setDraftPolicy] = React.useState(change?.invalidationPolicy ?? 'downstream')

  const [draftSpecIds, setDraftSpecIds] = React.useState<readonly string[]>(() =>
    sortSpecIds(savedSpecIds),
  )
  const [draftDepends, setDraftDepends] = React.useState<Record<string, string[]>>(() =>
    cloneDependsOn(savedDepends, savedSpecIds),
  )
  
  const [selectedSpecsToAdd, setSelectedSpecsToAdd] = React.useState<SpecSearchResult[]>([])
  const [pendingDeps, setPendingDeps] = React.useState<Record<string, SpecSearchResult[]>>({})

  const [confirmScope, setConfirmScope] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | undefined>()

  const { patch, isPatching, clearError: clearPatchError } = usePatchChange()

  React.useEffect(() => {
    if (!open) return
    setDraftName(change?.name ?? '')
    setDraftDescription(change?.description ?? '')
    setDraftPolicy(change?.invalidationPolicy ?? 'downstream')
    setDraftSpecIds(sortSpecIds(savedSpecIds))
    setDraftDepends(cloneDependsOn(savedDepends, savedSpecIds))
    setSelectedSpecsToAdd([])
    setPendingDeps({})
    setConfirmScope(false)
    setError(undefined)
    clearPatchError()
  }, [open, change?.name, savedSpecIds.join('|'), clearPatchError])

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
  const metaDirty =
    draftName !== (change?.name ?? '') ||
    draftDescription !== (change?.description ?? '') ||
    draftPolicy !== (change?.invalidationPolicy ?? 'downstream')
    
  const dirty = scopeDirty || depsDirty || metaDirty

  const sortedDraftSpecIds = React.useMemo(() => sortSpecIds(draftSpecIds), [draftSpecIds])

  const addSpecs = (specs: SpecSearchResult[]) => {
    const newIds = specs.map((s) => s.specId).filter((id) => !draftSpecIds.includes(id))
    if (newIds.length === 0) return
    setDraftSpecIds((prev) => sortSpecIds([...prev, ...newIds]))
    setSelectedSpecsToAdd([])
  }

  const removeSpec = (id: string) => {
    setDraftSpecIds((prev) => prev.filter((x) => x !== id))
  }

  const addDeps = (specId: string, specs: SpecSearchResult[]) => {
    const newDeps = specs.map((s) => s.specId).filter((id) => id !== specId)
    if (newDeps.length === 0) return
    setDraftDepends((prev) => {
      const list = prev[specId] ?? []
      const combined = new Set([...list, ...newDeps])
      return { ...prev, [specId]: sortSpecIds([...combined]) }
    })
    setPendingDeps((prev) => ({ ...prev, [specId]: [] }))
  }

  const searchSpecs = async (q: string): Promise<SpecSearchResult[]> => {
    if (!q.trim()) return []
    try {
      const data = await port.searchGraph({ q: q.trim(), specs: true, limit: 50 })
      return data.specs as unknown as SpecSearchResult[]
    } catch (err) {
      console.error('Spec search failed:', err)
      return []
    }
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
      let detail: ChangeDetailDto
      let scopeInvalidated = false

      if (isCreate) {
        if (!draftName.trim()) {
          throw new Error('Change name is required')
        }
        detail = await port.createChange({
          name: draftName.trim(),
          description: draftDescription.trim() || undefined,
          invalidationPolicy: draftPolicy,
          specIds: draftSpecIds,
        })
        
        // Apply dependencies if any were added during creation
        for (const specId of draftSpecIds) {
          if ((draftDepends[specId] ?? []).length > 0) {
            await port.updateSpecDependencies(detail.name, {
              specId,
              set: draftDepends[specId] ?? [],
            })
          }
        }
        detail = await port.getChange(detail.name)
        onSaved?.(detail, { scopeInvalidated: false, isNew: true })
        onClose()
        return
      }
      
      const changeName = change.name
      detail = change

      if (scopeDirty || metaDirty) {
        const patched = await patch(changeName, {
          ...(scopeDelta.addSpecIds.length > 0 ? { addSpecIds: scopeDelta.addSpecIds } : {}),
          ...(scopeDelta.removeSpecIds.length > 0
            ? { removeSpecIds: scopeDelta.removeSpecIds }
            : {}),
          ...(draftDescription !== (change?.description ?? '')
            ? { description: draftDescription }
            : {}),
          ...(draftPolicy !== (change?.invalidationPolicy ?? 'downstream')
            ? { invalidationPolicy: draftPolicy }
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
        await port.updateSpecDependencies(changeName, {
          specId,
          set: draftDepends[specId] ?? [],
        })
      }

      if (depUpdates.length > 0 || scopeDirty || metaDirty) {
        detail = await port.getChange(changeName)
      }

      onSaved?.(detail, { scopeInvalidated, isNew: false })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setConfirmScope(false)
    }
  }

  const handleSaveClick = () => {
    if (!dirty && !isCreate) return
    if (!isCreate && scopeDirty) {
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
      title={
        isCreate
          ? 'Create new change'
          : confirmScope
            ? 'Confirm scope change'
            : `Edit change: ${change?.name ?? ''}`
      }
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
            <Button size="sm" disabled={saving} onClick={() => void runSave()}>
              {saving ? 'Applying…' : 'Apply changes'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={(!dirty && !isCreate) || saving}
              data-testid="studio-change-scope-dialog-save"
              onClick={handleSaveClick}
            >
              {saving ? 'Saving…' : isCreate ? 'Create change' : 'Save changes'}
            </Button>
          </>
        )
      }
    >
      {confirmScope ? (
        <div className="px-1">
          <p className="whitespace-pre-wrap text-foreground">
            {buildScopeChangeConfirmMessage(change!.name, scopeDelta)}
          </p>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-4 px-1">
          {!isCreate && (
            <Alert className="shrink-0 border-amber-500/40 bg-amber-500/10 text-foreground [&>svg]:text-amber-500">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <AlertTitle className="text-[11px] font-medium text-amber-800 dark:text-amber-200/90">
                High-impact edits
              </AlertTitle>
              <AlertDescription className="space-y-1 text-[11px] leading-relaxed">
                <p>
                  <strong>Removing</strong> a spec from scope drops its scaffolded artifact
                  directories and <strong>invalidates</strong> prior spec approval and sign-off on
                  this change.
                </p>
                <p>
                  <strong>Adding</strong> specs may require new artifact work. Dependency edits affect
                  compiled context only — they do not invalidate approvals.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <section className="flex min-h-0 flex-col shrink-0 gap-4 mb-2">
            {isCreate && (
              <div>
                <label htmlFor="change-name" className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Change Name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="change-name"
                  placeholder="e.g. feat-user-auth"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  disabled={saving}
                  autoFocus
                  className="font-mono text-xs"
                />
              </div>
            )}
            
            <div className="grid gap-4 md:grid-cols-1">
              <div>
                <label htmlFor="change-desc" className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </label>
                <Textarea
                  id="change-desc"
                  placeholder="Brief description of the change's goal..."
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  disabled={saving}
                  className="h-20 resize-none text-xs"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Invalidation Policy
                </label>
                <Select
                  value={draftPolicy}
                  onValueChange={setDraftPolicy}
                  disabled={saving}
                >
                  <SelectTrigger className="w-full text-xs">
                    <SelectValue placeholder="Select a policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="downstream">downstream (default: safe invalidation)</SelectItem>
                    <SelectItem value="isolated">isolated (no cascade)</SelectItem>
                    <SelectItem value="strict">strict (invalidate all)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
                  Controls how scope modifications (adding/removing specs) affect downstream artifacts.
                </p>
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col">
            <h3 className="mb-2 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Specs in scope
            </h3>
            <div className="mb-3 flex shrink-0 items-center gap-2">
              <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                Add specs to scope:
              </span>
              <div className="min-w-0 flex-1">
                <RemoteMultiCombobox<SpecSearchResult>
                  value={selectedSpecsToAdd}
                  onValueChange={setSelectedSpecsToAdd}
                  search={searchSpecs}
                  getItemValue={(s) => s.specId}
                  getItemLabel={(s) => s.specId}
                  getItemTestId={(s) =>
                    `studio-change-scope-add-specs-item-${specIdTestToken(s.specId)}`
                  }
                  placeholder="Search specs to add..."
                  testId="studio-change-scope-add-specs"
                  renderItem={(s) => (
                    <div className="flex flex-col gap-0.5 text-left">
                      <span className="font-mono text-[11px] font-medium text-foreground">
                        {s.specId}
                      </span>
                      {s.title && (
                        <span className="truncate text-[10px] text-muted-foreground italic">
                          {s.title}
                        </span>
                      )}
                    </div>
                  )}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="shrink-0 h-8"
                data-testid="studio-change-scope-add-specs-button"
                disabled={saving || selectedSpecsToAdd.length === 0}
                onClick={() => addSpecs(selectedSpecsToAdd)}
              >
                Add Spec
              </Button>
            </div>

            <p className="mb-2 shrink-0 text-[10px] text-muted-foreground">
              Each card is one spec: remove the spec with ✕ on the card, or add/remove dependencies
              below its id.
            </p>

            <div className="flex min-h-0 flex-1">
              {sortedDraftSpecIds.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  No specs in scope yet — add one above.
                </p>
              ) : (
                <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto pr-3">
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
                              <div className="mb-1.5 text-[10px] text-muted-foreground">
                                Depends on
                              </div>
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
                              <div className="flex items-center gap-2">
                                <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
                                  Add deps to spec:
                                </span>
                                <div className="min-w-0 flex-1">
                                  <RemoteMultiCombobox<SpecSearchResult>
                                    value={pendingDeps[specId] ?? []}
                                    onValueChange={(val) =>
                                      setPendingDeps((prev) => ({ ...prev, [specId]: val }))
                                    }
                                    search={searchSpecs}
                                    getItemValue={(s) => s.specId}
                                    getItemLabel={(s) => s.specId}
                                    getItemTestId={(s) =>
                                      `studio-change-scope-add-deps-${specIdTestToken(specId)}-item-${specIdTestToken(s.specId)}`
                                    }
                                    placeholder="depends-on spec id"
                                    className="w-full"
                                    testId={`studio-change-scope-add-deps-${specIdTestToken(specId)}`}
                                    renderItem={(s) => (
                                      <div className="flex flex-col gap-0.5 text-left">
                                        <span className="font-mono text-[10px] font-medium text-foreground">
                                          {s.specId}
                                        </span>
                                        {s.title && (
                                          <span className="truncate text-[9px] text-muted-foreground italic">
                                            {s.title}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 shrink-0 text-[10px]"
                                  data-testid={`studio-change-scope-add-deps-${specIdTestToken(specId)}-button`}
                                  disabled={saving || (pendingDeps[specId]?.length ?? 0) === 0}
                                  onClick={() => addDeps(specId, pendingDeps[specId] ?? [])}
                                >
                                  Add dep
                                </Button>
                              </div>
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
