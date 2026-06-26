import { type ConfigWriter } from '../application/ports/config-writer.js'
import { FsConfigWriter } from '../infrastructure/fs/config-writer.js'

/** Options for injecting a pre-built {@link ConfigWriter}. */
export interface FsConfigWriterOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Creates a filesystem-backed `ConfigWriter` for mutating `specd.yaml`.
 *
 * @returns A `ConfigWriter` instance backed by the filesystem
 */
export function createConfigWriter(): ConfigWriter
/**
 * Creates a `ConfigWriter` from an explicit instance.
 *
 * @param options - Pre-built config writer
 * @returns The supplied `ConfigWriter`
 */
export function createConfigWriter(options: FsConfigWriterOptions): ConfigWriter
/**
 * Creates a `ConfigWriter` instance.
 *
 * @param options - Optional explicit adapter options
 * @returns A `ConfigWriter` for project configuration mutations
 */
export function createConfigWriter(options?: FsConfigWriterOptions): ConfigWriter {
  return options?.configWriter ?? new FsConfigWriter()
}
