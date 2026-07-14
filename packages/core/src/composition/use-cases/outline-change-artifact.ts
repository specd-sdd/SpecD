import { type ArtifactParserRegistry } from '../../application/ports/artifact-parser.js'
import { type ChangeRepository } from '../../application/ports/change-repository.js'
import { OutlineChangeArtifact } from '../../application/use-cases/outline-change-artifact.js'
import { type SpecdConfig } from '../../application/specd-config.js'
import {
  createCompositionResolver,
  type CompositionResolver,
  type CompositionResolutionOptions,
} from '../composition-resolver.js'
import { normalizeCompositionFactoryArgs, type FactoryInput } from '../normalize-factory-args.js'

/**
 * Explicit dependencies for {@link createOutlineChangeArtifact}.
 */
export interface OutlineChangeArtifactDeps {
  /** Change repository used by the use case. */
  readonly changes: ChangeRepository
  /** Artifact parser registry used to build the outline. */
  readonly parsers: ArtifactParserRegistry
}

/**
 * Resolves {@link OutlineChangeArtifactDeps} from the shared composition resolver.
 *
 * @param resolver - Shared composition resolver for one composition session
 * @returns The resolved dependencies for `OutlineChangeArtifact`
 */
export function resolveOutlineChangeArtifactDeps(
  resolver: CompositionResolver,
): OutlineChangeArtifactDeps {
  return {
    changes: resolver.getChangeRepository(),
    parsers: resolver.getArtifactParserRegistry(),
  }
}

/**
 * Constructs an `OutlineChangeArtifact` use case from explicit dependencies.
 *
 * @param deps - Explicit use-case dependencies
 * @returns The pre-wired use case instance
 */
export function createOutlineChangeArtifact(deps: OutlineChangeArtifactDeps): OutlineChangeArtifact
/**
 * Constructs an `OutlineChangeArtifact` use case from project configuration.
 *
 * @param config - The fully-resolved project configuration
 * @param options - Optional additive composition registrations
 * @returns The pre-wired use case instance
 */
export function createOutlineChangeArtifact(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): OutlineChangeArtifact
/**
 * Constructs an `OutlineChangeArtifact` instance from explicit deps or config bootstrap.
 *
 * @param depsOrConfig - Explicit deps or resolved project configuration
 * @param options - Optional additive composition registrations for config-based bootstrap
 * @returns The pre-wired use case instance
 */
export function createOutlineChangeArtifact(
  depsOrConfig: OutlineChangeArtifactDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): OutlineChangeArtifact {
  const normalized = normalizeCompositionFactoryArgs(
    'createOutlineChangeArtifact',
    depsOrConfig,
    options,
    isOutlineChangeArtifactDeps,
  )
  return createOutlineChangeArtifactFromNormalized(normalized)
}

/**
 * Applies normalized `OutlineChangeArtifact` factory inputs.
 *
 * @param input - Normalized public factory input
 * @returns The pre-wired use case instance
 */
function createOutlineChangeArtifactFromNormalized(
  input: FactoryInput<OutlineChangeArtifactDeps, CompositionResolutionOptions>,
): OutlineChangeArtifact {
  if (input.kind === 'deps') {
    const { changes, parsers } = input.deps
    return new OutlineChangeArtifact(changes, parsers)
  }

  const resolver = createCompositionResolver(input.config, input.options)
  return createOutlineChangeArtifact(resolveOutlineChangeArtifactDeps(resolver))
}

/**
 * Type guard for explicit `OutlineChangeArtifactDeps`.
 *
 * @param value - Candidate public factory input
 * @returns `true` when the input is explicit deps
 */
function isOutlineChangeArtifactDeps(
  value: OutlineChangeArtifactDeps | SpecdConfig,
): value is OutlineChangeArtifactDeps {
  return 'changes' in value && 'parsers' in value
}
