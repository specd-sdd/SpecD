import { type Change, SpecNotFoundError, SpecPath } from '@specd/core'
import { type FastifyInstance, type FastifyRequest } from 'fastify'
import { type ApiContext } from '../../../composition/create-api-context.js'
import { apiHandler } from '../handler-utils.js'
import { toSpecDetailDto, toSpecSummaryDto } from '../presenters/presenter-spec.js'
import { toArtifactContentDto } from '../presenters/presenter-artifact.js'
import {
  apiRouteSchema,
  NON_EMPTY_STRING_SCHEMA,
  PARAMS_WORKSPACE_WILDCARD,
  strictObjectSchema,
} from '../route-schema.js'

async function handleWorkspaceSpecWildcard(ctx: ApiContext, req: FastifyRequest): Promise<unknown> {
  const { ws } = req.params as { ws: string }
  const wildcard = (req.params as { '*': string })['*']
  const segments = wildcard.split('/').filter(Boolean)
  if (req.method === 'POST' && segments[segments.length - 1] === 'metadata') {
    const path = segments.slice(0, -1).join('/')
    const specId = `${ws}:${path}`
    const body = (req.body ?? {}) as { generate?: boolean; metadata?: string }
    if (body.generate === true) {
      await ctx.kernel.specs.generateMetadata.execute({ specId })
      return { ok: true, generated: true }
    }
    if (typeof body.metadata === 'string') {
      await ctx.kernel.specs.saveMetadata.execute({
        workspace: ws,
        specPath: SpecPath.parse(path),
        content: body.metadata,
      })
      return { ok: true }
    }
    throw new Error('metadata body or generate=true is required')
  }
  if (segments.length >= 2 && segments[segments.length - 2] === 'artifacts') {
    const filename = segments[segments.length - 1]!
    const path = segments.slice(0, -2).join('/')
    const specId = `${ws}:${path}`
    const repo = ctx.kernel.specs.repos.get(ws)
    if (repo === undefined) {
      throw new SpecNotFoundError(specId)
    }
    const got = await ctx.kernel.specs.get.execute({
      workspace: ws,
      specPath: SpecPath.parse(path),
    })
    if (got === null) {
      throw new SpecNotFoundError(specId)
    }
    const artifact = await repo.artifact(got.spec, filename)
    if (artifact === null) {
      throw new SpecNotFoundError(specId)
    }
    return toArtifactContentDto(filename, {
      content: artifact.content,
      originalHash: artifact.originalHash ?? '',
    })
  }
  if (segments[segments.length - 1] === 'outline') {
    const path = segments.slice(0, -1).join('/')
    const query = req.query as { filename?: string; artifactId?: string }
    const body =
      req.method === 'POST' ? ((req.body ?? {}) as { content?: string; filename?: string }) : {}
    const filename = body.filename ?? query.filename
    return ctx.kernel.specs.getOutline.execute({
      workspace: ws,
      specPath: SpecPath.parse(path),
      ...(filename !== undefined ? { filename } : {}),
      ...(query.artifactId !== undefined ? { artifactId: query.artifactId } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
    })
  }
  if (segments[segments.length - 1] === 'context') {
    const path = segments.slice(0, -1).join('/')
    const query = req.query as Record<string, string | undefined>
    const result = await ctx.kernel.specs.getContext.execute({
      workspace: ws,
      specPath: SpecPath.parse(path),
      contextMode: 'full',
      sections: ['rules', 'constraints', 'scenarios'],
      llmOptimizedContext: ctx.config.llmOptimizedContext ?? false,
      ...(query.followDeps === 'true' ? { followDeps: true } : {}),
      ...(query.depth !== undefined ? { depth: Number(query.depth) } : {}),
    })
    return { entries: result.entries, warnings: result.warnings }
  }
  const path = segments.join('/')
  const specId = `${ws}:${path}`
  const got = await ctx.kernel.specs.get.execute({
    workspace: ws,
    specPath: SpecPath.parse(path),
  })
  if (got === null) {
    throw new SpecNotFoundError(specId)
  }
  const { spec, artifacts } = got
  const active = await ctx.kernel.changes.list.execute()
  const linked = active
    .filter((c: Change) => c.specIds.includes(specId))
    .map((c: Change) => ({
      name: c.name,
      ...(c.description !== undefined ? { description: c.description } : {}),
      state: c.state,
    }))
  const meta = await ctx.kernel.specs.repos.get(ws)?.metadata(spec)
  return toSpecDetailDto(
    {
      specId,
      workspace: ws,
      path,
      title: meta?.title ?? path,
      ...(meta?.description !== undefined ? { description: meta.description } : {}),
      dependsOn: meta?.dependsOn ?? [],
      artifacts: [...artifacts.values()].map((a) => ({
        filename: a.filename,
        ...(a.originalHash !== undefined ? { hash: a.originalHash } : {}),
      })),
    },
    linked,
  )
}

const WORKSPACE_SPEC_WILDCARD_SCHEMA = {
  ...apiRouteSchema({
    params: PARAMS_WORKSPACE_WILDCARD,
    response: { 200: 'JsonObjectDto' },
  }),
}

const WORKSPACE_SPEC_WILDCARD_POST_SCHEMA = {
  ...apiRouteSchema({
    params: PARAMS_WORKSPACE_WILDCARD,
    body: {
      anyOf: [{ $ref: 'SpecMetadataBody#' }, { $ref: 'SpecOutlineDraftBody#' }],
    },
    response: { 200: 'JsonObjectDto' },
  }),
}

/**
 * Registers workspace spec read routes.
 * @param app
 */
export function registerSpecsReadRoutes(app: FastifyInstance): void {
  app.get(
    '/workspaces/:ws/specs/*',
    WORKSPACE_SPEC_WILDCARD_SCHEMA,
    apiHandler(handleWorkspaceSpecWildcard),
  )
  app.post(
    '/workspaces/:ws/specs/*',
    WORKSPACE_SPEC_WILDCARD_POST_SCHEMA,
    apiHandler(handleWorkspaceSpecWildcard),
  )

  app.get(
    '/specs/search',
    {
      ...apiRouteSchema({
        querystring: {
          ...strictObjectSchema({
            required: ['q'],
            properties: {
              q: NON_EMPTY_STRING_SCHEMA,
              workspace: NON_EMPTY_STRING_SCHEMA,
            },
          }),
        },
        response: { 200: 'SpecSummaryList' },
      }),
    },
    apiHandler(async (ctx, req) => {
      const query = req.query as { q: string; workspace?: string }
      const results = await ctx.kernel.specs.search.execute(
        query.q,
        query.workspace !== undefined ? { workspaces: [query.workspace] } : undefined,
      )
      return results.map((r) =>
        toSpecSummaryDto({
          workspace: r.workspace,
          path: r.path,
          title: r.title,
          summary: r.summary,
        }),
      )
    }),
  )
}
