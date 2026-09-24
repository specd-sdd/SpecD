# Verification: Guide Composition

## Requirements

### Requirement: GuideEngine Facade Interface

#### Scenario: Facade exposes all application capabilities

- **GIVEN** an instance of `GuideEngine` returned by `createGuideEngine()`
- **WHEN** inspecting the instance
- **THEN** it provides callable methods: `listGuides`, `getGuide`, `getGuideOutline`, `getGuideSection`, `sliceGuideLines`, `formatWithLineNumbers`, and `searchGuides`
- **AND** each method delegates to its underlying application query

#### Scenario: Facade methods propagate typed domain errors unchanged

- **GIVEN** `engine.getGuide("nonexistent")`
- **WHEN** the call rejects
- **THEN** the caught error is an instance of `GuideTopicNotFoundError`
- **AND** its `code` is `'UNKNOWN_GUIDE_TOPIC'`

### Requirement: createGuideEngine Factory Function

#### Scenario: Default factory instantiation wires pre-bundled catalog and minisearch adapter

- **GIVEN** `createGuideEngine()` called with no arguments
- **WHEN** `engine.listGuides()` is executed
- **THEN** it returns all pre-bundled guides from `PrebundledGuideCatalogAdapter`
- **AND** `engine.searchGuides("workflow")` executes search using `MiniSearchGuideEngineAdapter`
- **AND** instantiation completes in under 10 milliseconds

#### Scenario: Factory accepts custom catalog adapter override for testing

- **GIVEN** a custom test catalog port implementation with 1 mock guide
- **WHEN** `createGuideEngine({ catalogPort: mockCatalog })` is instantiated
- **THEN** `engine.listGuides()` returns the mock guide
- **AND** does not load the default pre-bundled catalog

### Requirement: Public API Export Surface

#### Scenario: index.ts and public.ts export expected public symbols

- **GIVEN** consuming code `import * as Guide from '@specd/guide'`
- **WHEN** checking exported symbols
- **THEN** `Guide.createGuideEngine` is a function
- **AND** `Guide.GuideTopicNotFoundError` and `Guide.GuideSectionNotFoundError` are error constructors
- **AND** TypeScript types `GuideTopic`, `GuideSection`, `GuideOutline`, `GuideSearchHit`, `GuideSummary`, `GuideSearchOptions`, `GuideEngine` are exported and usable
