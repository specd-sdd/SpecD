# Proposal: align-spec-optimization-cli-and-agents

## Motivation

The persisted-optimization CLI, its public documentation, and the agent templates that
consume it no longer describe the same executable contract. This causes optimizer agents
to make invalid configuration decisions and fail when they try to persist generated
context. Runtime verification also exposed a pre-existing Core defect: successful clear
operations leave the selected optimization fields persisted.

## Current behaviour

`specs optimizations set` currently requires `--input <json-file|->`, while the public
CLI documentation and the spec-context optimizer instruct callers to pass
`--optimized-description` and `--optimized-context`. Both optimizer agents are required
to gate work on effective `llmOptimizedContext`, but the spec optimizer tries to infer
that setting from `specs metadata`, whose output contains spec materialization data rather
than project configuration. The archive skill separately reads a nonexistent
`approvals.llmOptimized` field instead of the top-level `llmOptimizedContext` exposed by
`project status`.

Template tests only assert broad keyword presence, so these non-executable commands and
incorrect output paths are not detected. The shared workflow guidance also lists
`specs metadata` without distinguishing its diagnostic role from `specs context`, which
can lead agents to consume the materialized cache projection when they actually need
filtered, dependency-aware, LLM-optimized context.

Both the direct and compatibility clear surfaces currently delegate successfully and
report the expected empty result, but a subsequent `get` still returns the supposedly
removed fields. The Core use case computes an optimization object with deleted keys and
passes it through the shared persisted-state patch path, which does not preserve those
deletions in the stored state.

Core currently validates operation exclusivity and presence manually, but relies on
TypeScript for set keys, set value types, and clear field names. JavaScript or otherwise
untyped SDK consumers can therefore bypass the CLI checks and submit malformed mutation
payloads to the business boundary.

## Proposed solution

Align the command and every first-party consumer around one explicit contract:

- Add direct `--optimized-description` and `--optimized-context` options for setting and
  clearing persisted optimization fields.
- Preserve the existing structured `--input` set path and `--field` clear path as
  compatibility surfaces. `--input` MUST NOT be combined with either
  `--optimized-description` or `--optimized-context` in the same `set` invocation; the
  CLI must reject the command before calling the Kernel.
- Require every `set` invocation to choose `--input` or at least one direct value flag.
  The two direct value flags may be combined to update both fields atomically.
- Require every `clear` invocation to choose repeated `--field` options or at least one
  direct clear flag. `--field` MUST NOT be combined with either direct clear flag, while
  the two direct clear flags may be combined to remove both fields atomically.
- Correct Core persisted-state mutation so clearing selected fields actually removes
  them, including omission of the optimization block after its final field is cleared.
- Add regression coverage that verifies persisted state after clear, not only the use
  case's returned projection, across partial clear, final-field clear, absent-field
  no-op, and both CLI input surfaces.
- Validate the complete Core use-case input with a strict Zod schema before workspace
  resolution or repository I/O, mapping invalid shapes to `InvalidInputError`.
- Make optimizer and archive templates read effective configuration from
  `specd project status --format toon` and its top-level `llmOptimizedContext` field.
- Keep persistence scope explicit: the spec-context optimizer writes lock-owned fields
  through `specs optimizations set`, while the project-context optimizer retains its
  project-scoped `project update-metadata --optimized-context` command.
- Keep `specs metadata` limited to metadata materialization diagnostics.
- Clarify shared spec-reading guidance: use `specs show` for exact raw artifacts,
  `specs context` for agent-ready semantic context, and `specs metadata` only for
  projection and materialization diagnostics.
- Strengthen canonical template tests and regenerate installed skill and agent outputs
  from the corrected sources.

## Specs affected

### New specs

None.

### Modified specs

