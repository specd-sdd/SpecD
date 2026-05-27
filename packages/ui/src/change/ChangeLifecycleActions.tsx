import * as React from 'react'
import type { ChangeListSection } from './change-list-section.js'
import { Button } from '../components/ui/button.js'
import { Trash2, ArchiveRestore, Archive } from 'lucide-react'

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
            variant="default"
            disabled={busy}
            data-testid="studio-shelf-change"
            onClick={onDraft}
          >
            <Archive className="h-3 w-3" />
            Move to drafts
          </Button>
        ) : null}
        {canArchive && onArchive ? (
          <Button
            type="button"
            size="sm"
            variant="default"
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
          variant="default"
          disabled={busy}
          data-testid="studio-restore-change"
          onClick={onRestore}
        >
          <ArchiveRestore className="h-3 w-3" />
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
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Placeholder for future buttons on the left */}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">{safeActions}</div>

        {onDiscard ? (
          <div
            className={
              hasSafe
                ? 'flex shrink-0 items-center border-l border-border pl-4'
                : 'flex shrink-0 items-center'
            }
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy}
              title="Discard permanently"
              className="h-8 w-8 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              data-testid="studio-discard-change"
              onClick={onDiscard}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
