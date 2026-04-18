import { RemovePlugin } from '../../application/use-cases/remove-plugin.js'
import { type ConfigWriter } from '../../application/ports/config-writer.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/** Filesystem adapter options for `createRemovePlugin(options)`. */
export interface FsRemovePluginOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Constructs a `RemovePlugin` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance.
 */
export function createRemovePlugin(): RemovePlugin
/**
 * Constructs a `RemovePlugin` use case with an explicit config writer.
 *
 * @param options - Pre-built config writer.
 * @returns The pre-wired use case instance.
 */
export function createRemovePlugin(options: FsRemovePluginOptions): RemovePlugin
/**
 * Constructs a `RemovePlugin` instance.
 *
 * @param options - Optional explicit adapter options.
 * @returns The pre-wired use case instance.
 */
export function createRemovePlugin(options?: FsRemovePluginOptions): RemovePlugin {
  const writer = options?.configWriter ?? new FsConfigWriter()
  return new RemovePlugin(writer)
}
