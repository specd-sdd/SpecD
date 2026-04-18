import { ListPlugins } from '../../application/use-cases/list-plugins.js'
import { type ConfigWriter } from '../../application/ports/config-writer.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/** Filesystem adapter options for `createListPlugins(options)`. */
export interface FsListPluginsOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Constructs a `ListPlugins` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance.
 */
export function createListPlugins(): ListPlugins
/**
 * Constructs a `ListPlugins` use case with an explicit config writer.
 *
 * @param options - Pre-built config writer.
 * @returns The pre-wired use case instance.
 */
export function createListPlugins(options: FsListPluginsOptions): ListPlugins
/**
 * Constructs a `ListPlugins` instance.
 *
 * @param options - Optional explicit adapter options.
 * @returns The pre-wired use case instance.
 */
export function createListPlugins(options?: FsListPluginsOptions): ListPlugins {
  const writer = options?.configWriter ?? new FsConfigWriter()
  return new ListPlugins(writer)
}
