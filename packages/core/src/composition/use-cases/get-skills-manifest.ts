import { GetSkillsManifest } from '../../application/use-cases/get-skills-manifest.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/**
 * Constructs a `GetSkillsManifest` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance
 */
export function createGetSkillsManifest(): GetSkillsManifest {
  return new GetSkillsManifest(new FsConfigWriter())
}
