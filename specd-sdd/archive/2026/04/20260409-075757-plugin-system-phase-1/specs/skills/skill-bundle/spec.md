# skills:skill-bundle

## Purpose

Defines the `SkillBundle` and `ResolvedFile` types for representing a skill with all its templates resolved and ready for installation.

## Requirements

### Requirement: ResolvedFile interface

`ResolvedFile` MUST be an interface with:

- `filename: string` — resolved file name
- `content: string` — file content with variables substituted

### Requirement: SkillBundle interface

`SkillBundle` MUST be an interface with:

- `name: string` — skill name
- `description: string` — skill description
- `files: ResolvedFile[]` — array of resolved files
- `install(targetDir: string): Promise<void>` — writes files to target directory
- `uninstall(targetDir: string): Promise<void>` — removes installed files from target directory

### Requirement: Install behavior

The `install()` method MUST:

- Create the target directory if it does not exist
- Write each file in `files` to the target directory, preserving the filename
- Fail gracefully if a file cannot be written

### Requirement: Uninstall behavior

The `uninstall()` method MUST:

- Remove each file that was installed
- Not fail if files do not exist (idempotent)

## Constraints

- All file operations happen in the domain layer for SkillBundle (unlike Skill which has lazy loading).

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill types
