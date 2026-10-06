import { assembleGuideEngine, type GuideEngine, type GuideEngineOptions } from './guide-engine.js'
import { MiniSearchGuideEngineAdapter } from '../infrastructure/adapters/minisearch-guide-engine-adapter.js'
import { PrebundledGuideCatalogAdapter } from '../infrastructure/adapters/prebundled-guide-catalog-adapter.js'

/**
 * Factory function creating a GuideEngine that serves the SDK collection catalog.
 *
 * This factory lives behind the `@specd/guide/sdk` subpath so that importing the main
 * `@specd/guide` entry never loads the generated SDK catalog.
 *
 * @param options - Optional port overrides for custom testing or catalog sources.
 * @returns Configured GuideEngine facade bound to the SDK catalog.
 */
export function createGuideSdkEngine(options?: GuideEngineOptions): GuideEngine {
  const catalogPort =
    options?.catalogPort ?? new PrebundledGuideCatalogAdapter('../generated/guides-sdk.json')
  const searchPort = options?.searchPort ?? new MiniSearchGuideEngineAdapter(catalogPort)
  return assembleGuideEngine(catalogPort, searchPort)
}

export type { GuideEngine, GuideEngineOptions }
