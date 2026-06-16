import { Bell, BookOpenText, Plus, Search, SunMedium } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip.js'
import { cn } from '../lib/utils.js'

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
    <TooltipProvider>
      <header
        className={cn(
          'flex h-12 shrink-0 items-center gap-3 border-b border-border bg-panel-header px-3',
          className,
        )}
      >
        <div className="hidden shrink-0 items-center gap-3 md:flex">
          <div className="rounded-md border border-border bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
            SpecD
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Studio
          </div>
        </div>

        <Button
          variant="outline"
          data-testid="studio-open-command-palette"
          className="flex min-w-0 flex-1 items-center justify-start gap-2 border-border bg-background/50 px-3 py-2 text-left font-mono text-xs text-muted-foreground shadow-none transition-colors duration-150 hover:border-primary/30 hover:bg-background/70 hover:text-foreground"
          onClick={onOpenCommandPalette}
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="truncate">Search specs, changes, commands…</span>
          <kbd className="ml-auto hidden rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground sm:inline">
            ⌘K
          </kbd>
        </Button>

        <Button type="button" className="gap-1" data-testid="studio-new-change" onClick={onNewChange}>
          <Plus className="h-3 w-3" />
          New Change
        </Button>

        <TopBarIconButton label="Docs">
          <BookOpenText className="h-3.5 w-3.5" />
        </TopBarIconButton>
        <TopBarIconButton label="Notifications">
          <Bell className="h-3.5 w-3.5" />
        </TopBarIconButton>
        <TopBarIconButton label="Appearance">
          <SunMedium className="h-3.5 w-3.5" />
        </TopBarIconButton>
      </header>
    </TooltipProvider>
  )
}

function TopBarIconButton({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="hidden md:inline-flex">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="border-border bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
