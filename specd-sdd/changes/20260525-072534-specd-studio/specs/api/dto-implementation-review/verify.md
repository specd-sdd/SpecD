# Verification: Dto Implementation Review

## Requirements

### Requirement: response JSON uses stable camelCase field names

#### Scenario: Implementation review JSON uses camelCase keys

- **WHEN** client calls `GET .../implementation-review`
- **THEN** response keys are `specIds` and `implementationTracking`
- **AND** nested keys are `links`, `trackedFiles`, `specId`, `file`, `fileLinkExplicit`, `state`

### Requirement: top-level shape matches GetImplementationReview

#### Scenario: Response includes specIds and tracking object

- **GIVEN** change with manifest tracking data
- **WHEN** handler returns success
- **THEN** body includes `specIds` array
- **AND** `implementationTracking` object with `links` and `trackedFiles` arrays

### Requirement: implementation link entries

#### Scenario: Link row includes required fields

- **GIVEN** change has at least one implementation link
- **WHEN** response is serialized
- **THEN** each link has `specId`, `file`, and `fileLinkExplicit`
- **AND** `symbols` appears only when symbol links exist

### Requirement: tracked file entries

#### Scenario: Tracked file states are enumerated

- **GIVEN** change has tracked implementation files
- **WHEN** response is serialized
- **THEN** each entry has `file` and `state`
- **AND** `state` is `open`, `resolved`, or `ignored`

### Requirement: handler maps kernel projection without business rules

#### Scenario: API does not enrich stale symbols in v1

- **WHEN** implementation-review handler runs
- **THEN** output matches kernel `projectImplementationTracking` shape
- **AND** does not call code-graph enrichment unless a future spec adds it
