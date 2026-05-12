# Design: noop-delta

## Affected areas

### 1. `DeltaEntry` interface — `packages/core/src/application/ports/artifact-parser.ts`

Add `'no-op'` to the `op` union type and add `description?: string` field. The `op` type changes from `'added' | 'modified' | 'removed'` to `'added' | 'modified' | 'removed' | 'no-op'`.

### 2. Zod schema + `parseDelta` — `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts`

- `deltaEntrySchema`: add `'no-op'` to the `op` enum, add `description: z.string().optional()`
- `deltaArraySchema`: add a `.superRefine()` to enforce exclusivity — if any entry has `op: 'no-op'` and the array length > 1, throw `SchemaValidationError` explaining that `no-op` cannot be mixed with other operations
- Add a refinement on `no-op` entries: reject if any of `selector`, `position`, `rename`, `content`, `value`, `strategy`, `mergeKey` are present

The validation happens at parse time in `parseDelta()`, which already throws `SchemaValidationError` on Zod failures. The `.superRefine()` integrates with this existing error path.

### 3. `ValidateArtifacts` — `packages/core/src/application/use-cases/validate-artifacts.ts`

In the delta processing block (around line 256), after detecting a delta file and parsing it via `parseDelta`, add an early check: if all entries are `no-op`, skip `deltaValidations`, skip delta application preview (`parser.apply`), skip structural `validations`, and go directly to hash computation + `markComplete` on the raw delta file content.

The check is: `const isNoOp = deltaEntries.length > 0 && deltaEntries.every(e => e.op === 'no-op')`. Since `parseDelta` already enforces that `no-op` is exclusive, in practice this is `deltaEntries.length === 1 && deltaEntries[0].op === 'no-op'`.

When `isNoOp` is true:

1. Skip `deltaValidations` evaluation
2. Skip loading base spec from `SpecRepository`
3. Skip `parser.apply()`
4. Skip `validations[]` evaluation
5. Read raw delta file content, apply `preHashCleanup`, compute hash, call `markComplete`

### 4. Parser `deltaInstructions()` methods

Each parser's `deltaInstructions()` return string needs a section about `no-op` and `description`. Affected files:

- `packages/core/src/infrastructure/artifact-parser/markdown-parser.ts` — `deltaInstructions()` (~line 667)
- `packages/core/src/infrastructure/artifact-parser/yaml-parser.ts` — `deltaInstructions()` (~line 435)
- `packages/core/src/infrastructure/artifact-parser/json-parser.ts` — `deltaInstructions()` (~line 278)
- `packages/core/src/infrastructure/artifact-parser/plaintext-parser.ts` — `deltaInstructions()` (~line 137)

Add two separate blocks to each:

```
### Description Field

All delta entries accept an optional `description` field (string) to document what
the entry does or why. It is ignored during application.

\`\`\`yaml
- op: modified
  description: "Update constructor to accept SchemaProvider"
  selector:
    type: section
    matches: 'Requirement: Constructor'
  content: |
    ...
\`\`\`

### No-op Operation

Use `op: no-op` when the artifact requires no changes for this spec. A `no-op` entry
must be the only entry in the delta array. It accepts only `op` and optionally
`description` — no other fields are valid.

\`\`\`yaml
- op: no-op
  description: "Existing scenarios remain valid — no changes needed"
\`\`\`
```

### 5. Schema `deltaInstruction` — `packages/schema-std/schema.yaml`

The `deltaInstruction` fields for `spec.md` and `verify.md` artifacts should mention that `no-op` is available when a spec doesn't need changes for that artifact. Add guidance like:

```
If a spec listed in the proposal does not need changes to this artifact (e.g.
existing content is already valid), create a no-op delta instead of skipping the
file:

    deltas/<workspace>/<capability-path>/<filename>.delta.yaml:
    - op: no-op
      description: "<reason why no changes are needed>"
```

### 6. `Selector` value object — `packages/core/src/domain/value-objects/selector.ts`

No changes needed. `no-op` has no selector.

### 7. `applyDelta` — `packages/core/src/infrastructure/artifact-parser/_shared/apply-delta.ts`

Add defensive handling: if all entries in the delta array are `no-op`, return a deep clone of the input AST without resolving selectors or applying operations. This is not the primary path (the `ValidateArtifacts` bypass prevents `no-op` from reaching `apply` in normal flow), but it protects against misuse if `apply` is called directly from other contexts (e.g. `ArchiveChange`, tests, future callers).

## New constructs

No new files, classes, or interfaces. The change is purely additive to existing types and logic.

## Approach

### Order of operations

1. **`DeltaEntry` type** — expand the `op` union and add `description`. This is the foundation everything else depends on.
2. **Zod schema in yaml-parser** — update `deltaEntrySchema` and `deltaArraySchema` with validation. This ensures `parseDelta` rejects invalid `no-op` deltas at parse time.
3. **`ValidateArtifacts` bypass** — add the `isNoOp` early return in the delta processing block. This is the core behavioral change that resolves the issue.
4. **`deltaInstructions()`** — update all 4 parsers. These are pure string changes.
5. **`schema-std/schema.yaml`** — update `deltaInstruction` fields. Pure YAML text changes.
6. **Tests** — add test cases for each behavioral change.

