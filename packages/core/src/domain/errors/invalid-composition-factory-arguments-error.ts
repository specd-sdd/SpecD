import { SpecdError } from './specd-error.js'

/**
 * Thrown when a public composition factory receives an invalid argument shape.
 */
export class InvalidCompositionFactoryArgumentsError extends SpecdError {
  /**
   * Creates a new invalid-composition-factory-arguments error.
   *
   * @param useCaseName - The public factory or use-case entry being invoked
   * @param details - Optional extra diagnostic detail
   */
  constructor(useCaseName: string, details?: string) {
    super(
      details === undefined
        ? `Invalid arguments for composition factory '${useCaseName}'`
        : `Invalid arguments for composition factory '${useCaseName}': ${details}`,
    )
  }

  /**
   * Machine-readable error code.
   *
   * @returns The stable error code
   */
  override get code(): string {
    return 'INVALID_COMPOSITION_FACTORY_ARGUMENTS'
  }
}
