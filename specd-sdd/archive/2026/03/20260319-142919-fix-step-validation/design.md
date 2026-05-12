# Design: Add archiving as a ChangeState

## Affected areas

### 1. `packages/core/src/domain/value-objects/change-state.ts` — ChangeState + VALID_TRANSITIONS

Add `'archiving'` to the `ChangeState` union. Add `archivable: ['archiving', 'designing']` and `archiving: []` to `VALID_TRANSITIONS`.

### 2. `packages/core/src/domain/services/build-schema.ts` — workflow step validation (line 467–476)

After the duplicate step check, add validation that each workflow step name is a valid `ChangeState`. Throw `SchemaValidationError` if not.

### 3. `packages/core/src/application/use-cases/archive-change.ts` — execute() (line 142)

After `change.assertArchivable()`, add `change.transition('archiving', actor)` and `await this._changes.save(change)` before pre-hooks.

### 4. `packages/core/test/domain/value-objects/change-state.spec.ts`

Update existing tests: `archivable` now transitions to `['archiving', 'designing']`. Add `archiving` to ALL_STATES. Add test for `archiving` having no transitions.

### 5. `packages/core/test/application/use-cases/archive-change.spec.ts`

Update tests that assert `archivable` state to also verify the transition to `archiving`.

### 6. `packages/core/test/application/use-cases/run-step-hooks.spec.ts`

The existing "invalid step" test already uses `'not-a-state'` which is correct. Add a test for `step: 'archiving'` being accepted.

### 7. `packages/core/test/domain/services/build-schema.spec.ts` (if exists)

Add test for invalid workflow step name rejection.

## Approach

Bottom-up: domain first, then use case, then tests.

**Step 1 — Add `archiving` to `ChangeState`.** Add to the union type and to `VALID_TRANSITIONS`: `archivable → ['archiving', 'designing']`, `archiving → []`. This is the key change — once `archiving` is a `ChangeState`, the hook use cases accept it automatically.

**Step 2 — Validate step names in `buildSchema`.** After the duplicate check (line 476), iterate workflow steps and verify each `step.step` is a valid `ChangeState` using `Object.keys(VALID_TRANSITIONS)`. Throw `SchemaValidationError` if not.

**Step 3 — Transition to `archiving` in `ArchiveChange`.** After `change.assertArchivable()` (line 142), resolve actor, call `change.transition('archiving', actor)`, save. This must happen before pre-hooks so the change is in `archiving` state when hooks run.

**Step 4 — Update tests.** Fix existing tests broken by the new state, add new coverage.

## Key decisions

**Decision: `archiving` has no outgoing transitions (`[]`).**
→ It's the last `ChangeState` before the change becomes an `ArchivedChange`. No need to transition out — the archive operation removes it from the change repository.
→ **Alternative rejected:** Having `archiving → archived` — `archived` is not a `ChangeState`, it's an `ArchivedChange` entity.

**Decision: `archivable` transitions to `['archiving', 'designing']` not `['designing']`.**
→ The previous change added `designing` to archivable. Now we also need `archiving` as the forward path.

## Testing

### Automated tests

**File:** `packages/core/test/domain/value-objects/change-state.spec.ts`

- Update `archivable` test: now allows `archiving` and `designing`
- Add `archiving` to `ALL_STATES` and `it.each` transition table
- Add test: `archiving` has no valid transitions

**File:** `packages/core/test/application/use-cases/archive-change.spec.ts`

- Update tests: after execute, change should be in `archiving` state (not `archivable`)
- Add test: verify `transition('archiving')` is called before pre-hooks

**File:** `packages/core/test/application/use-cases/run-step-hooks.spec.ts`

- Add test: `step: 'archiving'` is accepted (does not throw `StepNotValidError`)

**File:** `packages/core/test/domain/services/build-schema.spec.ts`

- Add test: workflow step with invalid name throws `SchemaValidationError`

### Manual verification

```bash
pnpm build
node packages/cli/dist/index.js change hook-instruction <name> archiving --phase pre --format text
node packages/cli/dist/index.js change archive <name>
```

## Open questions

None.
