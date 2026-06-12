import * as React from 'react'
import { Network, RefreshCw, AlertTriangle, FileText, Code, FolderTree } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js'
import { Button } from '../components/ui/button.js'
import { Badge } from '../components/ui/badge.js'
import { useSpecdDataPort } from '../context/specd-data-context.js'
import { useAsyncResource } from '../hooks/use-async-resource.js'
import { useStudioPanelActions } from '../hooks/use-studio-panel.js'

export function GraphMainView({
  refreshKey,
}: {
  refreshKey: number
}): React.ReactElement {
  const port = useSpecdDataPort()
  const { appendOutput } = useStudioPanelActions()
  const [indexing, setIndexing] = React.useState(false)

  // Fetch status
  const loadStatus = React.useCallback(() => port.getGraphStatus(), [port])
  const status = useAsyncResource('graph-status-main', loadStatus, { refreshKey })

  // Fetch hotspots
  const loadHotspots = React.useCallback(async () => {
    try {
      const data = await port.getHotspots()
      return (data as any).entries || []
    } catch {
      return []
    }
  }, [port])
  const hotspots = useAsyncResource('graph-hotspots-main', loadHotspots, { refreshKey })

  const handleIndexGraph = async () => {
    setIndexing(true)
    try {
      void appendOutput({
        message: 'Starting manual graph index...',
        level: 'info',
        action: 'index-graph',
      })
      const result = await port.indexGraph({ force: true })
      void appendOutput({
        message: `Graph indexing complete. Found ${result.filesIndexed} files, ${result.specsIndexed} specs. Took ${result.duration}ms.`,
        level: 'info',
        action: 'index-graph',
      })
      status.refetch()
    } catch (err) {
      void appendOutput({
        message: `Graph indexing failed: ${err instanceof Error ? err.message : String(err)}`,
        level: 'error',
        action: 'index-graph',
      })
    } finally {
      setIndexing(false)
    }
  }

  const s = status.data

  return (
    <div className="@container min-h-0 flex-1 overflow-auto p-4 text-xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Workspace Overview
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Network className="h-6 w-6 text-studio-warning" />
            Code Graph
          </h1>
          <p className="mt-2 text-muted-foreground">
            The Code Graph maps relationships between specifications, source files, and code symbols across all workspaces.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={indexing || status.isLoading}
          onClick={() => void handleIndexGraph()}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${indexing ? 'animate-spin' : ''}`} />
          {indexing ? 'Indexing...' : 'Force Reindex'}
        </Button>
      </div>

      <div className="grid w-full grid-cols-1 gap-3 @[640px]:grid-cols-2 @[960px]:grid-cols-4">
        {/* Stats Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Index Status
            </CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {s?.lastIndexedAt !== null ? (
                <span className="text-emerald-500">Ready</span>
              ) : (
                <span className="text-amber-500">Off</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {s?.stale ? 'Stale (needs update)' : 'Up to date'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Specifications
            </CardTitle>
            <FileText className="h-4 w-4 text-studio-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{s?.specCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Indexed specs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Documents
            </CardTitle>
            <FolderTree className="h-4 w-4 text-studio-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{s?.documentCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Indexed files</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Code Symbols
            </CardTitle>
            <Code className="h-4 w-4 text-studio-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{s?.symbolCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Indexed symbols</p>
          </CardContent>
        </Card>

        {/* Hotspots Section */}
        <Card className="col-span-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              High-Impact Hotspots
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hotspots.isLoading ? (
              <p className="text-muted-foreground py-4">Analyzing graph hotspots...</p>
            ) : hotspots.data && hotspots.data.length > 0 ? (
              <div className="space-y-4">
                {hotspots.data.slice(0, 10).map((hotspot: any, i: number) => (
                  <div key={i} className="flex flex-col gap-1 rounded border border-border/50 bg-background/50 p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant={hotspot.riskLevel === 'CRITICAL' ? 'destructive' : 'secondary'} className="text-[9px]">
                          {hotspot.riskLevel}
                        </Badge>
                        <span className="font-mono font-medium text-[11px]">{hotspot.symbol.name}</span>
                        <span className="text-[9px] text-muted-foreground px-1 rounded bg-muted uppercase tracking-wider">{hotspot.symbol.kind}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {hotspot.directCallers} direct callers / {hotspot.fileImporters} file importers
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground font-mono truncate">
                      {hotspot.symbol.filePath}:{hotspot.symbol.line}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground py-4">No high-risk hotspots detected in the graph.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
