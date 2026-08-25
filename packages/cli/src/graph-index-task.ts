import {
  createBootstrapGraphConfig,
  createSdkContext,
  openSpecdHost,
  runIndexProjectGraph,
  type GraphIndexTask,
  type RunIndexProjectGraphResult,
} from '@specd/sdk'
import { buildCliKernelOptions } from './helpers/cli-context.js'

/** Serializable description of the graph context reconstructed by the task. */
export type CliGraphIndexContextDescriptor =
  | {
      readonly mode: 'configured'
      readonly configFilePath: string
    }
  | {
      readonly mode: 'bootstrap'
      readonly projectRoot: string
      readonly vcsRoot: string
    }

/** Serializable input accepted by the packaged graph-index task. */
export interface CliGraphIndexTaskInput {
  /** The already-resolved graph context to reconstruct in the child. */
  readonly context: CliGraphIndexContextDescriptor
  /** Index execution options which are safe to cross the worker boundary. */
  readonly index: {
    /** Rebuild the graph index from scratch. */
    readonly force: boolean
    /** Optional global paths excluded from indexing. */
    readonly excludePaths?: readonly string[]
  }
}

/** Progress emitted by the CLI task for presentation in its parent process. */
export interface CliGraphIndexProgress {
  /** Percentage reported by the indexer. */
  readonly percent: number
  /** Current indexing phase. */
  readonly phase: string
}

/**
 * Reconstructs a CLI-equivalent SDK context and indexes the graph once.
 *
 * This task deliberately owns no process, IPC, lock, formatting, or Commander
 * concerns; those belong to the isolated runner and CLI command respectively.
 *
 * @param input - Serializable graph context and indexing options.
 * @param emitProgress - Reports index progress to the isolated-run supervisor.
 * @returns The unmodified SDK indexing result.
 */
export const runGraphIndexTask: GraphIndexTask<
  CliGraphIndexTaskInput,
  CliGraphIndexProgress,
  RunIndexProjectGraphResult
> = async (input, emitProgress) => {
  const kernel = buildCliKernelOptions()
  const host =
    input.context.mode === 'configured'
      ? await openSpecdHost({
          configPath: input.context.configFilePath,
          options: { kernel },
        })
      : await createSdkContext(
          createBootstrapGraphConfig({
            projectRoot: input.context.projectRoot,
            vcsRoot: input.context.vcsRoot,
          }),
          { kernel },
        )

  return runIndexProjectGraph(host, {
    force: input.index.force,
    ...(input.index.excludePaths !== undefined ? { excludePaths: input.index.excludePaths } : {}),
    onProgress: (percent, phase) => emitProgress({ percent, phase }),
  })
}
