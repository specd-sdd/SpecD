import { InitProject } from '../../application/use-cases/init-project.js'
import { FsConfigWriter } from '../../infrastructure/fs/config-writer.js'

/**
 * Constructs an `InitProject` use case wired with the filesystem config writer.
 *
 * @returns The pre-wired use case instance
 */
export function createInitProject(): InitProject {
  return new InitProject(new FsConfigWriter())
}
