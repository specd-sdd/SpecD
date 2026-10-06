// Domain models & types
export type {
  GuideTopic,
  GuideSection,
  GuideSummary,
  GuideOutline,
  GuideSearchHit,
  GuideCollection,
  GuideSourcePath,
} from './domain/models/index.js'

// Topic identity helpers
export {
  isValidCollectionId,
  normalizeTopicRef,
  qualifyTopic,
  splitQualifiedTopic,
  isGeneratedTopic,
} from './domain/topic-identity.js'
export type { ParsedTopicRef } from './domain/topic-identity.js'

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

export type {
  GuidePagination,
  GuideListScope,
  GuideListingResult,
  GuideListedTopic,
  GuidePaginationInfo,
  GuideCollectionExtent,
  GuideWithheldTopics,
  GuideTopicScope,
} from './application/queries/list-guides-query.js'

// Application utilities
export { sliceGuideLines, formatWithLineNumbers } from './application/queries/index.js'

// Composition root & facade
export { createGuideEngine } from './composition/guide-engine.js'

export type {
  GuideEngine,
  GuideEngineOptions,
  ListGuidesOptions,
} from './composition/guide-engine.js'
