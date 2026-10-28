import {
  createSdkContext,
  openSpecdHost,
  type OpenSpecdHostInput,
  type OpenSpecdHostResult,
  type SdkHostContext,
  type SpecdConfig,
} from '@specd/sdk'
import { registerCliCleanup } from './cli-cleanup.js'

/** Input for opening a host from an already-resolved config. */
export interface OpenCliHostFromConfigInput {
  /** Resolved project configuration. */
  readonly config: SpecdConfig
  /** SDK composition options (the CLI kernel options are passed by the caller). */
  readonly options?: NonNullable<OpenSpecdHostInput['options']>
}

/**
 * Opens an SDK host and registers its disposal in the CLI cleanup registry.
 *
 * Wraps both SDK bootstrap forms: config discovery or forced file (`openSpecdHost`) and
 * an already-resolved config (`createSdkContext`). Callers pass the CLI kernel options.
 *
 * @param input - Host bootstrap input
 * @returns The opened host
 */
export function openCliHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult>
export function openCliHost(input: OpenCliHostFromConfigInput): Promise<SdkHostContext>
/**
 * Implementation of {@link openCliHost}: opens the host and registers its disposal.
 *
 * @param input - Either an `OpenSpecdHostInput` or a resolved-config input
 * @returns The opened host
 */
export async function openCliHost(
  input?: OpenSpecdHostInput | OpenCliHostFromConfigInput,
): Promise<OpenSpecdHostResult | SdkHostContext> {
  const host =
    input !== undefined && 'config' in input
      ? await createSdkContext(input.config, input.options)
      : await openSpecdHost(input)
  registerCliCleanup(() => host.dispose())
  return host
}
