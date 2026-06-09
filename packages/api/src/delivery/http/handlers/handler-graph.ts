import { createVcsAdapter, ChangeNotFoundError, SpecNotFoundError, SpecPath } from '@specd/core'
import { type FastifyInstance } from 'fastify'
import { buildProjectGraphConfig } from '../../../composition/build-project-graph-config.js'
import { apiHandler } from '../handler-utils.js'
import {
  toChangeGraphViewDto,
  toGraphFileRefDto,
  toGraphImpactDto,
  toGraphSearchResultDto,
  toGraphSymbolRefDto,
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
      const body = (req.body ?? {}) as { force?: boolean }
      const provider = ctx.createGraphProvider()
      if (body.force === true) {
        await provider.recreate()
      }
      await provider.open()
      try {
        const workspaces = await ctx.kernel.project.listWorkspaces.execute()
        const graphConfig = buildProjectGraphConfig(ctx.config)
        const vcs = await Promise.resolve(createVcsAdapter(ctx.config.projectRoot)).catch(
          () => null,
        )
        const vcsRef = (await vcs?.ref()) ?? undefined
        const result = await provider.index({
          projectRoot: ctx.config.projectRoot,
          workspaces,
          graphConfig,
          ...(vcsRef !== undefined ? { vcsRef } : {}),
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
              kinds: NON_EMPTY_STRING_SCHEMA,
              filePattern: NON_EMPTY_STRING_SCHEMA,
              excludePaths: NON_EMPTY_STRING_SCHEMA,
              excludeWorkspaces: NON_EMPTY_STRING_SCHEMA,
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
        kinds?: string
        filePattern?: string
        excludePaths?: string
        excludeWorkspaces?: string
      }
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const limit = query.limit !== undefined ? Number(query.limit) : 10
        const searchOpts = {
          query: query.q,
          limit,
          ...(query.workspace !== undefined ? { workspace: query.workspace } : {}),
          ...(query.kinds !== undefined
            ? {
                kinds: query.kinds
                  .split(',')
                  .map((kind) => kind.trim())
                  .filter((kind) => kind.length > 0),
              }
            : {}),
          ...(query.filePattern !== undefined ? { filePattern: query.filePattern } : {}),
          ...(query.excludePaths !== undefined
            ? {
                excludePaths: query.excludePaths
                  .split(',')
                  .map((path) => path.trim())
                  .filter((path) => path.length > 0),
              }
            : {}),
          ...(query.excludeWorkspaces !== undefined
            ? {
                excludeWorkspaces: query.excludeWorkspaces
                  .split(',')
                  .map((workspace) => workspace.trim())
                  .filter((workspace) => workspace.length > 0),
              }
            : {}),
        }
        const symbolsOnly = query.symbols === 'true'
        const specsOnly = query.specs === 'true'
        const symbols = symbolsOnly || !specsOnly ? await provider.searchSymbols(searchOpts) : []
        const specs = specsOnly || !symbolsOnly ? await provider.searchSpecs(searchOpts) : []
        return toGraphSearchResultDto(ctx.config, symbols, specs)
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
              spec: NON_EMPTY_STRING_SCHEMA,
              direction: IMPACT_DIRECTION_QUERY_SCHEMA,
              depth: POSITIVE_INTEGER_QUERY_SCHEMA,
            },
            oneOf: [{ required: ['symbol'] }, { required: ['file'] }, { required: ['spec'] }],
          }),
        },
        response: { 200: 'GraphImpactDto' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const query = req.query as {
        symbol?: string
        file?: string
        spec?: string
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
            ctx.config,
            query.symbol,
            direction,
            impact,
            impact.affectedSymbols.map((s) => ({
              id: s.id,
              name: s.name,
              filePath: s.filePath,
              line: s.line,
              depth: s.depth,
              risk: impact.riskLevel,
            })),
          )
        }
        if (query.file !== undefined) {
          const impact = await provider.analyzeFileImpact(query.file, direction, maxDepth)
          return toGraphImpactDto(
            ctx.config,
            query.file,
            direction,
            impact,
            impact.affectedSymbols.map((s) => ({
              id: s.id,
              name: s.name,
              filePath: s.filePath,
              line: s.line,
              depth: s.depth,
              risk: impact.riskLevel,
            })),
          )
        }
        if (query.spec !== undefined) {
          const impact = await provider.analyzeSpecImpact(query.spec, direction, maxDepth)
          return toGraphImpactDto(
            ctx.config,
            query.spec,
            direction,
            impact,
            impact.affectedSymbols.map((s) => ({
              id: s.id,
              name: s.name,
              filePath: s.filePath,
              line: s.line,
              depth: s.depth,
              risk: impact.riskLevel,
            })),
            impact.affectedSpecs,
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
      const spec = await ctx.kernel.specs.get.execute({
        workspace,
        specPath: SpecPath.parse(path),
      })
      if (spec === null) {
        throw new SpecNotFoundError(specId)
      }
      const provider = ctx.createGraphProvider()
      await provider.open()
      try {
        const coveredFiles = await provider.getCoveredFiles(specId)
        const coveredSymbols = await provider.getCoveredSymbols(specId)
        return {
          specId,
          files: coveredFiles.map((r) => toGraphFileRefDto(ctx.config, r.target)),
          symbols: (
            await Promise.all(
              coveredSymbols.map(async (relation) => {
                const symbol = await provider.getSymbol(relation.target)
                return symbol === undefined ? null : toGraphSymbolRefDto(ctx.config, symbol)
              }),
            )
          ).filter((entry) => entry !== null),
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
            const coveredFiles = (await provider.getCoveredFiles(specId)).map((r) =>
              toGraphFileRefDto(ctx.config, r.target),
            )
            const coveredSymbols = (
              await Promise.all(
                (await provider.getCoveredSymbols(specId)).map(async (relation) => {
                  const symbol = await provider.getSymbol(relation.target)
                  return symbol === undefined ? null : toGraphSymbolRefDto(ctx.config, symbol)
                }),
              )
            ).filter((entry) => entry !== null)
            return { specId, coveredFiles, coveredSymbols }
          }),
        )
        return toChangeGraphViewDto(ctx.config, name, [...change.specIds], specs)
      } finally {
        await provider.close()
      }
    }),
  )
}
