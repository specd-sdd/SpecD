# Verification: skills:get-skill

## Requirements

### Requirement: Input

#### Scenario: Valid skill name

- **WHEN** `GetSkill` use case is executed with `{ name: 'skill-name' }`
- **THEN** it returns `{ skill: Skill }`

#### Scenario: Invalid skill name

- **WHEN** `GetSkill` use case is executed with `{ name: 'nonexistent' }`
- **THEN** it returns `{ error: 'NOT_FOUND' }`
