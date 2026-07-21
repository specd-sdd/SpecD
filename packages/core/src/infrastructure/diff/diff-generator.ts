import { createTwoFilesPatch } from 'diff'
import {
  DiffGenerationError,
  type DiffGenerator,
  type DiffGeneratorInput,
} from '../../application/ports/diff-generator.js'

/**
 * Diff-library-backed implementation of the `DiffGenerator` port.
 */
export class DiffDiffGenerator implements DiffGenerator {
  /**
   * Produces a plain unified diff for one preview file entry.
   *
   * @param input - The preview file content to diff
   * @returns A unified diff string
   * @throws {DiffGenerationError} When the underlying diff library fails or returns unusable output
   */
  generate(input: DiffGeneratorInput): string {
    try {
      const diff = createTwoFilesPatch(
        `a/${input.filename} (base)`,
        `b/${input.filename} (merged)`,
        input.base,
        input.merged,
        undefined,
        undefined,
        { context: input.contextLines ?? 3 },
      )

      if (typeof diff !== 'string' || diff.trim().length === 0) {
        throw new DiffGenerationError(
          `Diff generator produced unusable output for '${input.filename}'`,
        )
      }

      return diff
    } catch (error) {
      if (error instanceof DiffGenerationError) {
        throw error
      }
      throw new DiffGenerationError(`Failed to generate diff for '${input.filename}'`, {
        cause: error,
      })
    }
  }
}
