# Change Directory Layout

## Purpose

Without a well-defined directory layout, tooling cannot reliably locate manifests, artifacts, or delta files — especially in multi-workspace changes. This spec defines the internal structure of a change directory: where the manifest lives, where change-scoped and spec-scoped artifacts are placed, and the conventions for delta files that modify existing specs.

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

When a change modifies an existing spec-scoped artifact whose schema artifact declares `delta: true`, a delta file is produced instead of rewriting the artifact in full. Delta files live under `deltas/<workspace>/<capability-path>/` and are named `<artifact-filename>.delta.yaml`.

```text
deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml
```

Examples:

- `deltas/default/core/config/spec.md.delta.yaml`
- `deltas/default/auth/login/verify.md.delta.yaml`
- `deltas/billing/invoices/spec.md.delta.yaml`

Delta files are change artifacts — they are never synced to the permanent spec directories. The `deltas/` prefix separates them unambiguously from new spec files under `specs/`.

For existing specs with delta-capable artifacts, this delta path is the expected artifact path. A same-named artifact under `specs/<workspace>/<capability-path>/` is not a valid substitute.

### Requirement: Expected spec-scoped artifact path

For every spec-scoped artifact, specd MUST determine exactly one expected artifact path within the change directory before exposing that artifact through the manifest, status, validation, or artifact instructions.

When the target spec already exists and the schema artifact declares `delta: true`, the expected path SHALL be the delta file path:

```text
deltas/<workspace>/<capability-path>/<artifact-filename>.delta.yaml
```

When the target spec does not already exist, the expected path SHALL be the new spec artifact path:

```text
specs/<workspace>/<capability-path>/<artifact-filename>
```

When the schema artifact does not declare `delta: true`, the expected path SHALL be the spec artifact path under `specs/<workspace>/<capability-path>/` regardless of whether the target spec already exists.

Tools MUST NOT treat the `specs/...` and `deltas/...` locations as interchangeable alternatives for the same artifact.

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
- For a given spec-scoped artifact, exactly one of the `specs/...` or `deltas/...` paths is expected; tools must not accept both for the same target
- The workspace segment is always present in both `specs/` and `deltas/` subtrees — it is never omitted
- `specs/` and `deltas/` subtrees within a change directory are never synced to permanent spec directories; only `ArchiveChange` may move their contents
- No other directories or file types are valid at the change directory root besides `manifest.json`, schema-declared artifacts, `specs/`, and `deltas/`

## Spec Dependencies

- [`core:core/storage`](../storage/spec.md) — change directory naming (`YYYYMMDD-HHmmss-<name>`), storage paths
- [`core:core/change-manifest`](../change-manifest/spec.md) — `manifest.json` format and fields
- [`core:core/delta-format`](../delta-format/spec.md) — delta file format and application
- [`core:core/schema-format`](../schema-format/spec.md) — `artifact.scope`, `artifact.output`, `artifact.delta`
- [`core:core/archive-change`](../archive-change/spec.md) — how files in `specs/` and `deltas/` are consumed at archive time
- [`core:core/workspace`](../workspace/spec.md) — workspace directory segment in change artifact paths
