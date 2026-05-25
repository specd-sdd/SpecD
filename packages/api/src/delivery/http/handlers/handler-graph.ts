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

/**
 * Registers code graph routes under `/v1`.
 * @param app
 */
export function registerGraphRoutes(app: FastifyInstance): void {
  app.get(
    '/graph/status',
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
    apiHandler(async (ctx, req) => {
      const query = req.query as {
        q?: string
        symbols?: string
        specs?: string
        limit?: string
        workspace?: string
      }
      if (query.q === undefined) {
        throw new Error('q is required')
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
        const symbols = symbolsOnly || !specsOnly
          ? await provider.searchSymbols(searchOpts)
          : []
        const specs = specsOnly || !symbolsOnly ? await provider.searchSpecs(searchOpts) : []
        return toGraphSearchResultDto(symbols, specs)
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/impact',
    apiHandler(async (ctx, req) => {
      const query = req.query as {
        symbol?: string
        file?: string
        direction?: string
        depth?: string
      }
      const direction = (query.direction ?? 'dependents') as
        | 'upstream'
        | 'downstream'
        | 'both'
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
        throw new Error('symbol or file query parameter is required')
      } finally {
        await provider.close()
      }
    }),
  )

  app.get(
    '/graph/hotspots',
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
