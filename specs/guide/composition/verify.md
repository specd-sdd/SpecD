# Verification: Guide Composition

## Requirements

### Requirement: GuideEngine Facade Interface

#### Scenario: Facade preserves the structured listing contract

- **GIVEN** an engine serving a catalog with multiple collections
- **WHEN** `listGuides({ scope, pagination })` is invoked
- **THEN** it MUST return a `GuideListingResult` with `topics`, `pagination`, and `collections`
- **AND** it MUST NOT flatten the result into an array

#### Scenario: Facade exposes collection descriptors

- **GIVEN** an engine serving a catalog with known collections
- **WHEN** `getCollections()` is invoked
- **THEN** it MUST return the catalog's `GuideCollection` descriptors

#### Scenario: Facade methods propagate typed domain errors unchanged

- **GIVEN** `engine.getGuide("nonexistent")`
- **WHEN** the call rejects
- **THEN** the caught error MUST be an instance of `GuideTopicNotFoundError`
- **AND** its `code` MUST be `'UNKNOWN_GUIDE_TOPIC'`

### Requirement: createGuideEngine Factory Function

#### Scenario: Default factory assembles the full engine

- **WHEN** `createGuideEngine()` is called with no options
- **THEN** all application queries MUST be wired behind the returned `GuideEngine` interface
- **AND** the default catalog MUST be the user guide collection

#### Scenario: Custom catalog port overrides the default

- **GIVEN** a stub catalog port
- **WHEN** `createGuideEngine({ catalogPort: stub })` is called
- **THEN** every query MUST use the injected port
- **AND** the default catalog MUST NOT be used

#### Scenario: SDK collection factory serves only the SDK collection

- **GIVEN** the SDK collection factory
- **WHEN** its engine is asked for a topic belonging to the user guide collection
- **THEN** the request MUST fail as not found

#### Scenario: SDK collection factory wires the same query set

- **WHEN** the SDK collection engine is inspected
- **THEN** it MUST expose the same `GuideEngine` operations as the default factory

#### Scenario: SDK collection is reachable only through its dedicated subpath

- **GIVEN** the package's export map
- **WHEN** the main entry is imported
- **THEN** the SDK collection factory and catalog MUST NOT be reachable from it
- **AND** they MUST be reachable from the dedicated subpath

### Requirement: Public API Export Surface

#### Scenario: Curated barrel exports the documented public surface

- **WHEN** the curated barrel is imported
- **THEN** it MUST export `createGuideEngine`, the `GuideEngine` interface, `GuideEngineOptions`, `GuideSearchOptions`, `ListGuidesOptions`, `GuideListingResult`, `GuideListScope`, `GuidePagination`, the documented domain types and errors, and the standalone utility functions
- **AND** it MUST NOT export driven port or infrastructure implementation symbols

#### Scenario: Ambiguity error is part of the public surface

- **WHEN** the curated barrel is imported
- **THEN** `GuideSectionAmbiguousError` MUST be exported
- **AND** a consumer MUST be able to catch it by importing from the package

#### Scenario: Internal barrel is not presented as the curated surface

- **WHEN** the two barrels are compared
- **THEN** the internal barrel MAY expose application and infrastructure symbols only through `./internal`
- **AND** it MUST NOT be the target of the main export

#### Scenario: SDK collection symbols are absent from both root barrels

- **WHEN** either root barrel is imported
- **THEN** the SDK collection's generated catalog MUST NOT be loaded
- **AND** the SDK collection factory MUST NOT be exported
