import type { GraphStatusDto } from '@specd/client'
import { ChevronRight, FileText, Folder, GitBranch } from 'lucide-react'
import * as React from 'react'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card } from '../components/ui/card.js'
import type { WorkspaceSpecsEntry } from '../hooks/use-workspace-specs-collection.js'
import { buildSpecPathTree, type SpecPathTreeNode } from '../lib/build-spec-path-tree.js'
import { cn } from '../lib/utils.js'

export function WorkspacesSidebar({
  entries,
  loading,
  selectedWorkspace,
  selectedSpecPath,
  onSelectSpec,
}: {
  entries: readonly WorkspaceSpecsEntry[]
  loading: boolean
  selectedWorkspace: string | undefined
  selectedSpecPath: string | undefined
  onSelectSpec: (workspace: string, path: string) => void
}): React.ReactElement {
  return (
    <div className="flex w-full min-w-0 flex-col text-xs pr-2">
      {loading && entries.length === 0 ? (
        <p className="px-2 py-2 text-muted-foreground">Loading workspaces…</p>
      ) : entries.length === 0 ? (
        <p className="px-2 py-2 text-muted-foreground">No workspaces available</p>
      ) : (
        <ul className="space-y-2 px-2 py-2">
          {entries.map((entry) => (
            <WorkspaceSection
              key={entry.workspace.name}
              entry={entry}
              selectedWorkspace={selectedWorkspace}
              selectedSpecPath={selectedSpecPath}
              onSelectSpec={onSelectSpec}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function GraphSidebarEntry({
  graphStatus,
  onOpenGraph,
}: {
  graphStatus?: GraphStatusDto
  onOpenGraph?: () => void
}): React.ReactElement {
  return (
    <div className="px-2 py-1">
      <Button
        variant="ghost"
        size="sm"
        className="studio-sidebar-row flex h-auto w-full min-w-0 max-w-full justify-start border-l-2 px-2 py-1.5"
        onClick={onOpenGraph}
      >
        <GitBranch className="h-3.5 w-3.5 shrink-0 text-studio-warning" />
        <span className="min-w-0 flex-1 truncate text-left font-medium text-foreground">Code Graph</span>
        <Badge variant="secondary" className="h-4 px-1 text-[9px]">
          {graphStatus?.lastIndexedAt !== null ? (graphStatus?.stale ? 'stale' : 'ready') : 'off'}
        </Badge>
      </Button>
    </div>
  )
}

function WorkspaceSection({
  entry,
  selectedWorkspace,
  selectedSpecPath,
  onSelectSpec,
}: {
  entry: WorkspaceSpecsEntry
  selectedWorkspace: string | undefined
  selectedSpecPath: string | undefined
  onSelectSpec: (workspace: string, path: string) => void
}): React.ReactElement {
  const [open, setOpen] = React.useState(true)
  const tree = React.useMemo(() => buildSpecPathTree(entry.specs), [entry.specs])
  const isSelectedWorkspace = selectedWorkspace === entry.workspace.name

  return (
    <li className="flex w-full min-w-0 flex-col">
      <Card className="flex w-full min-w-0 max-w-full flex-col overflow-hidden bg-background/35 shadow-none">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex h-auto w-full min-w-0 max-w-full justify-start gap-2 rounded-none border-b border-border/60 bg-panel-header/70 px-3 py-2 text-left overflow-hidden transition-colors duration-150 hover:bg-panel-header',
            isSelectedWorkspace && 'bg-accent/80 text-accent-foreground',
          )}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight
            className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
          />
          <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground">
            {entry.workspace.name}
          </span>
          <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">{entry.specs.length}</Badge>
        </Button>

        {open ? (
          entry.error ? (
            <p className="border-t border-border px-3 py-2 text-destructive">{entry.error.message}</p>
          ) : tree.length === 0 ? (
            <p className="border-t border-border px-3 py-2 text-muted-foreground">
              No specs in workspace
            </p>
          ) : (
            <ul className="flex w-full min-w-0 flex-col border-t border-border p-1.5">
              {tree.map((node) => (
                <TreeNodeRow
                  key={`${entry.workspace.name}:${node.fullPath}`}
                  workspace={entry.workspace.name}
                  node={node}
                  depth={0}
                  selectedWorkspace={selectedWorkspace}
                  selectedSpecPath={selectedSpecPath}
                  onSelectSpec={onSelectSpec}
                />
              ))}
            </ul>
          )
        ) : null}
      </Card>
    </li>
  )
}

function TreeNodeRow({
  workspace,
  node,
  depth,
  selectedWorkspace,
  selectedSpecPath,
  onSelectSpec,
}: {
  workspace: string
  node: SpecPathTreeNode
  depth: number
  selectedWorkspace: string | undefined
  selectedSpecPath: string | undefined
  onSelectSpec: (workspace: string, path: string) => void
}): React.ReactElement {
  const [open, setOpen] = React.useState(depth < 2)
  const isFolder = node.children.length > 0
  const isSelected =
    node.specId !== undefined &&
    workspace === selectedWorkspace &&
    node.fullPath === selectedSpecPath

  return (
    <li className="min-w-0">
      <div
        className="flex min-w-0 items-center"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}>
        {isFolder ? (
          <button
            type="button"
            className="mr-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent/50"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'studio-sidebar-row flex h-auto w-0 flex-1 min-w-0 max-w-full justify-start overflow-hidden px-2 py-1',
            isSelected && 'studio-sidebar-row-active',
          )}
          onClick={() => {
            if (node.specId) {
              onSelectSpec(workspace, node.fullPath)
            } else {
              setOpen(true)
            }
          }}
        >
          {isFolder ? (
            <Folder className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <FileText
              className={cn(
                'h-3 w-3 shrink-0',
                isSelected ? 'text-[color:var(--studio-lifecycle)]' : 'text-muted-foreground',
              )}
            />
          )}
          <span className="truncate text-left">{node.name}</span>
        </Button>
      </div>
      {isFolder && open ? (
        <ul className="flex min-w-0 flex-col">
          {node.children.map((child) => (
            <TreeNodeRow
              key={`${workspace}:${child.fullPath}`}
              workspace={workspace}
              node={child}
              depth={depth + 1}
              selectedWorkspace={selectedWorkspace}
              selectedSpecPath={selectedSpecPath}
              onSelectSpec={onSelectSpec}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}
