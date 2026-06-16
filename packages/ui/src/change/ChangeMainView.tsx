import type { ChangeDetailDto, ChangeStatusDto } from '@specd/client'
import { isShelvedReadOnlySection, type ChangeListSection } from './change-list-section.js'
import { FileText, Info, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion.js'
import {
  Alert,
  AlertDescription,
} from '../components/ui/alert.js'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'
import { CHANGE_VIEWS, ChangeTabs, type ChangeView } from '../tabs/ChangeTabs.js'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/utils.js'
import { ChangeOverview } from './ChangeOverview.js'
import {
  useChangeArtifactList,
  type ArtifactFileItem,
  type ArtifactScopeGroup,
  type ArtifactSpecGroup,
  type ArtifactTypeGroup,
} from '../hooks/use-change-artifact-list.js'
import {
  artifactScopeGroupFileCount,
  groupChangeArtifactEntries,
} from '../lib/group-change-artifacts.js'
import { useTabScopedPollKey } from '../hooks/use-tab-scoped-poll-key.js'
import type { ChangeReadSection } from '../lib/change-read-routes.js'
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
  onScopeSaved?: (detail: ChangeDetailDto) => void
  onScopeInvalidated?: () => void
  changeListSection?: ChangeListSection | null
  lifecycleBusy?: boolean
  onShelfToDrafts?: () => void
  onRestoreToActive?: () => void
  onDiscardChange?: () => void
  onArchiveChange?: () => void
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
  onScopeSaved,
  onScopeInvalidated,
  changeListSection = null,
  lifecycleBusy = false,
  onShelfToDrafts,
  onRestoreToActive,
  onDiscardChange,
  onArchiveChange,
}: ChangeMainViewProps): React.ReactElement {
  const artifactsTabActive = changeView === 'Artifacts'
  const artifactsPollKey = useTabScopedPollKey(artifactsTabActive, refreshKey)

  const shelvedReadOnly = isShelvedReadOnlySection(changeListSection)
  const contentEditable = !isArchived && changeListSection === 'active'
  const pollChangeData = contentEditable
  const allowDeepReadTabs = !isArchived && !shelvedReadOnly

  const visibleViews = React.useMemo((): readonly ChangeView[] => {
    if (!changeName) return CHANGE_VIEWS
    return allowDeepReadTabs ? CHANGE_VIEWS : (['Overview', 'Artifacts', 'Tasks', 'Events'] as const)
  }, [allowDeepReadTabs, changeName])

  React.useEffect(() => {
    if (!allowDeepReadTabs && (changeView === 'Context' || changeView === 'Coverage')) {
      onChangeView('Overview')
    }
  }, [allowDeepReadTabs, changeView, onChangeView])

  if (!changeName) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-xs text-muted-foreground">
        Select a change from the sidebar
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChangeTabs
        changeName={changeName}
        active={changeView}
        views={visibleViews}
        onActiveChange={onChangeView}
      />

      {isArchived ? (
        <Alert className="rounded-none border-x-0 border-b bg-muted/30 px-3 py-1.5 shadow-none">
          <Info className="h-3 w-3 shrink-0 text-studio-info" />
          <AlertDescription className="text-xs text-muted-foreground">
            Read-only archived snapshot
            {detail?.archivedMeta
              ? ` · ${detail.archivedMeta.archivedName} · ${detail.archivedMeta.archivedAt}`
              : null}
          </AlertDescription>
        </Alert>
      ) : shelvedReadOnly ? (
        <Alert className="rounded-none border-x-0 border-b bg-muted/50 px-3 py-1.5 shadow-none">
          <Info className="h-3 w-3 shrink-0 text-studio-info" />
          <AlertDescription className="text-xs text-muted-foreground">
            {changeListSection === 'draft'
              ? 'Read-only drafted change — restore to active to edit artifacts and metadata.'
              : 'Read-only discarded change — permanently abandoned.'}
          </AlertDescription>
        </Alert>
      ) : null}

      {detailError ? (
        <Alert variant="destructive" className="rounded-none border-x-0 border-b p-2 shadow-none">
          <AlertDescription className="text-xs">
            {detailError.message}
          </AlertDescription>
        </Alert>
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
            editable={contentEditable}
            onScopeSaved={onScopeSaved}
            onScopeInvalidated={onScopeInvalidated}
            listSection={changeListSection}
            lifecycleBusy={lifecycleBusy}
            onShelfToDrafts={onShelfToDrafts}
            onRestoreToActive={onRestoreToActive}
            onDiscardChange={onDiscardChange}
            onArchiveChange={onArchiveChange}
          />
        ) : null
      ) : null}

      {changeView === 'Artifacts' ? (
        isArchived ? (
          <ArtifactsTabPanel
            changeName={changeName}
            listSection="archived"
            refreshKey={artifactsPollKey}
            poll={false}
            selected={selectedArtifactFile}
            onSelect={onSelectArtifact}
            artifactItems={detail?.artifacts ?? []}
            loadingOverride={detailLoading}
          />
        ) : (
          <ArtifactsTabPanel
            changeName={changeName}
            listSection={changeListSection}
            refreshKey={artifactsPollKey}
            poll={artifactsTabActive && pollChangeData}
            selected={selectedArtifactFile}
            onSelect={onSelectArtifact}
            onValidateAll={contentEditable ? onValidateAll : undefined}
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
          listSection={changeListSection}
          status={status}
          refreshKey={refreshKey}
          tabActive={pollChangeData}
        />
      ) : null}

      {changeView === 'Tasks' && isArchived ? (
        <ChangeTasksTab
          changeName={changeName}
          listSection="archived"
          artifactItems={detail?.artifacts}
          refreshKey={refreshKey}
          tabActive={false}
        />
      ) : null}

      {changeView === 'Events' ? (
        <ChangeEventsTab
          detail={detail}
          loading={detailLoading}
          error={detailError}
        />
      ) : null}

      {changeView === 'Coverage' && !isArchived ? (
        <ChangeImpactTab changeName={changeName} refreshKey={refreshKey} tabActive />
      ) : null}

      {changeView === 'Coverage' && isArchived ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          Graph impact is not available for archived changes.
        </div>
      ) : null}
    </div>
  )
}

