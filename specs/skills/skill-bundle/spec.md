# skills:skill-bundle

## Purpose

Defines the `SkillBundle` and `ResolvedFile` types for representing a skill with all its templates resolved and ready for installation.

## Requirements

### Requirement: ResolvedFile interface

`ResolvedFile` MUST be an interface with:

- `filename: string` — resolved file name
- `content: string` — file content with variables substituted
- `shared?: boolean` — optional marker indicating that the file is a shared bundle resource rather than a skill-local file

A missing or `false` `shared` value SHALL mean the file is skill-local. A `true` `shared` value SHALL mean installers may route the file to a shared install target.

### Requirement: SkillBundle interface

`SkillBundle` MUST be an interface with:

- `name: string` — skill name
- `description: string` — skill description
- `files: ResolvedFile[]` — array of resolved files
- `install(target: string | SkillBundleInstallTarget): Promise<void>` — writes files to the normal target and shared files to the optional shared target
- `uninstall(target: string | SkillBundleInstallTarget): Promise<void>` — removes installed files from the same target routing

`SkillBundleInstallTarget` MUST be an interface with:

- `targetDir: string` — normal skill-local target directory
- `sharedTargetDir?: string` — optional shared target directory for files marked `shared: true`

Passing a plain string SHALL remain equivalent to passing `{ targetDir: value }`.

### Requirement: Install behavior

The `install()` method MUST:

- Resolve the normal target directory from either the string argument or `target.targetDir`
- Resolve the shared target directory from `target.sharedTargetDir` when provided, otherwise from the normal target directory
- Create the normal target directory if it does not exist
- Create the shared target directory if at least one file is marked `shared: true` and that directory does not exist
- Write each file with `shared: true` to the shared target directory, preserving the filename
- Write each file without `shared: true` to the normal target directory, preserving the filename
- Fail gracefully if a file cannot be written

### Requirement: Uninstall behavior

The `uninstall()` method MUST:

- Resolve the normal and shared target directories using the same rules as `install()`
- Remove each file with `shared: true` from the shared target directory
- Remove each file without `shared: true` from the normal target directory
- Not fail if files do not exist (idempotent)

## Constraints

- All file operations happen in the domain layer for SkillBundle (unlike Skill which has lazy loading).

## Spec Dependencies

- [`skills:skill`](../skill/spec.md) — base skill types
