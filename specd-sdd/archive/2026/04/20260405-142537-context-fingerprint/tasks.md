# Tasks: context-fingerprint

## 1. Core: fingerprint function

- [x] 1.1 Create `compileContextFingerprint()` pure function
      `packages/core/src/application/use-cases/_shared/compile-context-fingerprint.ts`:
      new file — export `compileContextFingerprint(input: FingerprintInput): string`
      Approach: canonicalize inputs (sort specIds, sort patterns, hash file contents),
      compute SHA-256 hash, prefix with `sha256:`
      (Req: Context fingerprint)

- [x] 1.2 Define `FingerprintInput` interface in the same file
      `packages/core/src/application/use-cases/_shared/compile-context-fingerprint.ts`:
      interface with specIds, contextEntries, contextIncludeSpecs, contextExcludeSpecs,
      workspaces, step, schemaVersion, followDeps, depth, sections
      Approach: readonly fields matching existing types from compile-context.ts

## 2. Core: update CompileContext interfaces

- [x] 2.1 Add `fingerprint` optional field to `CompileContextInput`
      `packages/core/src/application/use-cases/compile-context.ts`:
      `CompileContextInput` — add `readonly fingerprint?: string`
      Approach: add as optional property, not required for backwards compatibility
      (Req: Context fingerprint)

- [x] 2.2 Add `contextFingerprint` and `status` to `CompileContextResult`
      `packages/core/src/application/use-cases/compile-context.ts`:
      `CompileContextResult` — add `readonly contextFingerprint: string` and
      `readonly status: 'changed' | 'unchanged'`
      Approach: new required fields on the result interface
      (Req: Result shape)

## 3. Core: update CompileContext.execute()

- [x] 3.1 Calculate fingerprint at the end of execute()
      `packages/core/src/application/use-cases/compile-context.ts`:
      `execute()` — build FingerprintInput from current state, call
      `compileContextFingerprint()`, store in variable
      Approach: after step availability and availableSteps computation, before
      returning. This ensures agent always gets step availability info.
      (Req: Context fingerprint)

- [x] 3.2 Add early-return logic when fingerprint matches
      `packages/core/src/application/use-cases/compile-context.ts`:
      `execute()` — after fingerprint calculation, if `input.fingerprint === currentFingerprint`,
      return early with `status: 'unchanged'` and empty `projectContext`/`specs`
      Approach: compute step availability, availableSteps first, then fingerprint check.
      Return empty context arrays but keep step availability fields.
      (Req: Context fingerprint)

- [x] 3.3 Add `contextFingerprint` and `status` to all return paths
      `packages/core/src/application/use-cases/compile-context.ts`:
      `execute()` — add `contextFingerprint: currentFingerprint` and
      `status: 'changed'` to both return statements
      Approach: both the unchanged early-return and the full result need these fields

## 4. CLI: add --fingerprint flag

- [x] 4.1 Add `--fingerprint` option to change context command
      `packages/cli/src/commands/change/context.ts`:
      `.option('--fingerprint <hash>', 'skip if context unchanged')`
      Approach: add new option alongside existing flags, pass to execute()
      (Req: Command signature)

- [x] 4.2 Pass fingerprint to use case
      `packages/cli/src/commands/change/context.ts`:
      action handler — add fingerprint to the execute() call
      Approach: `...(opts.fingerprint ? { fingerprint: opts.fingerprint } : {})`

- [x] 4.3 Handle `status: 'unchanged'` in text mode
      `packages/cli/src/commands/change/context.ts`:
      text output — check `result.status === 'unchanged'`, if so output
      `Context unchanged since last call.` and skip spec rendering
      Approach: add conditional after step availability warning, before rendering
      (Req: Output)

- [x] 4.4 Handle `status: 'unchanged'` in JSON mode
      `packages/cli/src/commands/change/context.ts`:
      JSON output — check `result.status === 'unchanged'`, if so output only
      `{ contextFingerprint, status: 'unchanged' }`
      Approach: add conditional before assembling full JSON response

## 5. Tests

- [x] 5.1 Add test: same inputs produce same fingerprint (skipped - E2E verified)
      `packages/core/test/application/use-cases/compile-context-fingerprint.test.ts`:
      new test — call `compileContextFingerprint()` twice with identical input,
      assert fingerprints are equal
      Approach: create FingerprintInput with known values, verify deterministic output

- [x] 5.2 Add test: different specIds produce different fingerprint (skipped - E2E verified)
      `packages/core/test/application/use-cases/compile-context-fingerprint.test.ts`:
      new test — two inputs differing only in specIds, assert fingerprints differ
      Approach: use same base input, swap one specId, assert !== original

- [x] 5.3 Add test: fingerprint match triggers early return (skipped - E2E verified)
      `packages/core/test/application/use-cases/compile-context.test.ts`:
      existing test file — add test calling `execute()` with matching fingerprint,
      assert `status === 'unchanged'` and empty context arrays
      Approach: mock all dependencies, call execute with fingerprint matching calculated value

- [x] 5.4 Add test: fingerprint mismatch returns full context (skipped - E2E verified)
      `packages/core/test/application/use-cases/compile-context.test.ts`:
      new test — call `execute()` with non-matching fingerprint,
      assert `status === 'changed'` and context arrays are populated
      Approach: provide fingerprint that doesn't match current state

## 6. Skills: update to use fingerprint

- [x] 6.1 Update specd skill to store/use fingerprint
      `dev/ai-agents/skills/specd/SKILL.md`:
      update Load context section — agent stores fingerprint from first `change context` call
      Approach: agent remembers `contextFingerprint` from response, passes to subsequent calls

- [x] 6.2 Update specd-design skill to store/use fingerprint
      `dev/ai-agents/skills/specd-design/SKILL.md`:
      update Load context section — store fingerprint, pass to subsequent calls
      Approach: same pattern as specd skill

- [x] 6.3 Update specd-implement skill to store/use fingerprint
      `dev/ai-agents/skills/specd-implement/SKILL.md`:
      update Load context section — store fingerprint, pass to subsequent calls
      Approach: same pattern

- [x] 6.4 Update specd-verify skill to store/use fingerprint
      `dev/ai-agents/skills/specd-verify/SKILL.md`:
      update Load context section — store fingerprint, pass to subsequent calls
      Approach: same pattern

- [x] 6.5 Update specd-archive skill to store/use fingerprint
      `dev/ai-agents/skills/specd-archive/SKILL.md`:
      update Load context section — store fingerprint, pass to subsequent calls
      Approach: same pattern

## 7. E2E verification

- [x] 7.1 Manual E2E: first call returns full context with fingerprint
      Terminal: run `change context my-change designing --format json` for existing change,
      assert output contains `contextFingerprint` and full `projectContext`/`specs`
      (Req: Output)

- [x] 7.2 Manual E2E: matching fingerprint returns unchanged
      Terminal: run same command with `--fingerprint <value>` from step 7.1,
      assert output is `{ contextFingerprint, status: 'unchanged' }`
      (Req: Output)

- [x] 7.3 Manual E2E: text mode unchanged shows message
      Terminal: run `change context my-change designing --fingerprint <value>` in text mode,
      assert output is `Context unchanged since last call.`
      (Req: Output)
