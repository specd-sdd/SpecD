# Verification: RecordSkillInstall

## Requirements

### Requirement: Accepts RecordSkillInstallInput as input

#### Scenario: All required fields provided

- **WHEN** `execute` is called with `configPath`, `agent`, and `skillNames`
- **THEN** the call succeeds and the values are forwarded to `ConfigWriter.recordSkillInstall`

### Requirement: Delegates to ConfigWriter.recordSkillInstall

#### Scenario: Port receives decomposed input

- **WHEN** `execute` is called with `{ configPath: "/p/specd.yaml", agent: "claude", skillNames: ["specd-bootstrap"] }`
- **THEN** `ConfigWriter.recordSkillInstall` is called with `("/p/specd.yaml", "claude", ["specd-bootstrap"])`
- **AND** the use case performs no other I/O

### Requirement: Returns void on success

#### Scenario: Successful recording resolves without value

- **WHEN** `execute` completes successfully
- **THEN** the returned promise resolves to `undefined`

### Requirement: Skill names are deduplicated by the port

#### Scenario: Recording already-installed skills

- **GIVEN** `specd.yaml` has `skills.claude: ["specd-bootstrap"]`
- **WHEN** `execute` is called with `agent: "claude"` and `skillNames: ["specd-bootstrap", "specd-spec-metadata"]`
- **THEN** the resulting `skills.claude` array contains `["specd-bootstrap", "specd-spec-metadata"]` with no duplicates

#### Scenario: Recording skills for a new agent

- **GIVEN** `specd.yaml` has no `skills` section
- **WHEN** `execute` is called with `agent: "copilot"` and `skillNames: ["specd-bootstrap"]`
- **THEN** the resulting `skills.copilot` array contains `["specd-bootstrap"]`

### Requirement: Preserves existing config structure

#### Scenario: Comments and key order preserved

- **GIVEN** `specd.yaml` contains comments and a specific key ordering
- **WHEN** `execute` updates the `skills` section
- **THEN** comments and key order outside the `skills` section are preserved
