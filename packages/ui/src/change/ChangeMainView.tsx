import type { ChangeDetailDto, ChangeStatusDto } from '@specd/client'
import { ChevronDown, ChevronRight, FileText, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import { ChangeTabs, type ChangeView } from '../tabs/ChangeTabs.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'
import { ChangeOverview } from './ChangeOverview.js'
import {
  useChangeArtifactList,
  type ArtifactFileItem,
  type ArtifactScopeGroup,
  type ArtifactSpecGroup,
  type ArtifactTypeGroup,
} from '../hooks/use-change-artifact-list.js'
import { artifactScopeGroupFileCount } from '../lib/group-change-artifacts.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import {
  ChangeContextTab,
  ChangeEventsTab,
  ChangeImpactTab,
  ChangeTasksTab,
} from './ChangeTabPanels.js'

export type ChangeMainViewProps = {
  changeName: string | undefined
  isArchived?: boolean
  changeView: ChangeView
  onChangeView: (view: ChangeView) => void
  detail: ChangeDetailDto | undefined
  detailError?: Error
  detailLoading: boolean
  status: ChangeStatusDto | undefined
  statusError?: Error
  statusLoading: boolean
  refreshKey?: number
  onSelectArtifact?: (filename: string) => void
  selectedArtifactFile?: string
  /** Active changes only: runs validate-all for every spec in the change. */
  onValidateAll?: () => void
  /** Called after a successful description PATCH so the shell can refetch detail. */
  onDescriptionSaved?: (detail: ChangeDetailDto) => void
  onScopeSaved?: (detail: ChangeDetailDto) => void
  onScopeInvalidated?: () => void
  onInvalidationPolicySaved?: (detail: ChangeDetailDto) => void
  specSuggestions?: readonly string[]
}

export function ChangeMainView({
  changeName,
  isArchived = false,
  changeView,
  onChangeView,
  detail,
  detailError,
  detailLoading,
  status,
  statusError,
  statusLoading,
  refreshKey = 0,
  onSelectArtifact,
  selectedArtifactFile,
  onValidateAll,
  onDescriptionSaved,
  onScopeSaved,
  onScopeInvalidated,
  onInvalidationPolicySaved,
  specSuggestions = [],
}: ChangeMainViewProps): React.ReactElement {
  const artifactsTabActive = changeView === 'Artifacts'
  const artifactsPollKey = useTabScopedPollKey(artifactsTabActive, refreshKey)

  if (!changeName) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-xs text-muted-foreground">
        Select a change from the sidebar
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChangeTabs changeName={changeName} active={changeView} onActiveChange={onChangeView} />

      {isArchived ? (
        <div className="border-b border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          Read-only archived snapshot
          {detail?.archivedMeta
            ? ` · ${detail.archivedMeta.archivedName} · ${detail.archivedMeta.archivedAt}`
            : null}
        </div>
      ) : null}

      {detailError ? (
        <div className="border-b border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
          {detailError.message}
        </div>
      ) : null}

      {changeView === 'Overview' ? (
        detailLoading && !detail ? (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Loading change…
          </div>
        ) : detail ? (
          <ChangeOverview
            change={detail}
            status={status}
            statusLoading={statusLoading}
            statusError={statusError}
            editable={!isArchived}
            specSuggestions={specSuggestions}
            onDescriptionSaved={onDescriptionSaved}
            onScopeSaved={onScopeSaved}
            onScopeInvalidated={onScopeInvalidated}
            onInvalidationPolicySaved={onInvalidationPolicySaved}
          />
        ) : null
      ) : null}

      {changeView === 'Artifacts' ? (
        isArchived ? (
          <ArchivedArtifactsList
            artifactTypes={detail?.archivedMeta?.artifactTypes ?? []}
            loading={detailLoading}
          />
        ) : (
          <ArtifactsTabPanel
            changeName={changeName}
            refreshKey={artifactsPollKey}
            poll={artifactsTabActive}
            selected={selectedArtifactFile}
            onSelect={onSelectArtifact}
            onValidateAll={onValidateAll}
          />
        )
      ) : null}

      {changeView === 'Context' && !isArchived ? (
        <ChangeContextTab
          changeName={changeName}
          changeStep={detail?.state}
          refreshKey={refreshKey}
          tabActive
        />
      ) : null}

      {changeView === 'Context' && isArchived ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          Compiled context is not available for archived changes.
        </div>
      ) : null}

      {changeView === 'Tasks' && !isArchived ? (
        <ChangeTasksTab
          changeName={changeName}
          status={status}
          refreshKey={refreshKey}
          tabActive
        />
      ) : null}

      {changeView === 'Tasks' && isArchived ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          Tasks are not available for archived changes.
        </div>
      ) : null}

      {changeView === 'Events' ? (
        <ChangeEventsTab
          detail={detail}
          loading={detailLoading}
          error={detailError}
        />
      ) : null}

      {changeView === 'Impact' && !isArchived ? (
        <ChangeImpactTab changeName={changeName} refreshKey={refreshKey} tabActive />
      ) : null}

      {changeView === 'Impact' && isArchived ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          Graph impact is not available for archived changes.
        </div>
      ) : null}
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  complete: 'text-emerald-400',
  'in-progress': 'text-amber-400',
  missing: 'text-destructive',
  drifted: 'text-orange-400',
  skipped: 'text-muted-foreground',
}

