import { createTwoFilesPatch } from 'diff'
import {
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
   */
  generate(input: DiffGeneratorInput): string {
    return createTwoFilesPatch(
      `a/${input.filename} (base)`,
      `b/${input.filename} (merged)`,
      input.base,
      input.merged,
      undefined,
      undefined,
      { context: input.contextLines ?? 3 },
    )
  }
}
