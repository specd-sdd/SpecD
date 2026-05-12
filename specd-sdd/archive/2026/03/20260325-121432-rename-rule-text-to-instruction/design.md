# Design: rename-rule-text-to-instruction

## Affected areas

### `packages/core/src/infrastructure/schema-yaml-parser.ts` — Zod schema

Line 101-104: `RuleEntryZodSchema` — rename `text: z.string()` to `instruction: z.string()`.

### `packages/core/src/domain/services/build-schema.ts` — raw types

Line 107-110: `RuleEntryRaw` — rename `text: string` to `instruction: string`.

### `packages/core/src/domain/value-objects/artifact-type.ts` — domain types

Line 8-11: `RuleEntry` — rename `text: string` to `instruction: string`.

### `packages/core/src/application/use-cases/get-artifact-instruction.ts` — consumer

Lines 118, 170: `r.text` → `r.instruction`.

### `packages/schema-std/schema.yaml` — schema definition

All artifact rule entries use `text:` — rename to `instruction:`.

### `packages/core/src/domain/services/merge-schema-layers.ts` — merge-layer intermediate data

Merge operations manipulate `SchemaYamlData` entries directly, including artifact
rules. The renamed `{ id, instruction }` shape must remain consistent through
append/prepend/set examples and fixtures in this layer.

### `specd.yaml` — rollout update

Any local `schemaOverrides` artifact rule entries that still use `text:` must be
updated during implementation so the project config stays compatible with the
renamed schema field.

### Documentation and JSDoc — rollout update

Any docs, JSDoc comments, examples, or guides under `docs/` that describe artifact
rule entries must be reviewed during implementation and updated where they still
show the old `text:` field. The rename is small, but stale examples would create
the same misconfiguration this change is trying to eliminate.

## Approach

Pure mechanical rename. The field name `text` becomes `instruction` in every layer:

1. Zod validation schema (`RuleEntryZodSchema`) — this is the entry point for external YAML. After the rename, any schema or config still using `text:` will get a clear Zod error: `instruction: required`.
2. Zod-inferred type (`RuleEntryRaw` in schema-yaml-parser) — follows automatically from the Zod schema change.
3. Domain raw type (`RuleEntryRaw` in build-schema) — must match the Zod output.
4. Domain value object (`RuleEntry` in artifact-type) — the final domain type.
5. Merge-layer intermediate handling (`merge-schema-layers`) — must preserve the
   renamed rule-entry shape in examples and append/prepend/set flows.
6. Consumer (`GetArtifactInstruction`) — references `r.text`, becomes `r.instruction`.
7. Schema YAML (`schema-std/schema.yaml`) — all `text:` entries in artifact rules.
8. Project config (`specd.yaml`) — update local `schemaOverrides` rule entries to `instruction:`.
9. Documentation/JSDoc (`docs/`, code comments) — update any artifact-rule examples or descriptions that still say `text:`.

No behavioral change. No new constructs. The Zod schema already validates the field as required — after the rename, using the old `text:` field produces a clear validation error at schema load time.

## Key decisions

**Decision: rename only, no backward compatibility shim** → The old field name `text` was never part of a public API — it's an internal schema format detail. A clean rename with a clear error for old usage is better than supporting both field names.

## Testing

### Automated tests

Tests that reference `text` in rule entries need the field renamed to `instruction`:

- `packages/core/test/domain/services/build-schema.spec.ts` — any test constructing `RuleEntryRaw` objects
- `packages/core/test/infrastructure/schema-yaml-parser.spec.ts` — any test constructing rule entries in YAML
- `packages/core/test/domain/services/merge-schema-layers.spec.ts` — any test constructing artifact rule entries in merge layers
- `packages/core/test/application/use-cases/get-artifact-instruction.spec.ts` — add or update rule-expansion assertions so the renamed field is covered
- `docs/` and relevant JSDoc comments — check for stale examples or prose that still reference `{ id, text }`

### Manual verification

```bash
node packages/cli/dist/index.js schema validate
# Should pass — schema-std uses instruction: after rename

node packages/cli/dist/index.js change artifact-instruction rename-rule-text-to-instruction --format json
# Should return rule blocks and instruction data without crashing on undefined rule content
```
