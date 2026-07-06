import { type SpecdConfig, isSpecdConfig } from '../application/specd-config.js'
import { InvalidCompositionFactoryArgumentsError } from '../domain/errors/invalid-composition-factory-arguments-error.js'

/**
 * Normalized public input for a composition factory.
 */
export type FactoryInput<Deps, Options> =
  | {
      readonly kind: 'deps'
      readonly deps: Deps
    }
  | {
      readonly kind: 'config'
      readonly config: SpecdConfig
      readonly options?: Options
    }

/**
 * Normalizes the two supported public composition-factory call shapes.
 *
 * @param useCaseName - The target factory name for diagnostics
 * @param first - Either explicit deps or a resolved project config
 * @param second - Optional composition options for config-based calls
 * @param isDeps - Type guard that recognizes the explicit deps form
 * @returns A discriminated normalized factory input
 * @throws {InvalidCompositionFactoryArgumentsError} When the public call shape is invalid
 */
export function normalizeCompositionFactoryArgs<Deps, Options>(
  useCaseName: string,
  first: Deps | SpecdConfig,
  second: Options | undefined,
  isDeps: (value: Deps | SpecdConfig) => value is Deps,
): FactoryInput<Deps, Options> {
  if (isDeps(first)) {
    if (second !== undefined) {
      throw new InvalidCompositionFactoryArgumentsError(
        useCaseName,
        'composition options are only valid for the SpecdConfig form',
      )
    }
    return { kind: 'deps', deps: first }
  }

  if (!isSpecdConfig(first)) {
    throw new InvalidCompositionFactoryArgumentsError(
      useCaseName,
      'expected either explicit deps or a resolved SpecdConfig',
    )
  }

  return second === undefined
    ? { kind: 'config', config: first }
    : { kind: 'config', config: first, options: second }
}
