# Verification: Hooks Change Scope Patch

## Requirements

### Requirement: computeSpecScopeDelta returns symmetric diff

#### Scenario: Detects add and remove

- **WHEN** saved is `[a]` and draft is `[b]`
- **THEN** `addSpecIds` is `[b]` and `removeSpecIds` is `[a]`

### Requirement: buildScopeChangeConfirmMessage warns invalidation

#### Scenario: Message includes invalidate keyword

- **WHEN** message is built for a non-empty delta
- **THEN** text mentions invalidate or approvals
