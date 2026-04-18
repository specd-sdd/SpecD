import { AddPlugin } from '../../application/use-cases/add-plugin.js'
import { type ConfigWriter } from '../../application/ports/config-writer.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/** Filesystem adapter options for `createAddPlugin(options)`. */
export interface FsAddPluginOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Constructs an `AddPlugin` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance.
 */
export function createAddPlugin(): AddPlugin
/**
 * Constructs an `AddPlugin` use case with an explicit config writer.
 *
 * @param options - Pre-built config writer.
 * @returns The pre-wired use case instance.
 */
export function createAddPlugin(options: FsAddPluginOptions): AddPlugin
/**
 * Constructs an `AddPlugin` instance.
 *
 * @param options - Optional explicit adapter options.
 * @returns The pre-wired use case instance.
 */
export function createAddPlugin(options?: FsAddPluginOptions): AddPlugin {
  const writer = options?.configWriter ?? new FsConfigWriter()
  return new AddPlugin(writer)
}
