# Spec Metadata

## Overview

Each spec directory in a specd project may contain a `.specd-metadata.yaml` file alongside its content artifacts. This file records machine-readable metadata about the spec — specifically its declared context dependencies and a hash of the spec content at the time those dependencies were last derived. It is managed by the LLM agent, not by the user directly, and is not part of the schema artifact system.

## Requirements

### Requirement: File location and naming

`.specd-metadata.yaml` lives inside the spec directory, at the same level as the spec's content artifacts (e.g. `spec.md`, `verify.md`):

```
specs/core/change/
├── spec.md
├── verify.md
└── .specd-metadata.yaml
```

The `.specd-` prefix namespaces the file as specd-managed, avoiding conflicts with other tooling. Its absence is not an error — a spec with no `.specd-metadata.yaml` is treated as having no declared dependencies and no recorded content hash.

### Requirement: File format

`.specd-metadata.yaml` is a YAML file. All fields are optional — an empty file or absent file is valid:

```yaml
# specs/core/change/.specd-metadata.yaml
title: Change
description: >
  The central domain entity in specd. Read this spec when working on anything that
  creates, transitions, or archives a unit of spec work — it defines the lifecycle,
  approval gates, and event history model that everything else depends on.
dependsOn:
  - core/storage
  - core/delta-merger
  - core/config
  - core/schema-format
keywords:
  - lifecycle
  - approval
  - event-sourcing
contentHashes:
  spec.md: 'sha256:a3f1c2...'
  verify.md: 'sha256:b7e4d9...'
rules:
  - requirement: Lifecycle
    rules:
      - 'A Change progresses through states: open → ready → approved → merged.'
      - 'Only an approved Change may be merged.'
constraints:
  - 'A Change must not reference itself in dependsOn.'
scenarios:
  - requirement: Lifecycle
    name: 'Open change cannot be merged'
    given:
      - 'a Change in state open'
    when:
      - 'merge is attempted'
    then:
      - 'an error is returned'
      - 'the Change remains in state open'
```

- **`title`** (string, optional) — short human-readable name for the spec, suitable for display in lists and tooling (e.g. `"Change"`, `"Storage"`, `"Schema Format"`). If absent, tooling falls back to the spec's path.

- **`description`** (string, optional) — 2–3 sentences written for discovery: what does this spec cover, why does it exist in the system, and when would you need to read it? Used by tooling and the LLM to assess relevance without reading the full spec content — for example when selecting which specs to include in a context or presenting a list of available specs. Should not read like a dictionary definition.

- **`keywords`** (array of strings, optional) — topic tags for this spec, used by tooling to find related specs (e.g. `specd spec find --keyword auth`). Should capture domain concepts, patterns, and cross-cutting concerns present in the spec. Lowercase, hyphen-separated.

- **`dependsOn`** (array of strings, optional) — spec paths this spec depends on for context. Each path is relative to the workspace root and may include an optional workspace qualifier (e.g. `billing:payments/invoices`) for cross-workspace dependencies. An unqualified path is resolved within the same workspace as the referencing spec. An empty array or absent field means no declared dependencies.

- **`contentHashes`** (map of filename → hash string, optional) — a SHA-256 hash per `requiredSpecArtifacts` file at the time the metadata was last derived. Keys are the resolved filenames: specd reads `requiredSpecArtifacts` from the active schema, looks up each artifact's `output` field, and resolves the concrete filename for this spec directory — that resolved filename is the key (e.g. `spec.md`, `verify.md`). Used to detect when any artifact file has changed and the metadata may be stale. A missing entry or absent field is treated as stale for that file.

- **`rules`** (array of objects, optional) — normative statements extracted from the spec, grouped by requirement name. Each entry has a `requirement` key (string) and a `rules` key (array of plain-text sentences). Preserves named functions, APIs, field names, state/enum values, and transition graphs. Omits explanation and rationale. Used by the LLM as a dense summary of requirements without loading the full spec.

- **`constraints`** (array of strings, optional) — hard invariants extracted from the spec's `## Constraints` section. Each entry is a single plain-text sentence. Omitted if the spec has no `## Constraints` section.

