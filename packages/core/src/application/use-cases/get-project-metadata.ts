import { join } from 'node:path'
import {
  projectMetadataSchema,
  type ProjectMetadata,
} from '../../domain/services/project-metadata.js'
import { type SpecdConfig } from '../specd-config.js'
import { type FileReader } from '../ports/file-reader.js'

/** Result returned by the {@link GetProjectMetadata} use case. */
export interface GetProjectMetadataResult {
  /** The full project metadata, or null if it does not exist. */
  readonly metadata: ProjectMetadata | null
}

/**
 * Use case that retrieves the persisted project-level metadata.
 */
export class GetProjectMetadata {
  /**
   * Creates a new `GetProjectMetadata` use case.
   *
   * @param _config - Project configuration
   * @param _files - File reader for config path resolution
   */
  constructor(
    private readonly _config: SpecdConfig,
    private readonly _files: FileReader,
  ) {}

  /**
   * Executes the use case.
   *
   * @returns The parsed project metadata or null
   */
  async execute(): Promise<GetProjectMetadataResult> {
    const metadataPath = join(this._config.configPath, 'project-metadata.json')
    const content = await this._files.read(metadataPath)

    if (content === null) {
      return { metadata: null }
    }

    try {
      const metadata = projectMetadataSchema.parse(JSON.parse(content))
      return { metadata }
    } catch {
      return { metadata: null }
    }
  }
}
