import type { GraphHealthWarningDto, ProjectDto, ProjectStatusDto, ChangeSummaryDto } from '@specd/client'
import { AlertTriangle, Bell, BookOpenText, CheckCircle2, Moon, Plus, Search, SunMedium } from 'lucide-react'
import * as React from 'react'
import { Button } from '../components/ui/button.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip.js'
import { useChangesOverlaps } from '../hooks/use-changes-overlaps.js'
import { useClosedSpecsValidation } from '../hooks/use-closed-specs-validation.js'
import { useProjectPollSession } from '../hooks/project-poll-session.js'
import { cn } from '../lib/utils.js'

export type StudioTopBarProps = {
  onOpenCommandPalette: () => void
  onNewChange?: () => void
  className?: string
  project?: ProjectDto
  projectStatus?: ProjectStatusDto
  activeChanges?: readonly ChangeSummaryDto[]
  refreshKey?: number
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
  loadingActive?: boolean
}

function graphWarningTitle(type: string): string {
  if (type === 'graph-fingerprint-mismatch') {
    return 'Graph Fingerprint Mismatch'
  }
  return 'Stale Code Graph'
}

/**
 * Global Studio chrome: search entry, new change, command palette.
 */
export function StudioTopBar({
  onOpenCommandPalette,
  onNewChange,
  className,
  project,
  projectStatus: projectStatusProp,
  activeChanges,
  refreshKey = 0,
  theme = 'dark',
  onToggleTheme,
  loadingActive = false,
}: StudioTopBarProps): React.ReactElement {
  const pollSession = useProjectPollSession()
  const projectStatus = pollSession.projectStatus ?? projectStatusProp

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

  const workspaces = project?.workspaces ?? []
  const active = activeChanges ?? []

  const [isReady, setIsReady] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const overlapsRes = useChangesOverlaps(refreshKey, { enabled: isReady && !loadingActive })
  const validationRes = useClosedSpecsValidation(workspaces, active, refreshKey, { enabled: isReady && !loadingActive })

  const overlaps = overlapsRes.data
  const failedClosedSpecs = validationRes.data
  const graph = projectStatus?.graph
  const graphWarnings = graph?.warnings ?? []
  const graphWarningCards: readonly GraphHealthWarningDto[] =
    graphWarnings.length > 0
      ? graphWarnings
      : [
          ...(graph?.stale
            ? [{ type: 'graph-stale', message: 'Graph is stale — run graph index to refresh' }]
            : []),
          ...(graph?.fingerprintMismatch
            ? [
                {
                  type: 'graph-fingerprint-mismatch',
                  message:
                    'Derivation fingerprint mismatch — code-graph version or workspace configuration changed since last index',
                },
              ]
            : []),
        ]

  const hasNotifications = !!(
    graphWarningCards.length > 0 ||
    overlaps?.hasOverlap ||
    (failedClosedSpecs && failedClosedSpecs.length > 0)
  )

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

        <TopBarIconButton label="Docs" href="https://getspecd.dev/docs/guide/getting-started">
          <BookOpenText className="h-3.5 w-3.5" />
        </TopBarIconButton>

        <Popover>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="relative hidden md:inline-flex"
                >
                  <Bell className="h-3.5 w-3.5" />
                  {hasNotifications && (
                    <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-studio-error opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-studio-error"></span>
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent className="border-border bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
              Notifications
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            className="w-80 border-border bg-panel p-0 shadow-lg text-foreground"
            align="end"
          >
            <div className="studio-scrollbar flex flex-col max-h-[350px] overflow-y-auto">
              <div className="border-b border-border bg-panel-header px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground flex justify-between items-center">
                <span>System Health</span>
                {hasNotifications && (
                  <span className="text-[9px] text-studio-error bg-studio-error/10 px-1.5 py-0.5 rounded font-sans normal-case">
                    Action required
                  </span>
                )}
              </div>

              <div className="p-2 space-y-2 text-xs">
                {graphWarningCards.map((warning, idx) => (
                  <div
                    key={`${warning.type}-${idx}`}
                    className="flex gap-2 rounded border border-studio-warning/30 bg-studio-warning/5 p-2 text-[11px] leading-relaxed"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-studio-warning shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-foreground">{graphWarningTitle(warning.type)}</div>
                      <div className="text-muted-foreground mt-0.5">{warning.message}</div>
                    </div>
                  </div>
                ))}

                {overlaps?.hasOverlap && overlaps.entries.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 rounded border border-studio-warning/30 bg-studio-warning/5 p-2 text-[11px] leading-relaxed">
                    <AlertTriangle className="h-3.5 w-3.5 text-studio-warning shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-foreground">Change Overlap Conflict</div>
                      <div className="text-muted-foreground mt-0.5 font-mono text-[10px] break-all">{entry.specId}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        Modified by active changes:
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                          {entry.changes.map((c, cIdx) => (
                            <li key={cIdx}>
                              <span className="font-semibold text-foreground">{c.name}</span> ({c.state})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}

                {failedClosedSpecs && failedClosedSpecs.length > 0 && failedClosedSpecs.map((entry, idx) => (
                  <div key={idx} className="flex gap-2 rounded border border-studio-error/30 bg-studio-error/5 p-2 text-[11px] leading-relaxed">
                    <AlertTriangle className="h-3.5 w-3.5 text-studio-error shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-foreground">Spec Validation Failed</div>
                      <div className="text-muted-foreground mt-0.5 font-mono text-[10px] break-all">{entry.specId}</div>
                      <div className="text-[10px] text-muted-foreground mt-1 space-y-1">
                        {entry.failures.map((f, fIdx) => (
                          <div key={fIdx} className="border-l-2 border-studio-error/50 pl-1.5 py-0.5">
                            <span className="font-semibold text-foreground">{f.artifactId}</span>: {f.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {!hasNotifications && (
                  <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 text-studio-success mb-2 opacity-80" />
                    <div className="font-medium text-foreground text-[11px]">Workspace Healthy</div>
                    <div className="text-[10px] mt-1 px-4">No spec validation errors, stale indexes, or change overlap conflicts found.</div>
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <TopBarIconButton label="Appearance" onClick={onToggleTheme}>
          {theme === 'light' ? (
            <Moon className="h-3.5 w-3.5" />
          ) : (
            <SunMedium className="h-3.5 w-3.5" />
          )}
        </TopBarIconButton>
      </header>
    </TooltipProvider>
  )
}

function TopBarIconButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string
  href?: string
  onClick?: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          asChild={!!href}
          onClick={onClick}
        >
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
              {children}
            </a>
          ) : (
            children
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="border-border bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
