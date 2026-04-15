# Post-Archive Changeset Hook

## Purpose

Automatically creates changeset files in `.changeset/` after archiving a change, enabling integration with the `@changesets/cli` release workflow. This eliminates manual changelog maintenance by deriving changesets from the archived change's metadata.

## Requirements

### Requirement: Design hook for release metadata

Before finishing design, a hook instructs the LLM to add release metadata to `design.md`:

```yaml
workflow:
  - step: ready
    hooks:
      pre:
        - id: design-release-info
          instruction: >-
            Run `specd change status` to get the list of affected specs,
            then add or modify release metadata to the design.md frontmatter.
```

The LLM should:

1. Run `specd change status` to get affected specs
2. Add release metadata per spec:

```yaml
---
release:
  <workspace>:<spec-path>: <bump>
---
```

Bump types:

- `major` — breaking API changes
- `minor` — new features
- `patch` — fixes, refactors, chores (default)

Example:

```yaml
---
release:
  core:core/validate-artifacts: patch
  cli:cli/change-validate: minor
---
```

### Requirement: Hook registration

The hook is registered in `specd.yaml` under the archiving workflow:

```yaml
schemaOverrides:
  append:
    workflow:
      - step: archiving
        hooks:
          post:
            - id: archiving-create-changeset
              run: 'node scripts/hooks/post-archive-changeset.js {{change.archivedName}}'
```

The hook receives `{{change.archivedName}}` as a positional argument (e.g., `20260408-my-change`).

### Requirement: Release metadata from design frontmatter

The hook reads release metadata from the archived change's `design.md` frontmatter:

```yaml
---
release:
  core:core/spec-path: patch # major | minor | patch
  cli:cli/spec-path: minor
---
```

Format:

- Key: `workspace:spec-path` (e.g., `core:core/kernel`)
- Value: bump type (`major`, `minor`, or `patch`)

If no release frontmatter exists, the hook infers `patch` as default.

### Requirement: Changeset file generation

The hook generates **two changeset files** per change:

1. **Per-package changeset**: `YYYYMMDD-<change-name>.md`
   - Lists affected packages with their bump types
   - Lists affected specIds

2. **Meta changeset**: `YYYYMMDD-<change-name>-specd.md`
   - Targets `@specd/specd` (the metapackage)
   - Uses the highest bump type from all packages
   - Lists packages and specs affected

Example per-package changeset:

```markdown
---
    "@specd/core": patch
    "@specd/cli": minor
---

Change description from manifest.

Specs affected:

- `core:core/spec-path`
- `cli:cli/spec-path`
```

Example meta changeset:

```markdown
---
'@specd/specd': minor
---

Change description from manifest.

- @specd/core
- @specd/cli

- `core:core/spec-path`
- `cli:cli/spec-path`
```

### Requirement: Filename format

Changeset filenames use the archived name with date prefix:

```
<YYYYMMDD>-<archived-name>.md
```

Example: `20260408-my-feature.md`

### Requirement: Package determination

Packages are determined by:

1. Reading `release.frontmatter` from `design.md` (preferred)
2. Falling back to `specIds` from the archive index

The bump type per package is:

- The specified bump from frontmatter for that spec's workspace
- Or the highest bump if multiple specs affect the same workspace

Workspace to package mapping:

| Workspace  | Package           |
| ---------- | ----------------- |
| core       | @specd/core       |
| cli        | @specd/cli        |
| code-graph | @specd/code-graph |
| skills     | @specd/skills     |
| schema-std | @specd/schema-std |
| public-web | @specd/public-web |
| mcp        | @specd/mcp        |

### Requirement: Bump type per spec

The bump type in the frontmatter is per specId:

- `major` — breaking API changes
- `minor` — new features
- `patch` — fixes, refactors, chores (default)

Multiple specs in the same workspace use the highest bump type for that package.

Example:

```yaml
release:
  core:core/spec1: patch
  core:core/spec2: minor
  # @specd/core gets 'minor' (the highest)
```

### Requirement: Design instruction

Before finishing design, the LLM should add release metadata to `design.md` frontmatter by:

1. Running `specd change status` to get affected specs
2. Adding release metadata per spec

```yaml
---
release:
  <workspace>:<spec-path>: <bump>
---
```

## Constraints

- Hook must not fail if changeset creation fails — log warning but don't block
- Existing changeset files are overwritten
- Changesets are created in `.changeset/` directory
- If no workspace maps to a known package, no changeset is created for that workspace
- The hook runs in post-archive phase, after `ArchiveRepository.archive()` completes
- Uses `change.archivedName` (includes date) to avoid name collisions
