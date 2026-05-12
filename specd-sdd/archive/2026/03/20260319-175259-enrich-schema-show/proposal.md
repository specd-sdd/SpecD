# Proposal: Enrich schema show, artifact-instruction, and fix implementing requires

## Motivation

Three related problems prevent skills from being schema-agnostic:

1. `specd schema show --format json` omits artifact metadata that external consumers (skills, agents, tooling) need. Skills like `specd-design` currently reference `tasks.md` and `design.md` by name instead of discovering them from the schema.
2. `specd change artifact-instruction` does not include the template content for the artifact. The skill has no way to know the expected structure of an artifact without hardcoding it or reading the template file directly.
3. The `implementing` workflow step in `schema-std` only requires `[tasks]`. This means (a) if any other artifact is deleted mid-implementation, the step doesn't block, and (b) the hook instruction only tells the agent to read tasks.md — it has no guidance to read design.md (technical approach, key decisions, code snippets) or proposal.md (motivation and context).

## Current behaviour

**schema show:** The JSON output includes per artifact: `id`, `scope`, `optional`, `requires`, `format`, `delta`. Three useful fields are missing:

- **`description`** — human-readable summary; without it, consumers must know what each artifact ID means.
- **`output`** — the filename or glob pattern; without it, consumers must guess filenames.
- **`hasTaskCompletionCheck`** — whether the artifact carries a task checklist; without it, consumers hardcode which artifact to track progress on.

**artifact-instruction:** The JSON response includes `instruction`, `rulesPre`, `rulesPost`, and `delta`, but not the template content. The `template` field on `ArtifactType` points to a file path, but its resolved content is never exposed to consumers.

**schema-std workflow:** The `implementing` step declares `requires: [tasks]`. `CompileContext` uses step `requires` only as a gate — to evaluate whether the step is available (all required artifacts must be `complete` or `skipped`). It does NOT inject change artifact content (proposal.md, design.md, tasks.md) into the compiled context block. The agent must read these files directly from disk, guided by hook instructions. With only `[tasks]` required, deleting design.md mid-implementation wouldn't block the step, and the hook only tells the agent to read tasks.md — missing the design decisions, approach, and motivation in design.md and proposal.md.

## Proposed solution

**1. Enrich `schema show` output.** Add three fields to each artifact entry in the JSON (and toon) output:

| Field                    | Type             | Source                                           |
| ------------------------ | ---------------- | ------------------------------------------------ |
| `description`            | `string \| null` | `ArtifactType.description`                       |
| `output`                 | `string`         | `ArtifactType.output`                            |
| `hasTaskCompletionCheck` | `boolean`        | `ArtifactType.taskCompletionCheck !== undefined` |

The text output should also include `description` when present (appended after the existing columns) and `output`.

**2. Add `template` to `artifact-instruction` response.** Read the template file content and include it as a `template` field (resolved string content, not the file path) in the JSON response. When the artifact has no template, the field is `null`.

The `template` complements the existing `instruction` + `delta` pair. For artifacts with `delta: true`, `artifact-instruction` already returns both `instruction` (for new specs) and `delta` with `outlines` (for existing specs) in the same response — the caller decides which to use per spec based on whether an outline exists. The `template` follows the same pattern: it is always returned when the artifact defines one, and the caller uses it for new artifacts (alongside `instruction`) while ignoring it for deltas (where `outlines` already provides the existing structure).

**3. Fix `implementing` requires and hook in schema-std.** Change `requires: [tasks]` to require all artifacts as a defensive gate — if any artifact is deleted mid-implementation, the step blocks until it's restored. Update the `implementing-guidance` hook instruction to tell the agent to read all change artifacts from disk: proposal.md (the problem and why), specs/deltas (the final specification), verify/deltas (verification scenarios), design.md (implementation approach, key decisions, code snippets), and tasks.md (progress checklist). Note: `CompileContext` does not include change artifact content in its output — `requires` only controls step availability.

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/schema-show`: Add `description`, `output`, and `hasTaskCompletionCheck` to the JSON output structure requirement, and update text format to include `description` and `output`.
- `core:core/get-artifact-instruction`: Add resolved `template` content to the response.
- `cli:cli/change-artifact-instruction`: Add `template` field to the CLI JSON output.
- `core:core/schema-format`: Update the `design` artifact to require `[proposal, specs, verify]` instead of just `[proposal]`, and update the `implementing` workflow step to require all artifacts instead of just `[tasks]`. Update the `implementing-guidance` hook to reference all change artifacts, not just tasks.md.

## Impact

- **`packages/cli/src/commands/schema/show.ts`** — both text and JSON formatters need updating.
- **`packages/core/src/application/use-cases/get-artifact-instruction.ts`** — read template content and include in response.
- **`packages/cli/src/commands/change/artifact-instruction.ts`** — pass through the new `template` field.
- **`packages/schema-std/schema.yaml`** — the `design` artifact requires and instruction, the `tasks` artifact instruction and format, and the `implementing` step requires and hook instruction.
- **`packages/schema-std/templates/tasks.md`** — task format template with `Approach:` placeholder.

## Open questions

None.
