import { GetSkillsManifest } from '../../application/use-cases/get-skills-manifest.js'
import { type ConfigWriter } from '../../application/ports/config-writer.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/** Filesystem adapter options for `createGetSkillsManifest(options)`. */
export interface FsGetSkillsManifestOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Constructs a `GetSkillsManifest` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance
 */
export function createGetSkillsManifest(): GetSkillsManifest
/**
 * Constructs a `GetSkillsManifest` use case with an explicit config writer.
 *
 * @param options - Pre-built config writer
 * @returns The pre-wired use case instance
 */
export function createGetSkillsManifest(options: FsGetSkillsManifestOptions): GetSkillsManifest
/**
 * Constructs a `GetSkillsManifest` instance.
 *
 * @param options - Optional explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createGetSkillsManifest(options?: FsGetSkillsManifestOptions): GetSkillsManifest {
  const writer = options?.configWriter ?? new FsConfigWriter()
  return new GetSkillsManifest(writer)
}
