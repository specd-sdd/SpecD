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
import { createCodeGraphProvider, createBuiltinAdapterRegistry } from '@specd/code-graph'
import { FsImplementationSuggestionCache } from '../infrastructure/fs/fs-implementation-suggestion-cache.js'
import { createSuggestImplementationLinks } from './suggest-implementation-links.js'
import { SuggestSpecs, type SuggestSpecsDeps } from '../application/use-cases/suggest-specs.js'
import { type SuggestionFileObserver } from '../application/use-cases/suggest-implementation-links.js'

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
 * Resolves concrete suggest-specs dependencies at the SDK composition edge.
 *
 * @param resolver - Composition resolver for the active project
 * @returns Fully wired orchestration dependencies
 */
export function resolveSuggestSpecsDeps(resolver: CompositionResolver): SuggestSpecsDeps {
  const specRepositories = resolver.getSpecRepositories()
  const projectDir = resolver.config.projectRoot
  const adapterRegistry = createBuiltinAdapterRegistry(resolver.config)
  const codeGraphProvider = createCodeGraphProvider(resolver.config)
  const implementationCache = new FsImplementationSuggestionCache({
    projectDir,
    configPath: resolver.config.configPath,
    specRepositories,
    codeGraphProvider,
  })
  return {
    specRepositories,
    codeGraphProvider,
    implementationCache,
    suggestImplementationLinks: createSuggestImplementationLinks({
      specRepositories,
      getPersistedImplementation: createGetPersistedSpecImplementation(resolver.config),
      updatePersistedImplementation: createUpdatePersistedSpecImplementation(resolver.config),
      getSpecMetadata: createGetSpecMetadata(resolver.config),
      codeGraphProvider,
      adapterRegistry,
      cache: implementationCache,
      fileObserver: fsSuggestionFileObserver,
      projectDir,
      workspaces: resolver.config.workspaces,
    }),
    adapterRegistry,
    fileObserver: fsSuggestionFileObserver,
    projectDir,
  }
}

/**
 * Creates the SuggestSpecs use case from explicit dependencies.
 *
 * @param deps - Explicit dependencies
 * @returns The wired use case
 */
export function createSuggestSpecs(deps: SuggestSpecsDeps): SuggestSpecs
/**
 * Creates the SuggestSpecs use case from config.
 *
 * @param config - Project configuration
 * @param options - Resolution overrides
 * @returns The wired use case
 */
export function createSuggestSpecs(
  config: SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestSpecs
/**
 * Creates the SuggestSpecs use case from a deps object or project config.
 *
 * @param depsOrConfig - Injected deps object or project config
 * @param options - Resolution overrides
 * @returns The wired use case
 */
export function createSuggestSpecs(
  depsOrConfig: SuggestSpecsDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestSpecs {
  if (isSuggestSpecsDeps(depsOrConfig)) {
    return new SuggestSpecs(depsOrConfig)
  }
  const resolver = createCompositionResolver(depsOrConfig, options)
  return new SuggestSpecs(resolveSuggestSpecsDeps(resolver))
}

/**
 * Type-guard checking whether an argument satisfies SuggestSpecsDeps.
 *
 * @param target - Value to test against the SuggestSpecsDeps shape
 * @returns True when the value satisfies SuggestSpecsDeps
 */
function isSuggestSpecsDeps(target: unknown): target is SuggestSpecsDeps {
  return (
    typeof target === 'object' &&
    target !== null &&
    'adapterRegistry' in target &&
    'fileObserver' in target
  )
}

/**
 * Convenience entry point constructing a ready-to-execute SuggestSpecs use case from config or resolver.
 *
 * @param target - Config or resolver.
 * @returns Initialized SuggestSpecs use case.
 */
export function openSuggestSpecs(
  target?: SuggestSpecsDeps | SpecdConfig | CompositionResolver,
): SuggestSpecs {
  if (!target) {
    const resolver = createCompositionResolver({ projectRoot: process.cwd() } as SpecdConfig)
    return new SuggestSpecs(resolveSuggestSpecsDeps(resolver))
  }

  if (isSuggestSpecsDeps(target)) {
    return new SuggestSpecs(target)
  }

  if (typeof (target as CompositionResolver).getSpecRepositories === 'function') {
    return new SuggestSpecs(resolveSuggestSpecsDeps(target as CompositionResolver))
  }

  const resolver = createCompositionResolver(target as SpecdConfig)
  return new SuggestSpecs(resolveSuggestSpecsDeps(resolver))
}
