import {
  buildProjectGraphConfig,
  createIndexProjectGraph,
  type CodeGraphProvider,
  type IndexProgressCallback,
  type IndexResult,
} from '@specd/code-graph'
import { createVcsAdapter } from '@specd/core'
import { type SdkHostContext } from '../composition/host-context.js'
import {
  withOpenGraphProvider,
  type WithOpenGraphProviderOptions,
} from '../composition/with-open-graph-provider.js'
import { codeGraphVersion } from '../shared/code-graph-version.js'

/** Input for {@link runIndexProjectGraph}. */
export interface RunIndexProjectGraphInput {
  /** Rebuild the entire index from scratch. */
  readonly force?: boolean
  /** Restrict indexing to these workspace names; all when omitted. */
  readonly workspaces?: readonly string[]
  /** Progress callback forwarded to the indexer. */
  readonly onProgress?: IndexProgressCallback
  /** Hook invoked before provider open (e.g. CLI lock acquisition). */
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  /** Optional global exclude paths merged into graph config. */
  readonly excludePaths?: readonly string[]
}

/** Result of project graph indexing. */
export type RunIndexProjectGraphResult = IndexResult

/**
 * Lists workspaces, resolves VCS ref, and runs project graph indexing.
 *
 * @param ctx - SDK host context
 * @param input - Index options and optional lifecycle hooks
 * @returns Index result from {@link IndexProjectGraph}
 */
export async function runIndexProjectGraph(
  ctx: SdkHostContext,
  input: RunIndexProjectGraphInput = {},
): Promise<RunIndexProjectGraphResult> {
  const config = ctx.kernel.project.getConfig.execute()
  const listed = await ctx.kernel.project.listWorkspaces.execute()
  const workspaces =
    input.workspaces !== undefined
      ? listed.filter((ws) => input.workspaces!.includes(ws.name))
      : listed

  const projectRoot = config.projectRoot
  const vcs = await createVcsAdapter(projectRoot).catch(() => null)
  const vcsRef = (await vcs?.ref()) ?? undefined

  const graphConfig = buildProjectGraphConfig(config, {
    ...(input.excludePaths !== undefined ? { excludePaths: [...input.excludePaths] } : {}),
  })

  const providerOptions: WithOpenGraphProviderOptions | undefined =
    input.beforeOpen !== undefined ? { beforeOpen: input.beforeOpen } : undefined

  return withOpenGraphProvider(
    ctx,
    async (provider) => {
      const indexProjectGraph = createIndexProjectGraph()
      return indexProjectGraph.execute({
        provider,
        projectRoot,
        workspaces,
        graphConfig,
        codeGraphVersion,
        ...(input.force !== undefined ? { force: input.force } : {}),
        ...(vcsRef !== undefined ? { vcsRef } : {}),
        ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
      })
    },
    providerOptions,
  )
}
