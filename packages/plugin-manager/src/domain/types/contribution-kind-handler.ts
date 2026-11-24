import type { KernelBuilder } from '@specd/core/extensions'
import type { ZodType } from 'zod'
import type { SpecdPlugin } from './specd-plugin.js'

/**
 * Context passed when a kind handler activates selected contributions.
 */
export interface ContributionActivationContext {
  /** Scoped plugin name. */
  readonly pluginName: string
  /** Contribution kind being activated. */
  readonly kind: string
  /** Loaded plugin instance. */
  readonly plugin: SpecdPlugin
  /** Validated per-plugin config. */
  readonly pluginConfig: Readonly<Record<string, unknown>>
  /** Selected contributions of this kind: id → parsed manifest block. */
  readonly contributions: ReadonlyMap<string, unknown>
  /** Kernel builder receiving the activation. */
  readonly builder: KernelBuilder
}

/**
 * Host-supplied handler for one contribution kind.
 */
export interface ContributionKindHandler {
  /** Kind key used in `contributes`. */
  readonly kind: string
  /** Schema for one kind's id → block map. */
  readonly blockSchema: ZodType
  /**
   * Optional extra validation of the runtime plugin object for this kind.
   *
   * @param plugin - Loaded plugin
   * @param pluginName - Scoped plugin name
   */
  validatePlugin?(plugin: SpecdPlugin, pluginName: string): void
  /**
   * Registers the selected contributions on the kernel builder.
   *
   * @param ctx - Activation context
   */
  activate?(ctx: ContributionActivationContext): void | Promise<void>
}
