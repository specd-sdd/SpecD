import {
  type GraphIndexJsonValue,
  type RunIsolatedGraphIndexInput,
} from '../application/ports/isolated-graph-index-runner.js'
import { createNodeIsolatedGraphIndexRunner } from '../infrastructure/isolated-index-worker/supervisor.js'

/**
 * Runs a trusted graph-index task in a dedicated child process.
 * @param input - Host task input.
 * @returns The JSON-serializable child task result.
 */
export function runIsolatedGraphIndex<
  TInput = GraphIndexJsonValue,
  TProgress = GraphIndexJsonValue,
  TResult = GraphIndexJsonValue,
>(input: RunIsolatedGraphIndexInput<TInput, TProgress>): Promise<TResult> {
  return createNodeIsolatedGraphIndexRunner(
    new URL(
      './infrastructure/isolated-index-worker/isolated-index-worker-child.js',
      import.meta.url,
    ),
  ).run(input)
}
