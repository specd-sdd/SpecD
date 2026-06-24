import type { ChangeSummaryDto, ProjectDto, ProjectStatusDto } from '@specd/client'
import {
  AlertTriangle,
  Bell,
  BookOpenText,
  CheckCircle2,
  Moon,
  Plus,
  Search,
  SunMedium,
} from 'lucide-react'
import * as React from 'react'
import type { SpecdAppMode } from '../SpecdApp.js'
import { Button } from '../components/ui/button.js'
import { SidebarTrigger } from '../components/ui/sidebar.js'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover.js'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip.js'
import { useChangesOverlaps } from '../hooks/use-changes-overlaps.js'
import { useClosedSpecsValidation } from '../hooks/use-closed-specs-validation.js'
import { useDocumentPlatform } from '../hooks/use-document-platform.js'
import { cn } from '../lib/utils.js'

export type StudioTitlebarProps = {
  hostMode: SpecdAppMode
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
  showSidebarTrigger?: boolean
}

export function StudioTitlebar({
  hostMode,
  onOpenCommandPalette,
  onNewChange,
  className,
  project,
  projectStatus,
  activeChanges,
  refreshKey = 0,
  theme = 'dark',
  onToggleTheme,
  loadingActive = false,
  showSidebarTrigger = true,
}: StudioTitlebarProps): React.ReactElement {
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
  const platform = useDocumentPlatform()
  const isDarwinDesktop = hostMode === 'desktop' && platform === 'darwin'

  const [isReady, setIsReady] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  const overlapsRes = useChangesOverlaps(refreshKey, { enabled: isReady && !loadingActive })
  const validationRes = useClosedSpecsValidation(workspaces, active, refreshKey, {
    enabled: isReady && !loadingActive,
  })

  const overlaps = overlapsRes.data
  const failedClosedSpecs = validationRes.data

  const hasNotifications = !!(
    projectStatus?.graph?.stale ||
    overlaps?.hasOverlap ||
    (failedClosedSpecs && failedClosedSpecs.length > 0)
  )

  const notificationsPanel = (
    <SystemHealthNotifications
      projectStatus={projectStatus}
      overlaps={overlaps}
      failedClosedSpecs={failedClosedSpecs}
      hasNotifications={hasNotifications}
    />
  )

  return (
    <TooltipProvider>
      <header
        className={cn('studio-titlebar', isDarwinDesktop && 'studio-titlebar-darwin', className)}
        data-testid="studio-titlebar"
      >
        {isDarwinDesktop ? (
          <div className="studio-titlebar-traffic-slot" aria-hidden data-testid="studio-titlebar-traffic-slot" />
        ) : null}
        {showSidebarTrigger ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger
                className="studio-titlebar-no-drag h-8 w-8 shrink-0"
                data-testid="studio-toggle-sidebar"
              />
            </TooltipTrigger>
            <TooltipContent className="border-border bg-panel px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground">
              Toggle sidebar (⌘B)
            </TooltipContent>
          </Tooltip>
        ) : null}

        <Button
          variant="outline"
          data-testid="studio-open-command-palette"
          className="studio-titlebar-no-drag flex min-w-0 flex-1 items-center justify-start gap-2 border-border bg-background/50 px-3 py-1.5 text-left font-mono text-xs text-muted-foreground shadow-none transition-colors duration-150 hover:border-primary/30 hover:bg-background/70 hover:text-foreground"
          onClick={onOpenCommandPalette}
        >
          <Search className="h-3 w-3 shrink-0" />
          <span className="truncate">Search specs, changes, commands…</span>
          <kbd className="ml-auto hidden rounded border border-border bg-panel px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground sm:inline">
            ⌘K
          </kbd>
        </Button>

        <div className="studio-titlebar-no-drag flex shrink-0 items-center gap-1">
          <Button
            type="button"
            className="h-8 gap-1 px-2 text-xs"
            data-testid="studio-new-change"
            onClick={onNewChange}
          >
            <Plus className="h-3 w-3" />
            <span className="hidden sm:inline">New Change</span>
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
                    className="relative h-8 w-8"
                    data-testid="studio-titlebar-notifications"
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {hasNotifications ? (
                      <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-studio-error opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-studio-error" />
                      </span>
                    ) : null}
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
              {notificationsPanel}
            </PopoverContent>
          </Popover>

          <TopBarIconButton label="Appearance" onClick={onToggleTheme}>
            {theme === 'light' ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <SunMedium className="h-3.5 w-3.5" />
            )}
          </TopBarIconButton>
        </div>
      </header>
    </TooltipProvider>
  )
}

function SystemHealthNotifications({
  projectStatus,
  overlaps,
  failedClosedSpecs,
  hasNotifications,
}: {
  projectStatus?: ProjectStatusDto
  overlaps: ReturnType<typeof useChangesOverlaps>['data']
  failedClosedSpecs: ReturnType<typeof useClosedSpecsValidation>['data']
  hasNotifications: boolean
}): React.ReactElement {
  return (
    <div className="studio-scrollbar flex max-h-[350px] flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-border bg-panel-header px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <span>System Health</span>
        {hasNotifications ? (
          <span className="rounded bg-studio-error/10 px-1.5 py-0.5 font-sans text-[9px] normal-case text-studio-error">
            Action required
          </span>
        ) : null}
      </div>

      <div className="space-y-2 p-2 text-xs">
        {projectStatus?.graph?.stale ? (
          <div className="flex gap-2 rounded border border-studio-warning/30 bg-studio-warning/5 p-2 text-[11px] leading-relaxed">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-warning" />
            <div>
              <div className="font-semibold text-foreground">Stale Code Graph</div>
              <div className="mt-0.5 text-muted-foreground">
                Codebase graph index is outdated. Run{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                  specd graph index
                </code>{' '}
                to refresh.
              </div>
            </div>
          </div>
        ) : null}

        {overlaps?.hasOverlap
          ? overlaps.entries.map((entry, idx) => (
              <div
                key={idx}
                className="flex gap-2 rounded border border-studio-warning/30 bg-studio-warning/5 p-2 text-[11px] leading-relaxed"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-warning" />
                <div>
                  <div className="font-semibold text-foreground">Change Overlap Conflict</div>
                  <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                    {entry.specId}
                  </div>
                </div>
              </div>
            ))
          : null}

        {failedClosedSpecs && failedClosedSpecs.length > 0
          ? failedClosedSpecs.map((entry, idx) => (
              <div
                key={idx}
                className="flex gap-2 rounded border border-studio-error/30 bg-studio-error/5 p-2 text-[11px] leading-relaxed"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-studio-error" />
                <div>
                  <div className="font-semibold text-foreground">Spec Validation Failed</div>
                  <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">
                    {entry.specId}
                  </div>
                </div>
              </div>
            ))
          : null}

        {!hasNotifications ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-muted-foreground">
            <CheckCircle2 className="mb-2 h-8 w-8 text-studio-success opacity-80" />
            <div className="text-[11px] font-medium text-foreground">Workspace Healthy</div>
          </div>
        ) : null}
      </div>
    </div>
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
          className="hidden h-8 w-8 md:inline-flex"
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

/** @deprecated Use StudioTitlebar */
export const StudioTopBar = StudioTitlebar

export type StudioTopBarProps = StudioTitlebarProps
