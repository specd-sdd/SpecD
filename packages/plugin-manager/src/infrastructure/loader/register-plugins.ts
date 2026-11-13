import type { SpecdConfig } from '@specd/core'
import type { KernelBuilder } from '@specd/core/extensions'
import {
  registerPlugins as registerLoadedPlugins,
  type PluginRegistration,
} from '../../application/use-cases/register-plugins.js'
import type { ContributionKindHandler } from '../../domain/types/contribution-kind-handler.js'
import type { PluginLoader } from '../../application/ports/plugin-loader.js'
import { createPluginLoader } from './plugin-loader.js'

/**
 * Public registration entry. Supplies the filesystem loader when the caller does not.
 */
export interface RegisterPluginsInput {
  /** Extra kind handlers. The built-in `agents` handler is always included. */
  readonly handlers?: readonly ContributionKindHandler[]
  /** Loader override used by tests and hosts. */
  readonly loader?: PluginLoader
}

/**
 * Validates, initializes, and activates configured plugins.
 *
 * @param builder - Kernel builder that receives the `specd-plugins` disposer
 * @param config - Loaded project configuration
 * @param options - Optional handlers and loader
 * @returns The registration handle
 * @throws {DuplicateHandlerKindError} As a rejection when two handlers share a kind
 */
export async function registerPlugins(
  builder: KernelBuilder,
  config: SpecdConfig,
  options: RegisterPluginsInput = {},
): Promise<PluginRegistration> {
  const handlers = options.handlers ?? []
  const resolved = {
    handlers,
    loader: options.loader ?? createPluginLoader({ config, handlers }),
  }
  return registerLoadedPlugins(builder, config, resolved)
}