### Spec coverage

- **delta-format / Delta file format**: covered by steps 1–2 (`DeltaEntry` type + Zod schema)
- **delta-format / Delta application**: covered by step 3 (no-op never reaches `apply`)
- **delta-format / Delta conflict detection**: covered by step 2 (Zod rejects invalid `no-op` fields)
- **artifact-parser-port / DeltaEntry shape**: covered by step 1
- **artifact-parser-port / ParseDelta contract**: covered by step 2
- **validate-artifacts / Delta validation**: covered by step 3 (bypass `deltaValidations`)
- **validate-artifacts / Delta application preview**: covered by step 3 (bypass `apply`)
- **validate-artifacts / Structural validation**: covered by step 3 (bypass `validations`)

## Key decisions

**Decision**: Validate `no-op` exclusivity in `parseDelta` (Zod schema) rather than in `applyDelta`.
→ `parseDelta` is the entry point for all delta files. Catching invalid structure here means bad deltas fail fast with a clear `SchemaValidationError` before any downstream processing. `applyDelta` has a defensive guard (deep clone on all-no-op), but the primary validation is in `parseDelta`.

**Decision**: Use Zod `.superRefine()` for the cross-entry exclusivity check rather than a post-parse manual check.
→ Zod's refinement integrates with the existing error reporting in `parseDelta`, which already formats Zod issues into `SchemaValidationError`. No new error handling needed. Alternative: manual `if` check after `safeParse` — works but duplicates error formatting.

**Decision**: The `no-op` bypass in `ValidateArtifacts` is a simple early-return, not a new method or abstraction.
→ The check is 2–3 lines. Extracting it into a method would add indirection for no benefit.

## Testing

### Automated tests

**`packages/core/test/infrastructure/artifact-parser/yaml-parser.spec.ts`**:

- `parseDelta` with `[{ op: "no-op" }]` → returns one entry with `op: "no-op"`
- `parseDelta` with `[{ op: "no-op", description: "reason" }]` → returns entry with both fields
- `parseDelta` with `[{ op: "no-op" }, { op: "modified", ... }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "no-op", selector: { ... } }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "no-op", content: "..." }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "no-op", value: 42 }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "modified", description: "...", ... }]` → parses normally, description present
- `parseDelta` with `[{ op: "no-op", position: { ... } }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "no-op", strategy: "append" }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "no-op", mergeKey: "name" }]` → throws `SchemaValidationError`
- `parseDelta` with `[{ op: "no-op", rename: "new" }]` → throws `SchemaValidationError`

**`packages/core/test/infrastructure/artifact-parser/apply-delta.spec.ts`**:

- `applyDelta` with all-no-op entries → returns deep clone of input AST, no modifications
- `applyDelta` with empty array → existing behavior (returns cloned AST)

**`packages/core/test/application/use-cases/validate-artifacts.spec.ts`**:

- no-op delta bypasses `deltaValidations` — artifact with `required: true` deltaValidation rule, no-op delta → `passed: true`, `markComplete` called
- no-op delta bypasses application preview — no `parser.apply()` call, no base spec loaded
- no-op delta bypasses structural validation — artifact with `required: true` validation rule, no-op delta → `passed: true`
- no-op delta calls `markComplete` with hash of raw delta file content
- description field on regular delta — no effect on validation behavior

### Manual / E2E verification

1. Create a change touching multiple specs:

   ```bash
   node packages/cli/dist/index.js change create test-noop --spec "core:core/kernel" --spec "core:core/run-step-hooks" --description "Test no-op"
   node packages/cli/dist/index.js change transition test-noop designing
   ```

2. Write a real spec delta for `core:core/kernel` and a no-op delta for `core:core/run-step-hooks`:

   ```yaml
   # deltas/core/core/run-step-hooks/verify.md.delta.yaml
   - op: no-op
     description: 'Existing verify scenarios remain valid'
   ```

3. Validate both:

   ```bash
   node packages/cli/dist/index.js change validate test-noop "core:core/run-step-hooks" --artifact verify
   ```

   Expected: `passed: true`

4. Check status:

   ```bash
   node packages/cli/dist/index.js change status test-noop --format json
   ```

   Expected: verify artifact for `core:core/run-step-hooks` shows `effectiveStatus: "complete"`, not `"in-progress"` or `"missing"`

5. Verify the DAG is unblocked — downstream artifacts (design, tasks) should not be blocked by verify.

6. Test error cases:
   ```yaml
   # Should fail parsing
   - op: no-op
   - op: modified
     selector: { type: section, matches: 'Foo' }
     content: 'bar'
   ```
   Expected: `SchemaValidationError` on validate
