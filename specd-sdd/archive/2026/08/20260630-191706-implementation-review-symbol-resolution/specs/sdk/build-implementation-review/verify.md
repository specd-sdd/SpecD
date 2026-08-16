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