- **`scenarios`** (array of objects, optional) — BDD-style verification scenarios extracted from verify files. Flat array: one object per scenario, not one object per requirement. Each entry has:
  - `requirement` (string) — name of the requirement this scenario verifies; multiple scenarios may share the same `requirement` value
  - `name` (string) — the scenario title as it appears in the verify file (e.g. `"Config found — nearest file used"`)
  - `given` (array of strings) — preconditions; may be empty
  - `when` (array of strings) — the action or event being tested
  - `then` (array of strings) — expected outcomes
    Omitted if the spec has no verification scenarios.

### Requirement: LLM authorship

`.specd-metadata.yaml` is written and maintained by the LLM agent. It is generated once per spec at archive time: when `ArchiveChange` completes, it signals which specs were modified via `staleMetadataSpecPaths`, and the caller (CLI or MCP layer) triggers the extraction agent for each of those specs.

specd does not generate or rewrite `.specd-metadata.yaml` automatically. The agent is responsible for producing accurate output. After generation, the metadata is stable until the spec is modified again by a subsequent change.

### Requirement: Staleness detection

When specd reads a spec's `.specd-metadata.yaml`, it iterates over the active schema's `requiredSpecArtifacts`, resolves the concrete filename for each artifact via its `output` field, computes the current SHA-256 hash of that file, and compares it against the entry in `contentHashes` keyed by that filename. If any file's hash differs, a resolved filename is missing from `contentHashes`, or `contentHashes` itself is absent, specd emits a warning indicating that the spec has changed since the metadata was last derived and that the agent should review and regenerate `.specd-metadata.yaml`.

A missing `contentHashes` field is treated as stale — specd emits the same warning.

Staleness is advisory only. specd does not block any operation because `.specd-metadata.yaml` is stale.

### Requirement: Use by CompileContext

`CompileContext` reads `.specd-metadata.yaml` for two purposes:

1. **Spec collection** — `dependsOn` is followed transitively from `change.contextSpecIds` to discover which specs to include in the context. The full resolution order is defined in [`specs/core/config/spec.md`](../config/spec.md) — Requirement: Context spec selection.

2. **Spec content** — for each spec in the collected context set, if metadata is fresh, `CompileContext` uses `description`, `rules`, `constraints`, and `scenarios` as the compact, machine-optimised representation of that spec. If metadata is absent or stale, `CompileContext` falls back to extracting the sections declared in the artifact's `contextSections[]` and emits a staleness warning.

A spec that cannot be resolved (missing file, unknown workspace) is silently skipped with a warning.

### Requirement: Version control

`.specd-metadata.yaml` must be committed to version control alongside the spec content. It is part of the spec's persistent record and must not be added to `.gitignore`.

## Pending

- **Spec index** — operations like `specd spec find --keyword <term>` currently require traversing all spec directories to read individual `.specd-metadata.yaml` files. If the number of specs grows to a point where traversal is slow, a generated index (analogous to the archive `index.jsonl`) should be introduced: individual files remain the source of truth, the index is derived and rebuilt via `specd spec reindex`. Not needed until there is a measurable performance problem.

## Constraints

- `.specd-metadata.yaml` is not a schema artifact — it is never listed in `requiredSpecArtifacts`, never validated by `ValidateArtifacts`, and never tracked in the change manifest's `artifacts` array
- Its absence is not an error at any point — all reads of `.specd-metadata.yaml` treat a missing file as empty
- `dependsOn` paths must not form cycles; if a cycle is detected during traversal, specd breaks the cycle and emits a warning
- Staleness warnings are advisory only — they do not block any operation
- The LLM must not include the spec itself in its own `dependsOn` list

## Spec Dependencies

- [`specs/core/config/spec.md`](../config/spec.md) — context spec selection and resolution order
- [`specs/core/change/spec.md`](../change/spec.md) — `contextSpecIds` in the change manifest, populated from `dependsOn`
- [`specs/core/schema-format/spec.md`](../schema-format/spec.md) — `requiredSpecArtifacts`, used to determine which files to hash for staleness detection
