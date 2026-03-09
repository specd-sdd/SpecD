import { RecordSkillInstall } from '../../application/use-cases/record-skill-install.js'
import { type ConfigWriter } from '../../application/ports/config-writer.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/** Filesystem adapter options for `createRecordSkillInstall(options)`. */
export interface FsRecordSkillInstallOptions {
  /** Pre-built config writer instance. */
  readonly configWriter: ConfigWriter
}

/**
 * Constructs a `RecordSkillInstall` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance
 */
export function createRecordSkillInstall(): RecordSkillInstall
/**
 * Constructs a `RecordSkillInstall` use case with an explicit config writer.
 *
 * @param options - Pre-built config writer
 * @returns The pre-wired use case instance
 */
export function createRecordSkillInstall(options: FsRecordSkillInstallOptions): RecordSkillInstall
/**
 * Constructs a `RecordSkillInstall` instance.
 *
 * @param options - Optional explicit adapter options
 * @returns The pre-wired use case instance
 */
export function createRecordSkillInstall(
  options?: FsRecordSkillInstallOptions,
): RecordSkillInstall {
  const writer = options?.configWriter ?? new FsConfigWriter()
  return new RecordSkillInstall(writer)
}
