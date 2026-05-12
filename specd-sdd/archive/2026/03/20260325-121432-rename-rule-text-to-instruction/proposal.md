# Proposal: rename-rule-text-to-instruction

## Motivation

Artifact rules use `{ id, text }` for constraint entries, while workflow hooks use `{ id, instruction }`. If a user writes `instruction:` instead of `text:` in an artifact rule (e.g. in `schemaOverrides`), Zod silently strips the unknown key and the `text` field becomes `undefined`. This causes a cryptic runtime crash (`Cannot read properties of undefined (reading 'replace')`) deep in `TemplateExpander`, far from the actual misconfiguration.

The field should be renamed from `text` to `instruction` for consistency with hooks, and validation should catch missing fields early.

## Current behaviour

- `RuleEntryZodSchema` requires `{ id: string, text: string }` but does not use `.strict()`, so extra keys like `instruction` are silently stripped.
- When a rule entry has `instruction:` instead of `text:`, Zod validation passes (the object is `{ id }` after stripping), but later `r.text` is `undefined` and crashes in `TemplateExpander.expand()`.
- The error message is `Cannot read properties of undefined (reading 'replace')` — no indication of which rule or artifact caused it.

## Proposed solution

1. **Rename** the field from `text` to `instruction` in all layers: Zod schema (`RuleEntryZodSchema`), raw types (`RuleEntryRaw`), domain types (`RuleEntry`), merge-layer intermediate data, and all consumers (`GetArtifactInstruction`).
2. **Update** the schema-std `schema.yaml` to use `instruction:` in all artifact rule entries.
3. **Validation** already catches missing required fields via Zod — after the rename, writing `text:` instead of `instruction:` will produce a clear Zod validation error (`instruction: required`) at schema load time.

## Specs affected

### Modified specs

- `core:core/schema-format`: rename `text` to `instruction` in the artifact rules requirement (the `{ id, text }` entry shape).
- `core:core/build-schema`: rename `text` to `instruction` in `RuleEntryRaw` interface and the `buildArtifactType` sub-function.
- `core:core/parse-schema-yaml`: rename `text` to `instruction` in `RuleEntryZodSchema`.
- `core:core/schema-merge`: rename `text` to `instruction` in merge-layer examples and verification scenarios for artifact rules.

## Impact

- **Core package**: rename in Zod schema, raw types, domain types, merge-layer handling, and `GetArtifactInstruction` consumer.
- **Schema-std package**: rename `text:` → `instruction:` in all artifact rule entries in `schema.yaml`.
- **specd.yaml**: `schemaOverrides` entries using artifact rules must be updated alongside the implementation so local project overrides use `instruction:` too.
- **Documentation**: any user-facing docs, internal docs under `docs/`, and JSDoc comments that describe artifact rule entries or examples must be updated if they still mention `text:`.
- **Breaking**: any external schema or config using `text:` in artifact rules will get a clear Zod error instead of silently working.
