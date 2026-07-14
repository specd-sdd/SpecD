# Verification: GetImplementationReview

## Requirements

### Requirement: Input contract

#### Scenario: Execute accepts change name

- **WHEN** `GetImplementationReview.execute({ name })` is called
- **THEN** it accepts the target change name

### Requirement: Change must exist

#### Scenario: Unknown change throws ChangeNotFoundError

- **WHEN** `GetImplementationReview.execute({ name: "missing" })` is called
- **THEN** it throws `ChangeNotFoundError`

### Requirement: Result projection

#### Scenario: Review result returns implementation tracking and spec scope

- **GIVEN** an active change exists
- **WHEN** `GetImplementationReview.execute({ name })` succeeds
- **THEN** the result includes `implementationTracking`
- **AND** it includes the change `specIds`

### Requirement: Delivery-agnostic read boundary

#### Scenario: Use case returns raw review model without delivery formatting

- **WHEN** the use case is reviewed
- **THEN** it returns delivery-agnostic data only
- **AND** it does not embed CLI formatting or archive-time materialization logic

### Requirement: Config-based factory delegates through resolveGetImplementationReviewDeps

#### Scenario: createGetImplementationReview config form derives GetImplementationReviewDeps through resolveGetImplementationReviewDeps

- **WHEN** `createGetImplementationReview(config, options?)` is invoked
- **THEN** it creates a composition resolver for that composition session
- **AND** it derives `GetImplementationReviewDeps` through `resolveGetImplementationReviewDeps(resolver)`
- **AND** `resolveGetImplementationReviewDeps(resolver)` resolves:

- `changes: ChangeRepository`

- **AND** the factory delegates to canonical `createGetImplementationReview(deps)`
