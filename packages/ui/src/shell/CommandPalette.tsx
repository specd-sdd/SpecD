import { FileText, FolderTree, GitBranchPlus, ShieldCheck } from 'lucide-react'
import * as React from 'react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '../components/ui/command.js'

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
  return (
    <CommandDialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matches found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={action.label + (action.hint ? ` ${action.hint}` : '')}
              onSelect={() => {
                action.onSelect()
                onClose()
              }}
            >
              {action.icon}
              <span>{action.label}</span>
              {action.hint && <CommandShortcut>{action.hint}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
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
