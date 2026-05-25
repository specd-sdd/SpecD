import { ChangeNotFoundError } from '../errors/change-not-found-error.js'
import { type ChangeRepository } from '../ports/change-repository.js'
import { type ArtifactParserRegistry } from '../ports/artifact-parser.js'
import {
  outlineArtifactContent,
  type OutlineArtifactContentResult,
} from './outline-artifact-content.js'

/** Input for {@link OutlineChangeArtifact}. */
export interface OutlineChangeArtifactInput {
  readonly name: string
  readonly filename: string
  /** When set, outlines this draft instead of reading from disk. */
  readonly content?: string
  readonly full?: boolean
  readonly hints?: boolean
}

/**
 * Outlines a single change-directory artifact (saved or draft).
 */
export class OutlineChangeArtifact {
  /**
   * Creates the use case with change storage and parsers.
   *
   * @param changes - Change repository
   * @param parsers - Artifact parser registry
   */
  constructor(
    private readonly changes: ChangeRepository,
    private readonly parsers: ArtifactParserRegistry,
  ) {}

  /**
   * Outlines a change artifact from disk or draft content.
   *
   * @param input - Change name, filename, optional draft content
   * @returns Outline for the artifact file
   * @throws {ChangeNotFoundError} When the change or artifact file is missing
   */
  async execute(input: OutlineChangeArtifactInput): Promise<OutlineArtifactContentResult> {
    const change = await this.changes.get(input.name)
    if (change === null) {
      throw new ChangeNotFoundError(input.name)
    }

    let content = input.content
    if (content === undefined) {
      const artifact = await this.changes.artifact(change, input.filename)
      if (artifact === null) {
        throw new ChangeNotFoundError(
          `artifact '${input.filename}' not found for change '${input.name}'`,
        )
      }
      content = artifact.content
    }

    return outlineArtifactContent(content, input.filename, this.parsers, {
      ...(input.full === true ? { full: true } : {}),
      ...(input.hints === true ? { hints: true } : {}),
    })
  }
}
