import { FileText, FolderTree, GitBranchPlus, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/cn.js'

export type CommandPaletteAction = {
  id: string
  label: string
  hint?: string
  icon?: React.ReactElement
  onSelect: () => void
}

export type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  actions: readonly CommandPaletteAction[]
}

/**
 * Modal command palette (⌘K).
 */
export function CommandPalette({
  open,
  onClose,
  actions,
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = React.useState('')
  const [highlight, setHighlight] = React.useState(0)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return actions
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.hint?.toLowerCase().includes(q) ?? false),
    )
  }, [actions, query])

  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setHighlight(0)
    }
  }, [open])

  React.useEffect(() => {
    setHighlight(0)
  }, [query])

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlight((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlight((i) => Math.max(i - 1, 0))
      }
      if (event.key === 'Enter' && filtered[highlight]) {
        event.preventDefault()
        filtered[highlight].onSelect()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, filtered, highlight, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          autoFocus
          className="border-b border-border bg-input px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Type a command or search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="max-h-64 overflow-auto py-1 text-xs">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-muted-foreground">No matches</li>
          ) : (
            filtered.map((action, index) => (
              <li key={action.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent/60',
                    index === highlight && 'bg-accent text-foreground',
                  )}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => {
                    action.onSelect()
                    onClose()
                  }}
                >
                  <span className="text-muted-foreground">{action.icon}</span>
                  <span className="flex-1 font-medium">{action.label}</span>
                  {action.hint ? (
                    <span className="text-muted-foreground">{action.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

/** Default palette entries until actions are wired to kernel calls. */
export function defaultCommandPaletteActions(handlers: {
  onValidateAll?: () => void
  onNewChange?: () => void
  onFocusChanges?: () => void
  onFocusWorkspaces?: () => void
}): CommandPaletteAction[] {
  return [
    {
      id: 'validate-all',
      label: 'Validate all changes',
      hint: 'Project',
      icon: <ShieldCheck className="h-3 w-3" />,
      onSelect: () => handlers.onValidateAll?.(),
    },
    {
      id: 'new-change',
      label: 'New change',
      hint: 'Create',
      icon: <GitBranchPlus className="h-3 w-3" />,
      onSelect: () => handlers.onNewChange?.(),
    },
    {
      id: 'sidebar-changes',
      label: 'Show changes sidebar',
      icon: <FileText className="h-3 w-3" />,
      onSelect: () => handlers.onFocusChanges?.(),
    },
    {
      id: 'sidebar-workspaces',
      label: 'Show workspaces sidebar',
      icon: <FolderTree className="h-3 w-3" />,
      onSelect: () => handlers.onFocusWorkspaces?.(),
    },
  ]
}
