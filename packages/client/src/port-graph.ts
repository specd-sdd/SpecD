import type { ChangeGraphViewDto } from './dto/change-graph-view.js'
import type { GraphSpecCoverageDto } from './dto/graph-spec-coverage.js'
import type { GraphImpactDto } from './dto/graph-impact.js'
import type { GraphIndexResultDto } from './dto/graph-index-result.js'
import type { GraphSearchResultDto } from './dto/graph-search.js'
import type { GraphStatusDto } from './dto/graph-status.js'
import type { GraphImpactInput, GraphIndexInput, GraphSearchInput } from './inputs.js'

/** Code graph operations (`api:routes-graph`). */
export interface PortGraph {
  getGraphStatus(signal?: AbortSignal): Promise<GraphStatusDto>
  indexGraph(input?: GraphIndexInput): Promise<GraphIndexResultDto>
  searchGraph(query: GraphSearchInput): Promise<GraphSearchResultDto>
  getImpact(query: GraphImpactInput): Promise<GraphImpactDto>
  getHotspots(signal?: AbortSignal): Promise<readonly Record<string, unknown>[]>
  getSpecGraphView(
    workspace: string,
    specPath: string,
    signal?: AbortSignal,
  ): Promise<GraphSpecCoverageDto>
  getChangeGraphView(name: string, signal?: AbortSignal): Promise<ChangeGraphViewDto>
}
