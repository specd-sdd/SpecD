import { ChangeNotFoundError } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { buildWorkspaceIndexTargets } from '../../../composition/build-graph-index-targets.js'
import { apiHandler } from '../handler-utils.js'
import {
  toChangeGraphViewDto,
  toGraphImpactDto,
  toGraphSearchResultDto,
  toGraphStatusDto,
} from '../presenters/presenter-graph.js'
import {
  apiRouteSchema,
  BOOLEAN_QUERY_SCHEMA,
  GRAPH_RISK_QUERY_SCHEMA,
  IMPACT_DIRECTION_QUERY_SCHEMA,
  PARAMS_CHANGE_NAME,
  PARAMS_GRAPH_WORKSPACE_WILDCARD,
  POSITIVE_INTEGER_QUERY_SCHEMA,
  NON_EMPTY_STRING_SCHEMA,
  strictObjectSchema,
} from '../route-schema.js'

/**
 * Registers code graph routes under `/v1`.
 * @param app
 */
export function registerGraphRoutes(app: FastifyInstance): void {
  app.get(
    '/graph/status',
    { ...apiRouteSchema({ response: { 200: 'GraphStatusDto' } }) },
    apiHandler(async (ctx) => {
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const stats = await provider.getStatistics()
        return toGraphStatusDto(stats, null)
      } finally {
        await provider.close()
      }
    }),
  )

  app.post(
    '/graph/index',
    {
      ...apiRouteSchema({
        body: 'GraphIndexBody',
        response: { 200: 'GraphIndexResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const body = (req.body ?? {}) as { workspaces?: string[] }
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const filter = body.workspaces?.[0]
        const targets = await buildWorkspaceIndexTargets(ctx.config, ctx.kernel, filter)
        const result = await provider.index({
          workspaces: targets,
          projectRoot: ctx.config.projectRoot,
        })
        return result
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/search',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            required: ['q'],
            properties: {
              q: NON_EMPTY_STRING_SCHEMA,
              symbols: BOOLEAN_QUERY_SCHEMA,
              specs: BOOLEAN_QUERY_SCHEMA,
              limit: POSITIVE_INTEGER_QUERY_SCHEMA,
              workspace: NON_EMPTY_STRING_SCHEMA,
            },
          }),
        },
        response: { 200: 'GraphSearchResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const query = req.query as {
        q: string
        symbols?: string
        specs?: string
        limit?: string
        workspace?: string
      }
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const limit = query.limit !== undefined ? Number(query.limit) : 10
        const searchOpts = {
          query: query.q,
          limit,
          ...(query.workspace !== undefined ? { workspace: query.workspace } : {}),
        }
        const symbolsOnly = query.symbols === 'true'
        const specsOnly = query.specs === 'true'
        const symbols = symbolsOnly || !specsOnly ? await provider.searchSymbols(searchOpts) : []
        const specs = specsOnly || !symbolsOnly ? await provider.searchSpecs(searchOpts) : []
        return toGraphSearchResultDto(symbols, specs)
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/impact',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            properties: {
              symbol: NON_EMPTY_STRING_SCHEMA,
              file: NON_EMPTY_STRING_SCHEMA,
              direction: IMPACT_DIRECTION_QUERY_SCHEMA,
              depth: POSITIVE_INTEGER_QUERY_SCHEMA,
            },
            oneOf: [{ required: ['symbol'] }, { required: ['file'] }],
          }),
        },
        response: { 200: 'GraphImpactDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const query = req.query as {
        symbol?: string
        file?: string
        direction?: string
        depth?: string
      }
      const direction =
        query.direction === 'dependencies'
          ? 'upstream'
          : query.direction === 'dependents' || query.direction === undefined
            ? 'downstream'
            : (query.direction as 'upstream' | 'downstream' | 'both')
      const maxDepth = query.depth !== undefined ? Number(query.depth) : 3
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        if (query.symbol !== undefined) {
          const impact = await provider.analyzeImpact(query.symbol, direction, maxDepth)
          return toGraphImpactDto(
            query.symbol,
            direction,
            impact.affectedSymbols.map((s) => ({
              id: s.id,
              name: s.name,
              kind: 'symbol',
              filePath: s.filePath,
              risk: impact.riskLevel,
            })),
          )
        }
        if (query.file !== undefined) {
          const impact = await provider.analyzeFileImpact(query.file, direction, maxDepth)
          return toGraphImpactDto(
            query.file,
            direction,
            [],
            impact.affectedFiles.map((p) => ({ path: p, risk: impact.riskLevel })),
          )
        }
        throw new Error('Invalid graph impact request')
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/hotspots',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            properties: {
              minRisk: GRAPH_RISK_QUERY_SCHEMA,
              limit: POSITIVE_INTEGER_QUERY_SCHEMA,
            },
          }),
        },
        response: { 200: 'GraphHotspotsResultDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const query = req.query as { minRisk?: string; limit?: string }
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const result = await provider.getHotspots({
          ...(query.minRisk !== undefined
            ? { minRisk: query.minRisk as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }
            : {}),
          ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}),
        })
        return result
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/specs/:workspace/*',
    {
      ...apiRouteSchema({
        params: PARAMS_GRAPH_WORKSPACE_WILDCARD,
        response: { 200: 'GraphSpecCoverageDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { workspace } = req.params as { workspace: string }
      const path = (req.params as { '*': string })['*']
      const specId = `${workspace}:${path}`
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const coveredFiles = await provider.getCoveredFiles(specId)
        const coveredSymbols = await provider.getCoveredSymbols(specId)
        return {
          specId,
          files: coveredFiles.map((r) => r.target),
          symbols: coveredSymbols.map((r) => r.target),
        }
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/changes/:name',
    {
      ...apiRouteSchema({
        params: PARAMS_CHANGE_NAME,
        response: { 200: 'ChangeGraphViewDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const { name } = req.params as { name: string }
      const change = await ctx.kernel.changes.repo.get(name)
      if (change === null) {
        throw new ChangeNotFoundError(name)
      }
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const specs = await Promise.all(
          [...change.specIds].map(async (specId) => {
            const coveredFiles = (await provider.getCoveredFiles(specId)).map((r) => r.target)
            const coveredSymbols = (await provider.getCoveredSymbols(specId)).map((r) => r.target)
            return { specId, coveredFiles, coveredSymbols }
          }),
        )
        return toChangeGraphViewDto(name, [...change.specIds], specs)
      } finally {
        await provider.close()
      }
    }),
  )
}
