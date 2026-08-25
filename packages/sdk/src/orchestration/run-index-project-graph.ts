import {
  buildProjectGraphConfig,
  createIndexProjectGraph,
  type CodeGraphProvider,
  GraphStorageRecoveryRequiredError,
  type IndexProgressCallback,
  type IndexResult,
} from '@specd/code-graph'
import { createVcsAdapter } from '@specd/core'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'
import { InvalidProviderLifecycleError } from '../domain/errors/index.js'
import { codeGraphVersion } from '../shared/code-graph-version.js'

/** Input for {@link runIndexProjectGraph}. */
export interface RunIndexProjectGraphInput {
  /** Rebuild the entire index from scratch. */
  readonly force?: boolean
  /** Restrict indexing to these workspace names; all when omitted. */
  readonly workspaces?: readonly string[]
  /** Progress callback forwarded to the indexer. */
  readonly onProgress?: IndexProgressCallback
  /** Hook invoked before provider open (only applies when creating a transient provider). */
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  /** Hook invoked after provider close (only applies when creating a transient provider). */
  readonly afterClose?: (provider: CodeGraphProvider) => Promise<void>
  /** Optional global exclude paths merged into graph config. */
  readonly excludePaths?: readonly string[]
  /** Optional open provider instance. When supplied, indexing runs on this instance directly without wrapping in withOpenGraphProvider or calling lifecycle hooks/close. */
  readonly provider?: CodeGraphProvider
}

/** Result of project graph indexing. */
export type RunIndexProjectGraphResult = IndexResult & {
  readonly fullRebuild: boolean
  readonly fullRebuildReason: string | null
}

/**
 * Lists workspaces, resolves VCS ref, and runs project graph indexing.
 *
 * @param ctx - SDK host context
 * @param input - Index options and optional lifecycle hooks or open provider instance
 * @returns Index result from {@link IndexProjectGraph}
 * @throws {@link InvalidProviderLifecycleError} When `input.provider` is passed alongside `beforeOpen` or `afterClose`.
 */
export async function runIndexProjectGraph(
  ctx: SdkHostContext,
  input: RunIndexProjectGraphInput = {},
): Promise<RunIndexProjectGraphResult> {
  if (
    input.provider !== undefined &&
    (input.beforeOpen !== undefined || input.afterClose !== undefined)
  ) {
    throw new InvalidProviderLifecycleError()
  }

  const config = ctx.kernel.project.getConfig.execute()
  const listed = await ctx.kernel.project.listWorkspaces.execute()
  const workspaces =
    input.workspaces !== undefined
      ? listed.filter((ws) => input.workspaces!.includes(ws.name))
      : listed

  const projectRoot = config.projectRoot
  const vcs = await createVcsAdapter(projectRoot).catch(() => null)
  const vcsRef = (await vcs?.ref()) ?? undefined
  const vcsRoot =
    vcs === null
      ? null
      : (() => {
          try {
            return vcs.rootDir()
          } catch {
            return null
          }
        })()

  const graphConfig = buildProjectGraphConfig(config, {
    ...(input.excludePaths !== undefined ? { excludePaths: [...input.excludePaths] } : {}),
  })
  const indexProjectGraph = createIndexProjectGraph()

  const executeIndex = async (
    provider: CodeGraphProvider,
    repair = { fullRebuild: false, fullRebuildReason: null as string | null },
  ): Promise<RunIndexProjectGraphResult> => {
    const result = await indexProjectGraph.execute({
      provider,
      projectRoot,
      workspaces,
      graphConfig,
      codeGraphVersion,
      vcsRoot,
      ...(input.force !== undefined ? { force: input.force } : {}),
      ...(vcsRef !== undefined ? { vcsRef } : {}),
      ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
      getSpecMetadata: ctx.kernel.specs.getMetadata,
    })
    return {
      ...result,
      fullRebuild: repair.fullRebuild || result.fullRebuild || input.force === true,
      fullRebuildReason: repair.fullRebuildReason ?? result.fullRebuildReason ?? null,
    }
  }

  if (input.provider !== undefined) {
    return executeIndex(input.provider)
  }

  let repair = { fullRebuild: false, fullRebuildReason: null as string | null }
  return withOpenGraphProvider<RunIndexProjectGraphResult>(
    ctx,
    (provider) => executeIndex(provider, repair),
    {
      ...(input.beforeOpen === undefined ? {} : { beforeOpen: input.beforeOpen }),
      ...(input.afterClose === undefined ? {} : { afterClose: input.afterClose }),
      ...(input.force === true
        ? {
            recoverOpenFailure: async (
              error: unknown,
              provider: CodeGraphProvider,
            ): Promise<boolean> => {
              if (!(error instanceof GraphStorageRecoveryRequiredError)) return false
              await provider.recreate()
              repair = {
                fullRebuild: true,
                fullRebuildReason: error.reason,
              }
              return true
            },
          }
        : {}),
    },
  )
}
