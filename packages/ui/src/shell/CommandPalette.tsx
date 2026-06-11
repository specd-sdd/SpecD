import { FileText, GitBranchPlus, ShieldCheck, Loader2, Code, Folder } from 'lucide-react'
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
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { cn } from '../lib/utils.js'

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
  onSelectSpec?: (workspace: string, path: string) => void
  onSelectSymbol?: (workspace: string, file: string, line: number) => void
  onSelectDocument?: (workspace: string, path: string) => void
}

/**
 * Modal command palette (⌘K).
 * Now supports remote search for specs and code symbols.
 */
export function CommandPalette({
  open,
  onClose,
  actions,
  onSelectSpec,
  onSelectSymbol,
  onSelectDocument,
}: CommandPaletteProps): React.ReactElement | null {
  const port = useSpecdDataPort()
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [results, setResults] = React.useState<{
    readonly specs: readonly any[]
    readonly symbols: readonly any[]
    readonly documents: readonly any[]
  }>({ specs: [], symbols: [], documents: [] })

  const lastQueryRef = React.useRef('')

  // Debounced remote search
  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setResults({ specs: [], symbols: [], documents: [] })
      lastQueryRef.current = ''
      return
    }

    const trimmed = query.trim()
    if (!trimmed || trimmed === lastQueryRef.current) {
      if (!trimmed) {
        setResults({ specs: [], symbols: [], documents: [] })
        lastQueryRef.current = ''
      }
      return
    }

    const handler = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await port.searchGraph({
          q: trimmed,
          specs: true,
          symbols: true,
          documents: true,
          limit: 10,
        })
        lastQueryRef.current = trimmed
        setResults({
          specs: data.specs ?? [],
          symbols: data.symbols ?? [],
          documents: data.documents ?? [],
        })
      } catch (err) {
        console.error('Command palette search failed:', err)
        setResults({ specs: [], symbols: [], documents: [] })
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(handler)
  }, [query, port, open])

  const hasResults =
    results.specs.length > 0 || results.symbols.length > 0 || results.documents.length > 0

  return (
    <CommandDialog 
      open={open} 
      onOpenChange={(isOpen) => !isOpen && onClose()}
      shouldFilter={false}
    >
      <CommandInput 
        placeholder="Type a command or search specs and symbols…" 
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="studio-scrollbar">
        {loading && (
          <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            Searching...
          </div>
        )}

        {!loading && query.trim() !== '' && !hasResults && (
          <CommandEmpty>No matches found for "{query}".</CommandEmpty>
        )}

        {/* Global Actions */}
        <CommandGroup heading="Actions">
          {actions.map((action) => (
            <CommandItem
              key={action.id}
              value={`action:${action.label} ${action.hint ?? ''}`}
              onSelect={() => {
                action.onSelect()
                onClose()
              }}
            >
              <div className="mr-2 opacity-70">{action.icon}</div>
              <span>{action.label}</span>
              {action.hint && <CommandShortcut>{action.hint}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Search Results: Specs */}
        {results.specs.length > 0 && (
          <CommandGroup heading="Specifications">
            {results.specs.map((spec) => (
              <CommandItem
                key={spec.specId}
                value={`spec:${spec.specId} ${spec.title ?? ''}`}
                onSelect={() => {
                  onSelectSpec?.(spec.workspace, spec.path)
                  onClose()
                }}
                className="flex flex-col items-start py-2"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-studio-info opacity-70" />
                  <span className="font-mono text-[11px] font-medium">{spec.specId}</span>
                  {spec.title && (
                    <span className="text-[10px] text-muted-foreground italic truncate">
                      — {spec.title}
                    </span>
                  )}
                </div>
                {spec.snippet && (
                  <div className="ml-5.5 mt-1.5 w-full overflow-hidden rounded border border-border/40 bg-muted/20 px-2 py-1.5">
                    <pre className="font-mono text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
                      {spec.snippet.trim()}
                    </pre>
                  </div>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search Results: Symbols */}
        {results.symbols.length > 0 && (
          <CommandGroup heading="Code Symbols">
            {results.symbols.map((sym, i) => (
              <CommandItem
                key={`sym-${i}-${sym.symbol.name}`}
                value={`symbol:${sym.symbol.name} ${sym.workspace}:${sym.symbol.workspaceRelativePath}`}
                onSelect={() => {
                  onSelectSymbol?.(sym.workspace, sym.symbol.workspaceRelativePath, sym.symbol.line)
                  onClose()
                }}
                className="flex flex-col items-start py-2"
              >
                <div className="flex items-center gap-2">
                  <Code className="h-3.5 w-3.5 text-studio-success opacity-70" />
                  <span className="font-mono text-[11px] font-medium">{sym.symbol.name}</span>
                  <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground uppercase tracking-tight">
                    {sym.symbol.kind}
                  </span>
                </div>
                <div className="ml-5.5 flex items-center gap-1.5 text-[10px] text-muted-foreground truncate">
                  <span className="font-medium text-studio-warning/80">{sym.workspace}</span>
                  <span className="opacity-40">/</span>
                  <span className="truncate">{sym.symbol.workspaceRelativePath}:{sym.symbol.line}</span>
                </div>
                {sym.snippet && (
                  <div className="ml-5.5 mt-1.5 w-full overflow-hidden rounded border border-border/40 bg-muted/20 px-2 py-1.5">
                    <pre className="font-mono text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
                      {sym.snippet.trim()}
                    </pre>
                  </div>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search Results: Documents */}
        {results.documents.length > 0 && (
          <CommandGroup heading="Documents">
            {results.documents.map((doc, i) => (
              <CommandItem
                key={`doc-${i}-${doc.path}`}
                value={`document:${doc.path} ${doc.workspace}`}
                onSelect={() => {
                  onSelectDocument?.(doc.workspace, doc.path)
                  onClose()
                }}
                className="flex flex-col items-start py-2"
              >
                <div className="flex items-center gap-2">
                  <Folder className="h-3.5 w-3.5 text-studio-warning opacity-70" />
                  <span className="font-mono text-[11px] font-medium text-studio-warning/90">
                    {doc.workspace}
                  </span>
                  <span className="opacity-40">/</span>
                  <span className="truncate font-mono text-[11px]">{doc.path}</span>
                </div>
                {doc.snippet && (
                  <div className="ml-5.5 mt-1.5 w-full overflow-hidden rounded border border-border/40 bg-muted/20 px-2 py-1.5">
                    <pre className="font-mono text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap">
                      {doc.snippet.trim()}
                    </pre>
                  </div>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}

/** Default palette entries until actions are wired to kernel calls. */
export function defaultCommandPaletteActions(handlers: {
  onValidateAll?: () => void
  onNewChange?: () => void
}): CommandPaletteAction[] {
  const actions: CommandPaletteAction[] = []

  if (handlers.onValidateAll) {
    actions.push({
      id: 'validate-all',
      label: 'Validate change artifacts',
      hint: 'Current',
      icon: <ShieldCheck className="h-3 w-3" />,
      onSelect: () => handlers.onValidateAll?.(),
    })
  }

  if (handlers.onNewChange) {
    actions.push({
      id: 'new-change',
      label: 'New change',
      hint: 'Create',
      icon: <GitBranchPlus className="h-3 w-3" />,
      onSelect: () => handlers.onNewChange?.(),
    })
  }

  return actions
}