- `cli:spec-optimizations`: extend the set and clear command signatures with direct field
  options, define compatibility with existing input forms, and specify ambiguity errors.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:agents`: require both optimizer agents to use the authoritative project-status
  field for their configuration gate, while distinguishing the spec optimizer's
  lock-owned persistence command from the project optimizer's project-scoped command.
  - Depends on (added): none
  - Depends on (removed): none
- `skills:skill-templates-source`: require canonical optimizer and archive templates to
  reference exact supported commands and output fields, require shared templates to
  preserve the distinction between raw artifacts, agent context, and metadata
  diagnostics, and add tests that detect contract drift.
  - Depends on (added): `skills:workflow-automation`
  - Depends on (removed): none
- `skills:workflow-automation`: define which spec read surface agents use for exact
  artifact review, compiled semantic context, and metadata diagnostics.
  - Depends on (added): `cli:spec-context`, `cli:spec-metadata`
  - Depends on (removed): none
- `core:update-persisted-spec-optimizations`: preserve its existing clear contract while
  requiring runtime validation of the complete mutation input and adding regression
  coverage that proves selected fields are absent from persisted state after clear.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

The change affects the `@specd/cli` parser and tests for
`packages/cli/src/commands/spec/optimizations.ts`, canonical templates and template tests
under `packages/skills/` (including `templates/shared/shared.md.tpl`), and
`docs/cli/spec-optimizations.md`. It also affects the Core persisted-optimization update
use case, its strict input schema, shared semantic patch integration, and unit tests. Generated Codex,
standard agent, and shared fallback copies must be refreshed through the repository's
supported template synchronization flow.

No persisted-state schema or freshness semantics change. Every CLI form continues to
delegate one normalized `set` or `clear` operation to the existing Kernel use case.

## Technical context

Runtime reproduction confirmed that direct set flags currently fail with
`required option '--input <path>' not specified`, while the same payload succeeds through
`--input -`. `project status --format toon` already guarantees top-level
`llmOptimizedContext`; `specs metadata` guarantees materialization diagnostics but no
effective configuration field.

`specs context` is the agent-facing semantic read: it supports section filters,
dependency traversal, and optimized-content preference. `specs show` remains the
authoritative exact-artifact read for spec authoring and review. `specs metadata` remains
useful when callers specifically need to inspect the normalized projection or determine
whether it was persisted or regenerated.

Direct flags are the ergonomic human and agent interface already advertised in public
documentation. Structured `--input` remains useful for multiline Markdown and
programmatic callers, so adding the direct form is preferable to removing the existing
one. The two set input mechanisms are mutually exclusive: a caller chooses either one
JSON payload through `--input` or one or more direct field flags, never both.
Compatibility forms must map to the same Kernel operation without duplicating freshness,
hashing, or persistence logic in the CLI.

The same separation applies to clearing: callers choose either repeated `--field`
options or direct clear flags, never both syntaxes in one invocation. These exclusions
prevent conflicting representations of the same operation; they do not prevent combining
`optimizedDescription` and `optimizedContext` within one chosen syntax. `get` retains its
single optional `--field` filter and needs no additional exclusivity rule.

Manual end-to-end verification after implementing the CLI surface showed that both direct
clear flags and repeated `--field` clear return success while a subsequent `get` returns
the old values. This isolates the defect below CLI normalization. The existing
`core:update-persisted-spec-optimizations` and `core:spec-optimization` requirements
already define the correct behavior, so the Core spec delta should add explicit regression
scenarios rather than redefine the persisted model.

The Core package already depends on Zod and uses `safeParse()` at application boundaries.
The update use case should follow that pattern with a strict discriminated mutation
shape: `specId` is a string, exactly one non-empty `set` or `clear` operation is present,
set keys are limited to the two optimization fields with string values, and clear entries
are limited to those same field names. Validation failures must occur before workspace
lookup, schema resolution, artifact reads, or persisted-state writes.

## Open questions

None. The compatibility direction is settled: add the documented direct flags without
removing the existing structured set or field-based clear forms.
