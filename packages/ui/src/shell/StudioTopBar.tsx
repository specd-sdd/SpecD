import { Bell, BookOpenText, Plus, Search, SunMedium } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
import { cn } from '../lib/cn.js'

export type StudioTopBarProps = {
  onOpenCommandPalette: () => void
  onNewChange?: () => void
  className?: string
}

/**
 * Global Studio chrome: search entry, new change, command palette.
 */
export function StudioTopBar({
  onOpenCommandPalette,
  onNewChange,
  className,
}: StudioTopBarProps): React.ReactElement {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenCommandPalette()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpenCommandPalette])

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3',
        className,
      )}
    >
      <div className="hidden shrink-0 items-center gap-2 md:flex">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          SpecD Studio
        </div>
      </div>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-input px-3 py-2 text-left text-xs text-muted-foreground hover:border-ring/50 hover:text-foreground"
        onClick={onOpenCommandPalette}
      >
        <Search className="h-3 w-3 shrink-0" />
        <span className="truncate">Search specs, changes, commands…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-panel px-1 font-mono text-xs sm:inline">
          ⌘K
        </kbd>
      </button>

      <Button type="button" className="h-8 gap-1 px-3 text-xs" onClick={onNewChange}>
        <Plus className="h-3 w-3" />
        New Change
      </Button>

      <button type="button" className="studio-sidebar-row hidden w-auto px-2 py-2 md:flex">
        <BookOpenText className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="studio-sidebar-row hidden w-auto px-2 py-2 md:flex">
        <Bell className="h-3.5 w-3.5" />
      </button>
      <button type="button" className="studio-sidebar-row hidden w-auto px-2 py-2 md:flex">
        <SunMedium className="h-3.5 w-3.5" />
      </button>
    </header>
  )
}
