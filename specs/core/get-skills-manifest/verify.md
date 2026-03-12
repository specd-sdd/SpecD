# Verification: GetSkillsManifest

## Requirements

### Requirement: Accepts GetSkillsManifestInput as input

#### Scenario: Config path provided

- **WHEN** `execute` is called with `{ configPath: "/project/specd.yaml" }`
- **THEN** the call succeeds and the path is forwarded to `ConfigWriter.readSkillsManifest`

### Requirement: Delegates to ConfigWriter.readSkillsManifest

#### Scenario: Port receives the config path

- **WHEN** `execute` is called with `{ configPath: "/p/specd.yaml" }`
- **THEN** `ConfigWriter.readSkillsManifest` is called with `"/p/specd.yaml"`
- **AND** the use case performs no other I/O

### Requirement: Returns a map of agent to skill names

#### Scenario: Multiple agents with skills

- **GIVEN** `specd.yaml` contains `skills: { claude: ["specd-bootstrap", "specd-spec-metadata"], copilot: ["specd-bootstrap"] }`
- **WHEN** `execute` is called
- **THEN** the result is `{ claude: ["specd-bootstrap", "specd-spec-metadata"], copilot: ["specd-bootstrap"] }`

### Requirement: Returns empty object when no skills section exists

#### Scenario: No skills section in config

- **GIVEN** `specd.yaml` has no `skills` key
- **WHEN** `execute` is called
- **THEN** the result is `{}`

#### Scenario: Skills section exists but is empty

- **GIVEN** `specd.yaml` has `skills: {}`
- **WHEN** `execute` is called
- **THEN** the result is `{}`
