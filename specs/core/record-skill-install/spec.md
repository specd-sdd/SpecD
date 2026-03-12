# RecordSkillInstall

## Overview

The `RecordSkillInstall` use case records that a set of skills was installed for a specific agent by updating the `skills` section of `specd.yaml`. It delegates to the `ConfigWriter` port and performs no business logic beyond passing the input through.

## Requirements

### Requirement: Accepts RecordSkillInstallInput as input

`execute(input)` MUST accept a `RecordSkillInstallInput` object with the following fields:

- `configPath` (string, required) — absolute path to the `specd.yaml` to update.
- `agent` (string, required) — the agent name (e.g. `"claude"`).
- `skillNames` (readonly string[], required) — the skill names to record.

### Requirement: Delegates to ConfigWriter.recordSkillInstall

The use case MUST call `ConfigWriter.recordSkillInstall(configPath, agent, skillNames)` with the values from the input object. It SHALL NOT perform any filesystem I/O directly.

### Requirement: Returns void on success

`execute` MUST return `Promise<void>`. There is no result object — success is indicated by the promise resolving without error.

### Requirement: Skill names are deduplicated by the port

The `ConfigWriter.recordSkillInstall` implementation MUST merge the provided skill names into the existing `skills.<agent>` array, deduplicating entries. If skills already recorded for the agent overlap with the new list, no duplicates SHALL appear in the result.

### Requirement: Preserves existing config structure

The `ConfigWriter` adapter MUST preserve comments and key order in `specd.yaml` as much as the YAML library permits when writing the updated skills section.

## Constraints

- The use case is a thin pass-through to the `ConfigWriter` port.
- `RecordSkillInstall` is constructed with a single dependency: a `ConfigWriter` instance.
- The use case is async — it returns `Promise<void>`.
- `@specd/core` owns all YAML serialisation — adapters never write `specd.yaml` directly.

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — defines `ConfigWriter` port contract and skills manifest structure
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
