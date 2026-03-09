# Change Directory Layout

## Overview

A change directory is the working area for a single in-progress change. It holds the manifest, all artifacts produced during the change lifecycle, and delta files for spec-scoped artifacts that modify existing specs. This spec defines the internal structure of a change directory and the conventions that govern where each file type lives within it.

## Requirements

### Requirement: Root files

The change directory root contains `manifest.json` and all change-scoped artifacts declared by the active schema. Change-scoped artifacts have no workspace or capability-path prefix — they are always flat at the root. The exact filenames are defined by the schema (e.g. `proposal.md`, `tasks.md`, `design.md` in `schema-std`).

```
<changes>/<timestamp>-<name>/
├── manifest.json
├── <change-artifact>         ← one per change-scoped artifact declared by the schema
├── <change-artifact>
└── <change-artifact>         ← optional artifacts only present if produced
```

`manifest.json` is the source of truth for the change entity. Artifact files are the working documents produced during the lifecycle. No other file types live at the root.

### Requirement: New spec-scoped artifacts

When a change creates new spec-scoped artifacts (e.g. a new `spec.md` or `verify.md` for a capability that does not yet exist), those files are placed under `specs/<workspace>/<capability-path>/` within the change directory. The `<workspace>` segment matches the workspace ID from `specd.yaml` (e.g. `default`). The `<capability-path>` is the spec path within that workspace (e.g. `core/config`).

```
specs/<workspace>/<capability-path>/<artifact-filename>
```

Examples:

- `specs/default/core/config/spec.md`
- `specs/default/auth/login/verify.md`
- `specs/billing/invoices/spec.md`

This layout mirrors the permanent spec directory structure so that the files can be synced without path transformation during `ArchiveChange`. At archive time, the file at `specs/<workspace>/<capability-path>/<filename>` in the change directory is written to `<workspace.specs.path>/<capability-path>/<filename>` in the project.

### Requirement: Delta files

When a change modifies an existing spec-scoped artifact, a delta file is produced instead of rewriting the artifact in full. Delta files live under `deltas/<workspace>/<capability-path>/` and are named `<artifact-filename>.delta.yaml`.

```
deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml
```

Examples:

- `deltas/default/core/config/spec.md.delta.yaml`
- `deltas/default/auth/login/verify.md.delta.yaml`
- `deltas/billing/invoices/spec.md.delta.yaml`

Delta files are change artifacts — they are never synced to the permanent spec directories. The `deltas/` prefix separates them unambiguously from new spec files under `specs/`.

### Requirement: Workspace segment is always present

Both `specs/<workspace>/` and `deltas/<workspace>/` always include an explicit workspace segment, even when only one workspace is configured. Omitting the workspace segment is not valid. This ensures that multi-workspace changes are unambiguous and that tooling can resolve the correct `SpecRepository` for each file without inspecting `specd.yaml` at read time.

### Requirement: Full change directory structure

A change directory at full capacity — with both new specs and delta files for multiple workspaces — has this structure:

```
<changes>/<timestamp>-<name>/
├── manifest.json
├── <change-artifact>              ← schema-declared change-scoped artifacts (flat)
├── <change-artifact>
├── specs/
│   ├── default/
│   │   └── <capability-path>/
│   │       ├── <artifact-filename>    ← schema-declared spec-scoped artifact
│   │       └── <artifact-filename>
│   └── <other-workspace>/
│       └── <capability-path>/
│           └── <artifact-filename>
└── deltas/
    ├── default/
    │   └── <capability-path>/
    │       ├── <artifact-filename>.delta.yaml
    │       └── <artifact-filename>.delta.yaml
    └── <other-workspace>/
        └── <capability-path>/
            └── <artifact-filename>.delta.yaml
```

A change that only creates new specs has no `deltas/` subtree. A change that only modifies existing specs has no `specs/` subtree. Both may be present simultaneously when a change creates some new specs and modifies others.

## Constraints

- Change-scoped artifacts are always flat at the change directory root — no workspace or capability-path prefix
- Spec-scoped artifact files for new capabilities live under `specs/<workspace>/<capability-path>/`
- Delta files always live under `deltas/<workspace>/<capability-path>/` and are named `<artifact-filename>.delta.yaml`
- The workspace segment is always present in both `specs/` and `deltas/` subtrees — it is never omitted
- `specs/` and `deltas/` subtrees within a change directory are never synced to permanent spec directories; only `ArchiveChange` may move their contents
- No other directories or file types are valid at the change directory root besides `manifest.json`, schema-declared artifacts, `specs/`, and `deltas/`

## Spec Dependencies

- [`specs/core/storage/spec.md`](../storage/spec.md) — change directory naming (`YYYYMMDD-HHmmss-<name>`), storage paths
- [`specs/core/change-manifest/spec.md`](../change-manifest/spec.md) — `manifest.json` format and fields
- [`specs/core/delta-format/spec.md`](../delta-format/spec.md) — delta file format and application
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `artifact.scope`, `artifact.output`, `artifact.delta`
- [`specs/core/archive-change/spec.md`](../archive-change/spec.md) — how files in `specs/` and `deltas/` are consumed at archive time
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace directory segment in change artifact paths
