import { type CodeGraphProvider, type ExplainGraphPathResult } from '@specd/code-graph'
import { type SdkHostContext } from '../composition/host-context.js'
import { withOpenGraphProvider } from '../composition/with-open-graph-provider.js'

/**
 * Input for {@link runGraphWhy}.
 */
export interface RunGraphWhyInput {
  /** Project-relative path, absolute path, or `workspace:path`. */
  readonly path: string
  /** Optional pre-opened graph provider. When provided, lifecycle is caller-owned. */
  readonly provider?: CodeGraphProvider
}

/**
 * Structured result of {@link runGraphWhy}: the code-graph explanation, unchanged.
 */
export type RunGraphWhyResult = ExplainGraphPathResult

/**
 * Explains why a path is excluded, classified or indexed by the code graph.
 *
 * @param ctx - SDK host context
 * @param input - Path and optional pre-opened provider
 * @returns The explanation produced by the code-graph `ExplainGraphPath` use case
 */
export async function runGraphWhy(
  ctx: SdkHostContext,
  input: RunGraphWhyInput,
): Promise<RunGraphWhyResult> {
  if (input.provider !== undefined) {
    return input.provider.explainPath(input.path)
  }

  return withOpenGraphProvider(ctx, (provider) => provider.explainPath(input.path))
}
