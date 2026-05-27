import type { GraphStatusDto } from '@specd/client'
import { ChevronRight, FileText, Folder, GitBranch } from 'lucide-react'
import * as React from 'react'
import type { WorkspaceSpecsEntry } from '../hooks/use-workspace-specs-collection.js'
import { buildSpecPathTree, type SpecPathTreeNode } from '../lib/build-spec-path-tree.js'
import { cn } from '../lib/cn.js'

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
    <div className="flex min-h-0 flex-col text-xs">
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
    <button
      type="button"
      className="studio-sidebar-row border-l-2"
      onClick={onOpenGraph}
    >
      <GitBranch className="h-3.5 w-3.5 shrink-0 text-studio-warning" />
      <span className="min-w-0 flex-1 truncate">Code Graph</span>
      <span className="studio-badge">
        {graphStatus?.indexed ? (graphStatus.stale ? 'stale' : 'ready') : 'off'}
      </span>
    </button>
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
    <li className="studio-card overflow-hidden">
      <button
        type="button"
        className={cn(
          'flex w-full items-center gap-2 border-l-2 border-transparent px-3 py-2 text-left transition-colors duration-150 hover:bg-background/60',
          isSelectedWorkspace && 'bg-accent text-accent-foreground',
        )}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {entry.workspace.name}
        </span>
        <span className="studio-badge">{entry.specs.length}</span>
      </button>

      {open ? (
        entry.error ? (
          <p className="border-t border-border px-3 py-2 text-destructive">{entry.error.message}</p>
        ) : tree.length === 0 ? (
          <p className="border-t border-border px-3 py-2 text-muted-foreground">
            No specs in workspace
          </p>
        ) : (
          <ul className="border-t border-border py-1">
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
    <li>
      <div
        className="flex items-center"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
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
        <button
          type="button"
          className={cn(
            'studio-sidebar-row min-w-0 flex-1 py-1 pr-2',
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
          <span className="truncate">{node.name}</span>
        </button>
      </div>
      {isFolder && open
        ? node.children.map((child) => (
            <TreeNodeRow
              key={`${workspace}:${child.fullPath}`}
              workspace={workspace}
              node={child}
              depth={depth + 1}
              selectedWorkspace={selectedWorkspace}
              selectedSpecPath={selectedSpecPath}
              onSelectSpec={onSelectSpec}
            />
          ))
        : null}
    </li>
  )
}
