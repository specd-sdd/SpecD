import {
  createCompositionResolver,
  createCreateChange,
  createGetPersistedSpecDeps,
  createUpdatePersistedSpecDeps,
  createValidateSpecs,
  type CompositionResolutionOptions,
  type CompositionResolver,
  type SpecdConfig,
} from '@specd/core'
import { createCodeGraphProvider } from '@specd/code-graph'
import { FsImplementationSuggestionCache } from '../infrastructure/fs/fs-implementation-suggestion-cache.js'
import { FsSpecDepsSuggestionCache } from '../infrastructure/fs/fs-spec-deps-suggestion-cache.js'
import {
  createSuggestSpecDependencies as createSuggestSpecDependenciesFromDeps,
  type SuggestSpecDependencies,
  type SuggestSpecDependenciesDeps,
} from '../application/use-cases/suggest-spec-dependencies.js'
import {
  createSuggestImplementationLinks,
  resolveSuggestImplementationLinksDeps,
} from './suggest-implementation-links.js'

/**
 * Resolves concrete dependency-suggestion dependencies at the SDK composition edge.
 * @param resolver - Composition resolver for the active project
 * @returns Fully wired orchestration dependencies
 */
export function resolveSuggestSpecDependenciesDeps(
  resolver: CompositionResolver,
): SuggestSpecDependenciesDeps {
  const specRepositories = resolver.getSpecRepositories()
  const projectDir = resolver.config.projectRoot
  const codeGraphProvider = createCodeGraphProvider(resolver.config)
  return {
    suggestImplementationLinks: createSuggestImplementationLinks(
      resolveSuggestImplementationLinksDeps(resolver),
    ),
    specRepositories,
    getPersistedDeps: createGetPersistedSpecDeps(resolver.config),
    updatePersistedDeps: createUpdatePersistedSpecDeps(resolver.config),
    validateSpecs: createValidateSpecs(resolver.config),
    createChange: createCreateChange(resolver.config),
    codeGraphProvider,
    cache: new FsImplementationSuggestionCache({
      projectDir,
      configPath: resolver.config.configPath,
      specRepositories,
      codeGraphProvider,
    }),
    specDepsCache: new FsSpecDepsSuggestionCache({
      projectDir,
      configPath: resolver.config.configPath,
      specRepositories,
      codeGraphProvider,
    }),
    projectDir,
  }
}

/**
 * Creates the use case from explicit dependencies.
 * @param deps - Explicit dependencies
 * @returns The wired use case
 */
export function createSuggestSpecDependencies(
  deps: SuggestSpecDependenciesDeps,
): SuggestSpecDependencies
/**
 * Creates the use case from configuration.
 * @param config - Project configuration
 * @param options - Resolution overrides
 * @returns The wired use case
 */
export function createSuggestSpecDependencies(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestSpecDependencies
/**
 * Creates the use case at the composition boundary.
 * @param depsOrConfig - Dependencies or configuration
 * @param options - Resolution overrides
 * @returns The wired use case
 */
export function createSuggestSpecDependencies(
  depsOrConfig: SuggestSpecDependenciesDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestSpecDependencies {
  if (isSuggestSpecDependenciesDeps(depsOrConfig))
    return createSuggestSpecDependenciesFromDeps(depsOrConfig)
  const resolver = createCompositionResolver(depsOrConfig, options)
  return createSuggestSpecDependenciesFromDeps(resolveSuggestSpecDependenciesDeps(resolver))
}

/**
 * Checks for explicit dependencies.
 * @param value - Argument to inspect
 * @returns Whether dependencies were supplied
 */
function isSuggestSpecDependenciesDeps(
  value: SuggestSpecDependenciesDeps | SpecdConfig,
): value is SuggestSpecDependenciesDeps {
  return (
    'suggestImplementationLinks' in value &&
    'getPersistedDeps' in value &&
    'updatePersistedDeps' in value
  )
}
