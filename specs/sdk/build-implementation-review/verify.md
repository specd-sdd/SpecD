# Verification: SDK Build Implementation Review

## Requirements

### Requirement: Delivery-neutral orchestration

#### Scenario: SDK composes Core health and resolver

- **WHEN** `buildImplementationReview` is called
- **THEN** it obtains raw tracking from Core
- **AND** opens the provider through the SDK lifecycle helper
- **AND** delegates health and resolution to Code Graph
- **AND** performs no presenter formatting

### Requirement: Stable review projection

#### Scenario: Stored values are never rewritten

- **GIVEN** a stored alias resolves to a differently named canonical target
- **WHEN** review is built
- **THEN** the stored spec, file, and symbol values are unchanged
- **AND** canonical identity appears only in the resolution projection

#### Scenario: File-level link bypasses symbol resolution

- **WHEN** a confirmed link has no symbols
- **THEN** it remains in the result without a fabricated symbol outcome

### Requirement: One health snapshot and batch resolution

#### Scenario: Review avoids per-link provider work

- **GIVEN** a review contains multiple symbol links
- **WHEN** it is built
- **THEN** graph health is obtained once
- **AND** one batch resolver call is made under one provider lifecycle

### Requirement: Unparsed stored symbol text

#### Scenario: Qualified link text reaches the provider unchanged

- **GIVEN** a spec link stores `EditChange.execute` on a file
- **WHEN** implementation review builds the resolution batch
- **THEN** the provider request contains that exact string and the link file
- **AND** the SDK did not split the owner from the member

#### Scenario: Ambiguous provider result stays ambiguous

- **GIVEN** the provider returns ambiguous for a stored symbol
- **WHEN** the review projection is built
- **THEN** that link stays ambiguous

#### Scenario: Batch order matches stored links

- **GIVEN** three stored links in a fixed order
- **WHEN** the resolution batch returns
- **THEN** the review projection keeps that order
- **AND** the SDK made one batch call

#### Scenario: Link without a file is still unparsed

- **GIVEN** a stored symbol string has no file
- **WHEN** the request is built
- **THEN** the provider receives the original string
- **AND** the file field is empty
- **AND** the SDK does not choose a language

#### Scenario: Unresolved barrel label stays unresolved

- **GIVEN** the stored text is `@specd/sdk barrel` and the provider returns unresolved
- **WHEN** the review projection is built
- **THEN** that link stays unresolved
- **AND** the SDK does not turn it into a package lookup

### Requirement: Graph availability behavior

#### Scenario: Non-current graph yields unresolved diagnostics

- **GIVEN** the provider is readable but graph health is dirty or partial
- **WHEN** review is built
- **THEN** affected links remain unresolved rather than being classified as `missing`

#### Scenario: Provider failure propagates

- **GIVEN** provider generation validation prevents safe reads
- **WHEN** review is built
- **THEN** the typed infrastructure error propagates

### Requirement: Shared host behavior

#### Scenario: CLI consumers use identical projection

- **WHEN** list, review, and change status present the same change
- **THEN** they receive equivalent resolution outcomes from the SDK
- **AND** no host-specific matching fallback is invoked
