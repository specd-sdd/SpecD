# Proposal: schema-show-full-output

## Motivation

The `schema show` command is the primary way for agents and users to understand what a schema defines, yet it only displays a structural summary — artifact IDs, scopes, and workflow gates. The actual content that drives the specd workflow (instructions, rules, validations, hooks, templates, metadata extraction) is invisible, forcing users to read raw YAML files to understand what their schema actually does.

## Current behaviour

`schema show` outputs a compact summary in both text and JSON formats:

- **Per artifact:** `id`, `scope`, `optional`, `requires`, `output`, `description`, and a boolean `hasTaskCompletionCheck`.
- **Per workflow step:** `step` and `requires`.
- **Excluded:** `instruction`, `deltaInstruction`, `rules` (pre/post), `validations`, `deltaValidations`, `preHashCleanup`, `taskCompletionCheck` (full config), `template` content, workflow `hooks` (pre/post), `requiresTaskCompletion`, and `metadataExtraction`.

The spec explicitly constrains this: "Artifact `instruction`, `deltaInstruction`, `validations`, and `template` are not included in the output — this command focuses on structure, not content."

There is also no way to view the raw, unmerged schema YAML — the command always resolves the extends chain, applies plugins and overrides, and returns a fully constructed `Schema` entity.

## Proposed solution

Three changes to `schema show`:

1. **Full output by default** — show all schema fields in both text and JSON formats as a faithful serialization of the `Schema` entity. The output follows the schema format automatically — if fields are added or removed from the schema, the output reflects it without spec changes. The `template` field always appears, showing the reference path by default (e.g. `templates/proposal.md`).
2. **`--templates` flag** — resolves template references and replaces them with the full file content instead of the reference path.
3. **`--raw` flag** — show the schema's parsed YAML data without resolving the extends chain, applying plugins, or merging overrides. Useful for debugging schema inheritance. Compatible with `--templates` — when both are used, template file references in the raw schema are resolved and their content included.

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/schema-show`: Remove the constraint that limits output to structural metadata. Add `--templates` and `--raw` flags. Update text and JSON output format documentation to include all schema fields.
  - Depends on (added): none
- `core:core/get-active-schema`: Add support for returning raw (unresolved) schema data alongside the resolved `Schema` entity, to support `--raw` mode.
  - Depends on (added): none

## Impact

- **CLI package** (`packages/cli/src/commands/schema/show.ts`): The command handler needs expanded serialization for both text and JSON formats, new CLI options, and a code path for `--raw` mode.
- **Core package** (`packages/core/src/application/use-cases/get-active-schema.ts`): Needs a way to return raw `SchemaYamlData` (parsed but unresolved) for the `--raw` flag. The domain model (`Schema`, `ArtifactType`, `WorkflowStep`) already exposes all fields needed for full output — no changes needed there.
- **No breaking changes** — the JSON output gains new fields but existing fields remain unchanged. Text output changes layout but is not a machine contract.

## Technical context

- The `Schema` entity already exposes all needed data via its public API: `artifacts()` returns `ArtifactType[]` with `instruction`, `rules`, `validations`, `deltaValidations`, `deltaInstruction`, `preHashCleanup`, `taskCompletionCheck`, `template`; `workflow()` returns `WorkflowStep[]` with `hooks` and `requiresTaskCompletion`; `metadataExtraction()` returns the full extraction config.
- For `--raw` mode, `GetActiveSchema` currently only returns a `Schema` entity. The raw `SchemaYamlData` is available inside the resolution pipeline but not exposed. The use case (or a new companion) needs to surface the parsed-but-unresolved data.
- `SchemaRegistry.resolveRaw()` returns `{ ref, data, templates }` — the `data` field is `SchemaYamlData`, which is the intermediate before `buildSchema()`. This is the natural source for `--raw` output.
- `--raw` should work with all three modes (project, ref, file) — it shows what the specific schema file declares before any merging.
- Impact analysis shows LOW risk — `show.ts` has no downstream dependents.

## Open questions

None — all resolved during proposal discussion.

**Resolved:** `--raw` in project mode shows the parsed data from the base schema file referenced in `specd.yaml`, without resolving `extends`, `schemaPlugins`, or `schemaOverrides`.
