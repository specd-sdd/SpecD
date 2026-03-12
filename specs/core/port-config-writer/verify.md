# Verification: ConfigWriter Port

## Requirements

### Requirement: Interface shape

#### Scenario: Implementation satisfies the contract

- **GIVEN** a concrete class implementing `ConfigWriter`
- **WHEN** the class implements `initProject`, `recordSkillInstall`, and `readSkillsManifest`
- **THEN** it compiles and can be instantiated

### Requirement: InitProject behaviour

#### Scenario: Fresh project is initialised

- **GIVEN** a directory with no existing `specd.yaml`
- **WHEN** `initProject` is called with valid options
- **THEN** a `specd.yaml` is created, storage directories are created, and `specd.local.yaml` is appended to `.gitignore`

#### Scenario: Result contains expected metadata

- **WHEN** `initProject` completes successfully
- **THEN** the returned `InitProjectResult` contains the absolute `configPath`, the `schemaRef` as written, and the created `workspaces` list

### Requirement: InitProject already-initialised guard

#### Scenario: Existing config without force throws

- **GIVEN** `specd.yaml` already exists in the project root
- **WHEN** `initProject` is called with `force` not set or `false`
- **THEN** it throws an `AlreadyInitialisedError`

#### Scenario: Existing config with force overwrites

- **GIVEN** `specd.yaml` already exists in the project root
- **WHEN** `initProject` is called with `force: true`
- **THEN** the existing file is overwritten and no error is thrown

### Requirement: RecordSkillInstall behaviour

#### Scenario: New skills are added for an agent

- **GIVEN** a `specd.yaml` with no `skills` key
- **WHEN** `recordSkillInstall` is called with agent `"claude"` and skills `["spec-compliance", "code-review"]`
- **THEN** the `skills` key is created with `claude: ["spec-compliance", "code-review"]`

#### Scenario: Duplicate skills are deduplicated

- **GIVEN** a `specd.yaml` where agent `"claude"` already has `["spec-compliance"]`
- **WHEN** `recordSkillInstall` is called with skills `["spec-compliance", "code-review"]`
- **THEN** the result for `"claude"` is `["spec-compliance", "code-review"]` with no duplicates

#### Scenario: Other agents are not affected

- **GIVEN** a `specd.yaml` with skills for both `"claude"` and `"copilot"`
- **WHEN** `recordSkillInstall` is called for `"claude"` only
- **THEN** the `"copilot"` skills remain unchanged

### Requirement: ReadSkillsManifest missing file handling

#### Scenario: Missing config returns empty record

- **GIVEN** no `specd.yaml` exists at the given path
- **WHEN** `readSkillsManifest` is called
- **THEN** it returns `{}`

### Requirement: ReadSkillsManifest invalid YAML handling

#### Scenario: Malformed YAML returns empty record

- **GIVEN** a `specd.yaml` with invalid YAML content
- **WHEN** `readSkillsManifest` is called
- **THEN** it returns `{}`

#### Scenario: Invalid skills shape returns empty record

- **GIVEN** a `specd.yaml` where the `skills` key is not a `Record<string, string[]>`
- **WHEN** `readSkillsManifest` is called
- **THEN** it returns `{}`

### Requirement: ReadSkillsManifest method signature

#### Scenario: Valid skills are returned

- **GIVEN** a `specd.yaml` with `skills: { claude: ["spec-compliance"] }`
- **WHEN** `readSkillsManifest` is called
- **THEN** it returns `{ claude: ["spec-compliance"] }`
