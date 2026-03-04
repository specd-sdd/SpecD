import { RecordSkillInstall } from '../../application/use-cases/record-skill-install.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/**
 * Constructs a `RecordSkillInstall` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance
 */
export function createRecordSkillInstall(): RecordSkillInstall {
  return new RecordSkillInstall(new FsConfigWriter())
}
