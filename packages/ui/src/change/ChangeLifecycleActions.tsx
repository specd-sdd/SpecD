import * as React from 'react'
import type { ChangeListSection } from './change-list-section.js'
import { Button } from '../components/ui/button.js'

export function ChangeLifecycleActions({
  listSection,
  state,
  busy = false,
  onDraft,
  onRestore,
  onDiscard,
  onArchive,
}: {
  listSection: ChangeListSection | null
  state: string
  busy?: boolean
  onDraft?: () => void
  onRestore?: () => void
  onDiscard?: () => void
  onArchive?: () => void
}): React.ReactElement | null {
  if (listSection === null) {
    return null
  }

  if (listSection === 'discarded') {
    return (
      <p className="text-[11px] text-muted-foreground" data-testid="studio-change-lifecycle-actions">
        This change was permanently discarded and cannot be restored.
      </p>
    )
  }

  const canArchive = state === 'archivable' || state === 'signed-off'

  const safeActions =
    listSection === 'active' ? (
      <>
        {onDraft ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            data-testid="studio-shelf-change"
            onClick={onDraft}
          >
            Shelf to drafts
          </Button>
        ) : null}
        {canArchive && onArchive ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            data-testid="studio-archive-change"
            onClick={onArchive}
          >
            Archive
          </Button>
        ) : null}
      </>
    ) : listSection === 'draft' ? (
      onRestore ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          data-testid="studio-restore-change"
          onClick={onRestore}
        >
          Restore to active
        </Button>
      ) : null
    ) : null

  const hasSafe = listSection === 'active' ? Boolean(onDraft || (canArchive && onArchive)) : Boolean(onRestore)

  return (
    <div
      className="flex w-full items-center gap-4"
      data-testid="studio-change-lifecycle-actions"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">{safeActions}</div>
      {onDiscard ? (
        <div
          className={
            hasSafe
              ? 'ml-auto flex shrink-0 items-center border-l border-border pl-4'
              : 'ml-auto flex shrink-0 items-center'
          }
        >
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            data-testid="studio-discard-change"
            onClick={onDiscard}
          >
            Discard permanently
          </Button>
        </div>
      ) : null}
    </div>
  )
}
