# Verification: Shared Folder Owners

## Requirements

### Requirement: Owners marker file

#### Scenario: Marker is sorted and deduplicated

- **GIVEN** owners `copilot` and `claude` register in that order
- **WHEN** the marker is read
- **THEN** `owners` is `["claude", "copilot"]`

#### Scenario: Corrupt marker is treated as absent

- **GIVEN** `.owners.json` contains invalid JSON
- **WHEN** `removeSharedOwner` runs
- **THEN** it returns `hadMarker: false` and the file is not modified

### Requirement: Registering an owner

#### Scenario: First owner creates folder and marker

- **GIVEN** the shared folder does not exist
- **WHEN** `addSharedOwner(dir, 'claude')` runs
- **THEN** the folder exists and `.owners.json` is `{ "owners": ["claude"] }`

#### Scenario: Registering twice is idempotent

- **GIVEN** `claude` is already an owner
- **WHEN** `addSharedOwner(dir, 'claude')` runs again
- **THEN** the marker content is byte-identical

#### Scenario: Symlinked marker is replaced, not followed

- **GIVEN** `.owners.json` is a symbolic link to a file outside the shared folder
- **WHEN** `addSharedOwner(dir, 'claude')` runs
- **THEN** the link is replaced by a regular file `{ "owners": ["claude"] }`
- **AND** the outside file is untouched

#### Scenario: Symlinked marker counts as no marker on release

- **GIVEN** `.owners.json` is a symbolic link
- **WHEN** `removeSharedOwner(dir, 'claude')` runs
- **THEN** it returns `{ remaining: [], hadMarker: false }` and neither the link nor its target is modified

#### Scenario: A shared folder that is not a directory is left alone

- **GIVEN** the shared folder path is a symbolic link to a file
- **WHEN** `removeSharedFolderIfEmpty(dir)` runs
- **THEN** it does not throw (`ENOTDIR` is swallowed)

#### Scenario: Shared folder paths that resolve to the project root are rejected

- **WHEN** the shared folder is `''`, `.`, `./`, `\` or resolves to the project root
- **THEN** `InvalidSharedFolderError` is raised

#### Scenario: A folder name starting with two dots is valid

- **WHEN** the shared folder is `..foo` inside the project root
- **THEN** it is accepted and an absolute path inside the root is returned as a relative path

#### Scenario: Registering normalises a marker with duplicates

- **GIVEN** the marker is `{ "owners": ["codex", "claude", "claude"] }`
- **WHEN** `addSharedOwner(dir, 'claude')` runs
- **THEN** the marker is `{ "owners": ["claude", "codex"] }`

#### Scenario: Invalid marker is replaced on register

- **GIVEN** the marker is invalid JSON
- **WHEN** `addSharedOwner(dir, 'copilot')` runs
- **THEN** the marker is `{ "owners": ["copilot"] }`

#### Scenario: Owner registered before the first shared write

- **GIVEN** an agent plugin install that fails after writing one shared file
- **WHEN** the install rejects
- **THEN** `.owners.json` exists and lists the plugin's agent id
- **AND** a later full uninstall releases the owner and removes the shared files when it was the last owner

### Requirement: Releasing an owner

#### Scenario: Owners remain after release

- **GIVEN** owners are `claude` and `copilot`
- **WHEN** `removeSharedOwner(dir, 'claude')` runs
- **THEN** it returns `{ remaining: ["copilot"], hadMarker: true }` and the marker lists only `copilot`

#### Scenario: Last owner deletes the marker

- **GIVEN** owners are `claude`
- **WHEN** `removeSharedOwner(dir, 'claude')` runs
- **THEN** it returns `{ remaining: [], hadMarker: true }` and `.owners.json` no longer exists

#### Scenario: No marker leaves the folder untouched

- **GIVEN** the folder has `shared.md` and no marker
- **WHEN** `removeSharedOwner(dir, 'claude')` runs
- **THEN** it returns `{ remaining: [], hadMarker: false }` and no file is created or changed

#### Scenario: Releasing a non-owner is a no-op

- **GIVEN** owners are `claude`
- **WHEN** `removeSharedOwner(dir, 'codex')` runs
- **THEN** the marker still lists `claude` and the result has `hadMarker: true`, `remaining: ["claude"]`

### Requirement: Removing the folder only when empty

#### Scenario: Empty folder is removed

- **GIVEN** the shared folder is empty
- **WHEN** `removeSharedFolderIfEmpty(dir)` runs
- **THEN** the folder no longer exists

#### Scenario: Folder with foreign files is kept

- **GIVEN** the folder contains `notes.txt`
- **WHEN** `removeSharedFolderIfEmpty(dir)` runs
- **THEN** it resolves without error and `notes.txt` still exists

#### Scenario: Missing folder is accepted

- **GIVEN** the folder does not exist
- **WHEN** `removeSharedFolderIfEmpty(dir)` runs
- **THEN** it resolves without error

#### Scenario: Other errors propagate

- **GIVEN** `rmdir` fails with `EACCES`
- **WHEN** `removeSharedFolderIfEmpty(dir)` runs
- **THEN** the error is rethrown

### Requirement: Uninstall protocol for agent plugins

#### Scenario: Another agent still uses the shared folder

- **GIVEN** claude and copilot are owners and `shared.md` exists
- **WHEN** claude is fully uninstalled
- **THEN** `shared.md` and every `<agent>.agent.md` remain, and the marker lists only `copilot`

#### Scenario: Last agent removes shared files and the empty folder

- **GIVEN** claude is the only owner and the folder contains only specd files and the marker
- **WHEN** claude is fully uninstalled
- **THEN** `shared.md`, the agent files, and the marker are deleted and the folder no longer exists

#### Scenario: Foreign file keeps the folder

- **GIVEN** claude is the only owner and the folder also contains `notes.txt`
- **WHEN** claude is fully uninstalled
- **THEN** the specd shared files and the marker are deleted, `notes.txt` and the folder remain

#### Scenario: Legacy install without marker deletes nothing shared

- **GIVEN** a shared folder with `shared.md` and no marker
- **WHEN** claude is fully uninstalled
- **THEN** `shared.md` still exists

#### Scenario: Filtered uninstall does not touch the marker

- **GIVEN** claude is an owner
- **WHEN** claude is uninstalled with a `skills` filter
- **THEN** the marker and shared files are unchanged