function artifactTypeGroupFileCount(group: ArtifactTypeGroup): number {
  return group.files.length
}

function artifactFileLabel(filename: string, underSpecGroup: boolean): string {
  if (!underSpecGroup) return filename
  const parts = filename.split('/')
  return parts[parts.length - 1] ?? filename
}

function ArtifactFileRow({
  file,
  label,
  selected,
  onSelect,
}: {
  file: ArtifactFileItem
  label: string
  selected?: string
  onSelect?: (filename: string) => void
}): React.ReactElement {
  const isMissing = file.state === 'missing'
  return (
    <li key={file.filename}>
      <button
        type="button"
        disabled={isMissing}
        title={isMissing ? 'File not on disk yet — scaffold or create it in the change directory' : undefined}
        className={cn(
          'flex w-full items-center gap-2 px-4 py-1.5 text-left text-xs transition-colors duration-150',
          isMissing
            ? 'cursor-not-allowed opacity-60'
            : 'hover:bg-background/60',
          selected === file.filename && !isMissing && 'bg-background/80 text-foreground',
        )}
        onClick={() => {
          if (!isMissing) onSelect?.(file.filename)
        }}
      >
        <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{label}</span>
        {file.state === 'drifted' ? (
          <span className="text-[10px] text-orange-400">drift</span>
        ) : null}
        {file.displayStatus ? (
          <span
            className={cn('text-[10px]', STATUS_COLOR[file.state] ?? 'text-muted-foreground')}
          >
            {file.displayStatus}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function ChangeTypeGroupFiles({
  group,
  selected,
  onSelect,
}: {
  group: ArtifactTypeGroup
  selected?: string
  onSelect?: (filename: string) => void
}): React.ReactElement {
  if (group.files.length === 0) {
    return (
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">No files</p>
    )
  }

  return (
    <ul className="border-t border-border py-0.5">
      {group.files.map((file) => (
        <ArtifactFileRow
          key={file.filename}
          file={file}
          label={artifactFileLabel(file.filename, false)}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}

function SpecScopeFiles({
  specGroups,
  selected,
  onSelect,
}: {
  specGroups: readonly ArtifactSpecGroup[]
  selected?: string
  onSelect?: (filename: string) => void
}): React.ReactElement {
  return (
    <div className="space-y-1.5 pt-1">
      {specGroups.map((specGroup) => (
        <div key={specGroup.specId} className="studio-card overflow-hidden">
          <div className="bg-background/40 px-3 py-1.5 font-mono text-[10px] text-foreground">
            {specGroup.specId}
          </div>
          <ul className="py-0.5">
            {specGroup.files.map((file) => (
              <ArtifactFileRow
                key={file.filename}
                file={file}
                label={artifactFileLabel(file.filename, true)}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ArchivedArtifactsList({
  artifactTypes,
  loading,
}: {
  artifactTypes: readonly string[]
  loading: boolean
}): React.ReactElement {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading archive snapshot…
      </div>
    )
  }
  if (artifactTypes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No artifact types recorded in archive.
      </div>
    )
  }
  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      <p className="mb-2 text-[10px] text-muted-foreground">
        Artifact files are stored in the archive directory (read-only).
      </p>
      <ul className="space-y-1">
        {artifactTypes.map((type) => (
          <li key={type} className="studio-card px-3 py-2 font-mono text-xs capitalize text-foreground">
            {type}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ArtifactsTabPanel({
  changeName,
  refreshKey = 0,
  poll = true,
  selected,
  onSelect,
  onValidateAll,
}: {
  changeName: string
  refreshKey?: number
  poll?: boolean
  selected?: string
  onSelect?: (filename: string) => void
  onValidateAll?: () => void
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="studio-artifacts-tab">
      {onValidateAll ? (
        <div className="flex shrink-0 items-center justify-end gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="secondary"
            className="h-8 gap-1 px-3 text-xs"
            data-testid="studio-validate-all"
            onClick={onValidateAll}
          >
            <ShieldCheck className="h-3 w-3" />
            Validate All
          </Button>
        </div>
      ) : null}
      <ArtifactsAccordion
        changeName={changeName}
        refreshKey={refreshKey}
        poll={poll}
        selected={selected}
        onSelect={onSelect}
      />
    </div>
  )
}

function ArtifactsAccordion({
  changeName,
  refreshKey = 0,
  poll = true,
  selected,
  onSelect,
}: {
  changeName: string
  refreshKey?: number
  poll?: boolean
  selected?: string
  onSelect?: (filename: string) => void
}): React.ReactElement {
  const { scopeGroups, isLoading } = useChangeArtifactList(changeName, refreshKey, { poll })

  const [openTypeGroups, setOpenTypeGroups] = React.useState<Set<string>>(
    () => new Set(['proposal', 'design', 'tasks']),
  )

  const toggleTypeGroup = (type: string) => {
    setOpenTypeGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  if (isLoading && scopeGroups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading artifacts…
      </div>
    )
  }

  if (scopeGroups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No artifacts tracked for this change
      </div>
    )
  }

  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      <div className="space-y-4">
        {scopeGroups.map((scopeGroup) => (
          <ScopeArtifactsSection
            key={scopeGroup.scope}
            scopeGroup={scopeGroup}
            openTypeGroups={openTypeGroups}
            onToggleTypeGroup={toggleTypeGroup}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

function ScopeArtifactsSection({
  scopeGroup,
  openTypeGroups,
  onToggleTypeGroup,
  selected,
  onSelect,
}: {
  scopeGroup: ArtifactScopeGroup
  openTypeGroups: Set<string>
  onToggleTypeGroup: (type: string) => void
  selected?: string
  onSelect?: (filename: string) => void
}): React.ReactElement {
  const scopeLabel = scopeGroup.scope === 'change' ? 'Change' : 'Spec'
  const fileCount = artifactScopeGroupFileCount(scopeGroup)

  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {scopeLabel}
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {fileCount} {fileCount === 1 ? 'file' : 'files'}
        </span>
      </div>

      {scopeGroup.scope === 'change' && scopeGroup.typeGroups ? (
        <div className="space-y-1.5">
          {scopeGroup.typeGroups.map((typeGroup) => {
            const isOpen = openTypeGroups.has(typeGroup.type)
            return (
              <div key={typeGroup.type} className="studio-card overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors duration-150 hover:bg-background/60"
                  onClick={() => onToggleTypeGroup(typeGroup.type)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 font-medium capitalize text-foreground">
                    {typeGroup.type}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {artifactTypeGroupFileCount(typeGroup)}{' '}
                    {artifactTypeGroupFileCount(typeGroup) === 1 ? 'file' : 'files'}
                  </span>
                </button>
                {isOpen ? (
                  <ChangeTypeGroupFiles
                    group={typeGroup}
                    selected={selected}
                    onSelect={onSelect}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {scopeGroup.scope === 'spec' && scopeGroup.specGroups ? (
        <SpecScopeFiles
          specGroups={scopeGroup.specGroups}
          selected={selected}
          onSelect={onSelect}
        />
      ) : null}
    </section>
  )
}

