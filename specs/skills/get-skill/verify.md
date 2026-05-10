# Verification: skills:get-skill

## Requirements

### Requirement: Output

#### Scenario: Returns skill or not found error

- **WHEN** a skill is requested
- **THEN** the result is either the `Skill` object or a `NOT_FOUND` error.

### Requirement: Behavior

#### Scenario: Delegates to repository

- **WHEN** `GetSkill` is executed
- **THEN** it calls `SkillRepository.get()` with the provided name.

### Requirement: Input

#### Scenario: Valid skill name

- **WHEN** `GetSkill` use case is executed with `{ name: 'skill-name' }`
- **THEN** it returns `{ skill: Skill }`

#### Scenario: Invalid skill name

- **WHEN** `GetSkill` use case is executed with `{ name: 'nonexistent' }`
- **THEN** it returns `{ error: 'NOT_FOUND' }`
