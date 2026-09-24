// Domain models & types
export type {
  GuideTopic,
  GuideSection,
  GuideSummary,
  GuideOutline,
  GuideSearchHit,
} from './domain/models/index.js'

// Domain errors
export {
  SpecdGuideError,
  GuideTopicNotFoundError,
  GuideSectionNotFoundError,
  GuideSectionAmbiguousError,
} from './domain/errors/index.js'

// Application ports & query types
export type {
  GuideCatalogPort,
  GuideSearchPort,
  GuideSearchOptions,
} from './application/ports/index.js'

// Application utilities
export { sliceGuideLines, formatWithLineNumbers } from './application/queries/index.js'

// Composition root & facade
export { createGuideEngine } from './composition/guide-engine.js'

export type { GuideEngine, GuideEngineOptions } from './composition/guide-engine.js'
