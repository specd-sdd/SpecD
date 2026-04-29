# Verification: skills:skill-bundle

## Requirements

### Requirement: SkillBundle interface

#### Scenario: Bundle install supports single target compatibility

- **WHEN** `bundle.install(targetDir)` is called with a string path
- **THEN** files are written using that path as the normal install target

#### Scenario: Bundle install supports split normal and shared targets

- **GIVEN** `bundle.files` includes both shared and non-shared files
- **WHEN** `bundle.install({ targetDir, sharedTargetDir })` is called
- **THEN** shared files are written under `sharedTargetDir`
- **AND** non-shared files are written under `targetDir`

#### Scenario: Bundle uninstall follows the same routing

- **GIVEN** bundle files were installed with shared routing
- **WHEN** `bundle.uninstall({ targetDir, sharedTargetDir })` is called
- **THEN** shared files are removed from `sharedTargetDir`
- **AND** non-shared files are removed from `targetDir`

### Requirement: Install behavior

#### Scenario: Shared files use shared target when provided

- **GIVEN** a bundle has at least one file marked `shared: true`
- **WHEN** `install({ targetDir, sharedTargetDir })` is executed
- **THEN** shared files are written to `sharedTargetDir`
- **AND** non-shared files are written to `targetDir`

#### Scenario: Shared files fall back to normal target when shared target is omitted

- **GIVEN** a bundle has files marked as shared
- **WHEN** `install(targetDir)` is executed with the legacy string input
- **THEN** shared files are written under `targetDir`

### Requirement: Uninstall behavior

#### Scenario: Shared files are removed from shared target when provided

- **GIVEN** files were installed using `sharedTargetDir`
- **WHEN** `uninstall({ targetDir, sharedTargetDir })` is executed
- **THEN** shared files are removed from `sharedTargetDir`
- **AND** non-shared files are removed from `targetDir`

#### Scenario: Missing files do not fail uninstall

- **WHEN** `uninstall(...)` is executed and some target files do not exist
- **THEN** uninstall completes without failing

### Requirement: ResolvedFile interface

#### Scenario: File has filename content and optional shared marker

- **WHEN** a ResolvedFile is created
- **THEN** it has `filename` and `content` properties
- **AND** it may include `shared: true` to identify a shared bundle resource
- **AND** a missing `shared` value is interpreted as a skill-local file
