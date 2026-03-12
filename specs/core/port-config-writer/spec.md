# ConfigWriter Port

## Overview

`ConfigWriter` is an application-layer port that defines the contract for creating and mutating the project configuration (`specd.yaml`). Unlike `ConfigLoader` (which is read-only), `ConfigWriter` handles the operations that initialise a project, record skill installations, and read the skills manifest.

## Requirements

### Requirement: Interface shape

The port MUST be declared as a TypeScript `interface` named `ConfigWriter` with three methods: `initProject`, `recordSkillInstall`, and `readSkillsManifest`. It SHALL NOT be an abstract class.

### Requirement: InitProject method signature

The `initProject` method MUST accept a single parameter:

1. `options: InitProjectOptions` — an object containing `projectRoot`, `schemaRef`, `workspaceId`, `specsPath`, and optional `force`

It MUST return `Promise<InitProjectResult>`.

### Requirement: InitProjectOptions shape

The `InitProjectOptions` interface MUST contain:

- `projectRoot: string` — the directory to initialise (absolute path)
- `schemaRef: string` — schema reference string (e.g. `"@specd/schema-std"`)
- `workspaceId: string` — the default workspace name (e.g. `"default"`)
- `specsPath: string` — relative path for the specs directory (e.g. `"specs/"`)
- `force?: boolean` — when `true`, overwrite an existing `specd.yaml` without error

### Requirement: InitProjectResult shape

The `InitProjectResult` interface MUST contain:

- `configPath: string` — absolute path to the created `specd.yaml` file
- `schemaRef: string` — schema reference as written
- `workspaces: readonly string[]` — workspace IDs created

### Requirement: InitProject behaviour

The `initProject` method MUST:

1. Create a `specd.yaml` file in `projectRoot` with the schema, workspace, and storage configuration
2. Create the required storage directories (`.specd/changes/`, `.specd/drafts/`, `.specd/discarded/`, `.specd/archive/`)
3. Append `specd.local.yaml` to `.gitignore` if not already present

### Requirement: InitProject already-initialised guard

When `specd.yaml` already exists in `projectRoot` and `force` is not `true`, the method MUST throw an `AlreadyInitialisedError`. When `force` is `true`, the existing file MUST be overwritten without error.

### Requirement: RecordSkillInstall method signature

The `recordSkillInstall` method MUST accept three parameters:

1. `configPath: string` — absolute path to the `specd.yaml` to update
2. `agent: string` — the agent name (e.g. `"claude"`)
3. `skillNames: readonly string[]` — the skill names to record

It MUST return `Promise<void>`.

### Requirement: RecordSkillInstall behaviour

The method MUST merge the provided skill names into the `skills` key of `specd.yaml` for the given agent. Duplicate skill names MUST be deduplicated. Existing skills for other agents MUST NOT be affected.

### Requirement: ReadSkillsManifest method signature

The `readSkillsManifest` method MUST accept a single parameter:

1. `configPath: string` — absolute path to the `specd.yaml` to read

It MUST return `Promise<Record<string, string[]>>` — a map of agent name to list of installed skill names.

### Requirement: ReadSkillsManifest missing file handling

When the config file does not exist, the method MUST return `{}` (an empty record). It SHALL NOT throw for a missing file.

### Requirement: ReadSkillsManifest invalid YAML handling

When the config file contains invalid YAML or the `skills` key does not match the expected `Record<string, string[]>` shape, the method MUST return `{}` rather than throwing.

## Constraints

- The port lives in `application/ports/` per the hexagonal architecture rule
- No direct dependency on `node:fs`, the `yaml` package, or any I/O at the port level
- `AlreadyInitialisedError` is an application-layer error
- The `skills` key in `specd.yaml` follows the schema `Record<string, string[]>`

## Spec Dependencies

- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — hexagonal architecture and port placement rules
- [`specs/core/config/spec.md`](../config/spec.md) — `specd.yaml` configuration structure
