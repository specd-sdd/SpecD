# Verification: skills:list-skills

## Requirements

### Requirement: Input

#### Scenario: Empty input

- **WHEN** `ListSkills` use case is executed with empty input
- **THEN** it succeeds

### Requirement: Output

#### Scenario: Returns skills array

- **WHEN** `ListSkills` use case is executed
- **THEN** it returns `{ skills: readonly Skill[] }`

### Requirement: Behavior

#### Scenario: Returns all skills from repository

- **WHEN** `ListSkills` is executed
- **THEN** it returns the full array from `SkillRepository.list()`.
