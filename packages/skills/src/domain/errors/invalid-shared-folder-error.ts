import { SpecdSkillsError } from './specd-skills-error.js'

/**
 * Thrown when a shared-folder path escapes the project root.
 */
export class InvalidSharedFolderError extends SpecdSkillsError {
  /**
   * @inheritdoc
   */
  get code(): string {
    return 'INVALID_SHARED_FOLDER'
  }

  /**
   * Creates a new `InvalidSharedFolderError`.
   *
   * @param sharedFolder - Invalid relative shared-folder value.
   */
  constructor(sharedFolder: string) {
    super(`Shared folder must stay inside the project root: ${sharedFolder}`)
  }
}
