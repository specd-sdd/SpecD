import type { ChangeDetailDto, ChangeHistoryEventDto, ChangeStatusDto } from '@specd/client'
import * as React from 'react'
import {
  Card as StudioCard,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js'
import { EditChangeDialog } from './EditChangeDialog.js'
import { ChangeSpecsReadonlyPanel } from './ChangeSpecsReadonlyPanel.js'
import type { ChangeListSection } from './change-list-section.js'
import { ChangeLifecycleActions } from './ChangeLifecycleActions.js'
import { ChangeStatusPanel } from './ChangeStatusPanel.js'

function formatHistoryActor(by: ChangeHistoryEventDto['by']): string {
  if (by === undefined) return ''
  if (typeof by === 'string') return by
  if (typeof by === 'object' && 'name' in by) {
    return by.email ? `${by.name} <${by.email}>` : by.name
  }
  return ''
}

export function ChangeOverview({
  change,
  status,
  statusLoading = false,
  statusError,
  editable = false,
  onScopeSaved,
  onScopeInvalidated,
  listSection = null,
  lifecycleBusy = false,
  onShelfToDrafts,
  onRestoreToActive,
  onDiscardChange,
  onArchiveChange,
}: {
  change: ChangeDetailDto
  status?: ChangeStatusDto
  statusLoading?: boolean
  statusError?: Error
  editable?: boolean
  listSection?: ChangeListSection | null
  lifecycleBusy?: boolean
  onScopeSaved?: (detail: ChangeDetailDto) => void
  onScopeInvalidated?: () => void
  onShelfToDrafts?: () => void
  onRestoreToActive?: () => void
  onDiscardChange?: () => void
  onArchiveChange?: () => void
}): React.ReactElement {
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)

  const specApproved =
    change.approvals?.specApproved ??
    change.history.some((e) => e.type === 'spec-approved')

  return (
    <div className="@container min-h-0 flex-1 overflow-auto p-4 text-xs">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Change Overview
          </div>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{change.name}</h1>
        {change.description ? (
          <p className="mt-2 max-w-3xl text-muted-foreground">{change.description}</p>
        ) : null}
        {listSection !== null ? (
          <div className="mt-3">
            <ChangeLifecycleActions
              listSection={listSection}
              state={change.state}
              busy={lifecycleBusy}
              onEdit={editable ? () => setEditDialogOpen(true) : undefined}
              onDraft={listSection === 'active' ? onShelfToDrafts : undefined}
              onRestore={listSection === 'draft' ? onRestoreToActive : undefined}
              onDiscard={
                listSection === 'active' || listSection === 'draft' ? onDiscardChange : undefined
              }
              onArchive={listSection === 'active' ? onArchiveChange : undefined}
            />
          </div>
        ) : null}
      </div>

      <div className="grid w-full grid-cols-1 gap-3 @[640px]:grid-cols-2 @[960px]:grid-cols-3">
        <Card title="Workflow & validation" className="col-span-full">
          <ChangeStatusPanel
            embedded
            status={status}
            loading={statusLoading}
            error={statusError}
          />
        </Card>

        <Card title="Details">
          <dl className="space-y-1">
            <Row label="State" value={change.state} />
            <Row label="Schema" value={`${change.schemaName} @ ${change.schemaVersion}`} />
            <Row label="Invalidation" value={change.invalidationPolicy ?? 'downstream'} />
            {change.updatedAt ? <Row label="Updated" value={change.updatedAt} /> : null}
            <Row label="Specs in scope" value={String(change.specIds.length)} />
          </dl>
        </Card>

        <Card title="Status">
          <ul className="space-y-1">
            <li>
              Spec approved:{' '}
              <span className={specApproved ? 'text-emerald-400' : 'text-muted-foreground'}>
                {specApproved ? 'yes' : 'no'}
              </span>
            </li>
            <li>
              Sign-off:{' '}
              <span className="text-muted-foreground">
                {change.approvals?.signoffApproved === true ? 'yes' : 'pending'}
              </span>
            </li>
          </ul>
        </Card>

        <Card title="History snapshot" className="@[640px]:col-span-2 @[960px]:col-span-1">
          <div className="space-y-1 text-muted-foreground">
            <p>Events tracked: {change.history.length}</p>
            <p>Latest state: {change.state}</p>
            <p>Last revision: {change.updatedAt ?? 'n/a'}</p>
          </div>
        </Card>

        <Card title="Specs & dependencies" className="col-span-full">
          <ChangeSpecsReadonlyPanel change={change} />
        </Card>

        <Card title="Recent events" className="col-span-full">
          <ul className="max-h-40 space-y-0.5 overflow-auto font-mono">
            {change.history.slice(-8).reverse().map((event, i) => (
              <li key={`${event.type}-${event.at}-${i}`} className="text-muted-foreground">
                <span className="text-foreground">{event.type}</span>
                {' · '}
                {event.at}
                {event.by ? ` · ${formatHistoryActor(event.by)}` : ''}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {editable ? (
        <EditChangeDialog
          open={editDialogOpen}
          change={change}
          onClose={() => setEditDialogOpen(false)}
          onSaved={(detail, meta) => {
            onScopeSaved?.(detail)
            if (meta.scopeInvalidated) onScopeInvalidated?.()
          }}
          onScopeInvalidated={onScopeInvalidated}
        />
      ) : null}
    </div>
  )
}

function Card({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <StudioCard className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </StudioCard>
  )
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate">{value}</dd>
    </div>
  )
}
