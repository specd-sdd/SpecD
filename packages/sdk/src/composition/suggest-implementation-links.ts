import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import {
  createCompositionResolver,
  createGetPersistedSpecImplementation,
  createGetSpecMetadata,
  createUpdatePersistedSpecImplementation,
  type CompositionResolutionOptions,
  type CompositionResolver,
  type SpecdConfig,
} from '@specd/core'
import { createCodeGraphProvider } from '@specd/code-graph'
import { FsImplementationSuggestionCache } from '../infrastructure/fs/fs-implementation-suggestion-cache.js'
import {
  createSuggestImplementationLinks as createSuggestImplementationLinksFromDeps,
  type SuggestImplementationLinks,
  type SuggestImplementationLinksDeps,
  type SuggestionFileObserver,
} from '../application/use-cases/suggest-implementation-links.js'

const fsSuggestionFileObserver: SuggestionFileObserver = {
  async exists(filePath) {
    try {
      await access(filePath, constants.F_OK)
      return true
    } catch {
      return false
    }
  },
  readText(filePath) {
    return readFile(filePath, 'utf8')
  },
}

/**
 * Resolves concrete implementation-suggestion dependencies at the SDK composition edge.
 * @param resolver - Composition resolver for the active project
 * @returns Fully wired orchestration dependencies
 */
export function resolveSuggestImplementationLinksDeps(
  resolver: CompositionResolver,
): SuggestImplementationLinksDeps {
  const specRepositories = resolver.getSpecRepositories()
  const projectDir = resolver.config.projectRoot
  const codeGraphProvider = createCodeGraphProvider(resolver.config)
  return {
    specRepositories,
    getPersistedImplementation: createGetPersistedSpecImplementation(resolver.config),
    updatePersistedImplementation: createUpdatePersistedSpecImplementation(resolver.config),
    getSpecMetadata: createGetSpecMetadata(resolver.config),
    codeGraphProvider,
    cache: new FsImplementationSuggestionCache({
      projectDir,
      configPath: resolver.config.configPath,
      specRepositories,
      codeGraphProvider,
    }),
    fileObserver: fsSuggestionFileObserver,
    projectDir,
    workspaces: resolver.config.workspaces,
  }
}

/**
 * Creates the use case from explicit dependencies.
 * @param deps - Explicit dependencies
 * @returns The wired use case
 */
export function createSuggestImplementationLinks(
  deps: SuggestImplementationLinksDeps,
): SuggestImplementationLinks
/**
 * Creates the use case from configuration.
 * @param config - Project configuration
 * @param options - Resolution overrides
 * @returns The wired use case
 */
export function createSuggestImplementationLinks(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestImplementationLinks
/**
 * Creates the use case at the composition boundary.
 * @param depsOrConfig - Dependencies or configuration
 * @param options - Resolution overrides
 * @returns The wired use case
 */
export function createSuggestImplementationLinks(
  depsOrConfig: SuggestImplementationLinksDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestImplementationLinks {
  if (isSuggestImplementationLinksDeps(depsOrConfig))
    return createSuggestImplementationLinksFromDeps(depsOrConfig)
  const resolver = createCompositionResolver(depsOrConfig, options)
  return createSuggestImplementationLinksFromDeps(resolveSuggestImplementationLinksDeps(resolver))
}

/**
 * Checks for explicit dependencies.
 * @param value - Argument to inspect
 * @returns Whether dependencies were supplied
 */
function isSuggestImplementationLinksDeps(
  value: SuggestImplementationLinksDeps | SpecdConfig,
): value is SuggestImplementationLinksDeps {
  return (
    'specRepositories' in value &&
    'getPersistedImplementation' in value &&
    'updatePersistedImplementation' in value
  )
}