const STATUS_COLOR: Record<string, string> = {
  complete: 'text-studio-success',
  'in-progress': 'text-studio-warning',
  missing: 'text-studio-error',
  drifted: 'text-studio-warning',
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
  const statusColor = STATUS_COLOR[file.state] ?? 'text-muted-foreground'

  return (
    <li key={file.filename}>
      <Button
        variant="ghost"
        size="sm"
        disabled={isMissing}
        title={isMissing ? 'File not on disk yet — scaffold or create it in the change directory' : undefined}
        className={cn(
          'h-auto w-full justify-start gap-2 px-4 py-1.5 text-left text-xs transition-colors duration-150',
          isMissing
            ? 'opacity-60'
            : '',
          selected === file.filename && !isMissing && 'bg-background/80 text-foreground',
        )}
        onClick={() => {
          if (!isMissing) onSelect?.(file.filename)
        }}
      >
        <FileText className={cn('h-3 w-3 shrink-0', statusColor)} />
        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{label}</span>
        {file.state === 'drifted' ? (
          <span className="text-[10px] text-studio-warning">drift</span>
        ) : null}
        {file.displayStatus ? (
          <span className={cn('text-[10px]', statusColor)}>
            {file.displayStatus}
          </span>
        ) : null}
      </Button>
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
        <Card key={specGroup.specId} className="overflow-hidden">
          <CardHeader className="px-3 py-2">
            <CardTitle className="font-mono text-[10px] normal-case tracking-normal">
              {specGroup.specId}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0.5">
            <ul>
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
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ArtifactsTabPanel({
  changeName,
  listSection = null,
  refreshKey = 0,
  poll = true,
  selected,
  onSelect,
  onValidateAll,
  artifactItems,
  loadingOverride = false,
}: {
  changeName: string
  listSection?: ChangeReadSection
  refreshKey?: number
  poll?: boolean
  selected?: string
  onSelect?: (filename: string) => void
  onValidateAll?: () => void
  artifactItems?: readonly {
    readonly filename: string
    readonly type: string
    readonly state: string
    readonly displayStatus: string
  }[]
  loadingOverride?: boolean
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
        listSection={listSection}
        refreshKey={refreshKey}
        poll={poll}
        selected={selected}
        onSelect={onSelect}
        artifactItems={artifactItems}
        loadingOverride={loadingOverride}
      />
    </div>
  )
}

function ArtifactsAccordion({
  changeName,
  listSection = null,
  refreshKey = 0,
  poll = true,
  selected,
  onSelect,
  artifactItems,
  loadingOverride = false,
}: {
  changeName: string
  listSection?: ChangeReadSection
  refreshKey?: number
  poll?: boolean
  selected?: string
  onSelect?: (filename: string) => void
  artifactItems?: readonly {
    readonly filename: string
    readonly type: string
    readonly state: string
    readonly displayStatus: string
  }[]
  loadingOverride?: boolean
}): React.ReactElement {
  const { scopeGroups, isLoading } = useChangeArtifactList(
    artifactItems !== undefined ? undefined : changeName,
    refreshKey,
    {
      poll,
      listSection: artifactItems !== undefined ? null : listSection,
    },
  )
  const groupedArtifactItems = React.useMemo(
    () => (artifactItems !== undefined ? groupChangeArtifactEntries(artifactItems) : scopeGroups),
    [artifactItems, scopeGroups],
  )

  const [openTypeGroups, setOpenTypeGroups] = React.useState<string[]>(
    () => ['proposal', 'design', 'tasks'],
  )

  if ((loadingOverride || isLoading) && groupedArtifactItems.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        Loading artifacts…
      </div>
    )
  }

  if (groupedArtifactItems.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        No artifacts tracked for this change
      </div>
    )
  }

  return (
    <div className="studio-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
      <div className="space-y-4">
        {groupedArtifactItems.map((scopeGroup) => (
          <ScopeArtifactsSection
            key={scopeGroup.scope}
            scopeGroup={scopeGroup}
            openTypeGroups={openTypeGroups}
            onOpenTypeGroupsChange={setOpenTypeGroups}
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
  onOpenTypeGroupsChange,
  selected,
  onSelect,
}: {
  scopeGroup: ArtifactScopeGroup
  openTypeGroups: string[]
  onOpenTypeGroupsChange: (types: string[]) => void
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
        <Accordion
          type="multiple"
          value={openTypeGroups}
          onValueChange={onOpenTypeGroupsChange}
          className="space-y-1.5"
        >
          {scopeGroup.typeGroups.map((typeGroup) => (
            <AccordionItem
              key={typeGroup.type}
              value={typeGroup.type}
              className="bg-background/25"
            >
              <AccordionTrigger className="bg-background/20 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground">
                <span className="flex-1 font-medium capitalize text-foreground">
                  {typeGroup.type}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {artifactTypeGroupFileCount(typeGroup)}{' '}
                  {artifactTypeGroupFileCount(typeGroup) === 1 ? 'file' : 'files'}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <ChangeTypeGroupFiles
                  group={typeGroup}
                  selected={selected}
                  onSelect={onSelect}
                />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
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
