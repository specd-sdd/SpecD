# GetSkillsManifest

## Purpose

Commands like `specd skills list` and `specd skills update` need to know which skills are currently installed per agent without loading the full validated config. `GetSkillsManifest` provides this by reading the `skills` section of `specd.yaml` via the `ConfigWriter` port's `readSkillsManifest` operation and returning a typed map of agent names to skill name arrays.

## Requirements

### Requirement: Accepts GetSkillsManifestInput as input

`execute(input)` MUST accept a `GetSkillsManifestInput` object with the following field:

- `configPath` (string, required) — absolute path to the `specd.yaml` to read.

### Requirement: Delegates to ConfigWriter.readSkillsManifest

The use case MUST call `ConfigWriter.readSkillsManifest(configPath)` with the path from the input object. It SHALL NOT read or parse `specd.yaml` directly.

### Requirement: Returns a map of agent to skill names

`execute` MUST return `Promise<Record<string, string[]>>`. Each key is an agent name (e.g. `"claude"`); each value is an array of installed skill names for that agent.

### Requirement: Returns empty object when no skills section exists

When `specd.yaml` has no `skills` section, `readSkillsManifest` MUST return `{}` (an empty record). The use case MUST NOT treat absence as an error.

## Constraints

- The use case is a thin pass-through to the `ConfigWriter` port.
- `GetSkillsManifest` is constructed with a single dependency: a `ConfigWriter` instance.
- The use case is async — it returns `Promise<Record<string, string[]>>`.
- This is a targeted read that does not require a fully validated `SpecdConfig` — it reads only the `skills` key.

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — defines `ConfigWriter` port contract and skills manifest structure
- [`specs/_global/architecture/spec.md`](../../_global/architecture/spec.md) — port/adapter design constraints
