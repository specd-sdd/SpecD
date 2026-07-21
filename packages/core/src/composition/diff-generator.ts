import { type DiffGenerator } from '../application/ports/diff-generator.js'
import { DiffDiffGenerator } from '../infrastructure/diff/diff-generator.js'

/**
 * Creates the default diff generator used by core composition.
 *
 * @returns The default diff generator implementation
 */
export function createDefaultDiffGenerator(): DiffGenerator {
  return new DiffDiffGenerator()
}
