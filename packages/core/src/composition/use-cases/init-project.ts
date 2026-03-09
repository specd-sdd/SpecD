import { InitProject } from '../../application/use-cases/init-project.js'
import { type ConfigWriter } from '../../application/ports/config-writer.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/** Filesystem adapter options for `createInitProject(options)`. */
export interface FsInitProjectOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Constructs an `InitProject` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance
 */
export function createInitProject(): InitProject
/**
 * Constructs an `InitProject` use case with an explicit config writer.
 *
 * @param options - Pre-built config writer
 * @returns The pre-wired use case instance
 */
export function createInitProject(options: FsInitProjectOptions): InitProject
/**
 * Constructs an `InitProject` instance.
 *
 * @param options - Optional explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createInitProject(options?: FsInitProjectOptions): InitProject {
  const writer = options?.configWriter ?? new FsConfigWriter()
  return new InitProject(writer)
}
