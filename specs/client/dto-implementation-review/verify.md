# Verification: Dto Implementation Review

## Requirements

### Requirement: client DTO matches API wire shape

#### Scenario: Client type fields match API DTO

- **WHEN** TypeScript compiles client against paired `api:dto-implementation-review`
- **THEN** `ImplementationReviewDto` property names match API JSON
- **AND** nested `implementationTracking.links` / `trackedFiles` shapes match

#### Scenario: Remote adapter parses without aliases

- **GIVEN** fixture JSON from `GET .../implementation-review`
- **WHEN** `adapter-remote-specd-data.getImplementationReview` resolves
- **THEN** result is typed as `ImplementationReviewDto`
- **AND** hooks read `implementationTracking` directly

### Requirement: types live in packages/client/src/dto/implementation-tracking.ts

#### Scenario: types live in packages/client/src/dto/impleme… — primary path

- **WHEN** ImplementationReviewDto, ImplementationTrackingDto, ImplementationLinkDto, and TrackedImplementationFileDto MUST be exported
- **THEN** behaviour matches the spec requirement
- **AND** no forbidden side effects occur

#### Scenario: types live in packages/client/src/dto/impleme… — guard path

- **GIVEN** inputs that stress the requirement boundary
- **WHEN** the same capability runs
- **THEN** errors or skips are explicit and documented

### Requirement: port-changes-read uses ImplementationReviewDto

#### Scenario: Port signature is not untyped Record

- **WHEN** `PortChangesRead` is inspected
- **THEN** `getImplementationReview` return type is `ImplementationReviewDto`
- **AND** not `Record<string, unknown>`
