# Phase D — Verifying

Mark "Verify" task as `in_progress`.

---

## D.1 Load context and hook instructions

```bash
node packages/cli/dist/index.js change context <name> verifying --follow-deps --depth 1 --scenarios --format text
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase pre --format text
```

## D.2 Verify against scenarios

Read the verification artifacts for each spec in the change. For each scenario:

- Inspect the implementation
- Run relevant tests
- Confirm GIVEN/WHEN/THEN conditions are satisfied

## D.3 Verification result

**If all scenarios pass:**

Run post-phase hooks before transitioning:

```bash
node packages/cli/dist/index.js change run-hooks <name> verifying --phase post
```

If hooks fail, fix the issue and re-run.

```bash
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase post --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change hook-instruction <name> done --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> done --skip-hooks source.post
```

Mark "Verify" task as `completed`.

**Next:** Read `phase-signoff.md` and continue to Phase E.

**If any scenario fails:** loop back to implementing — the transition clears artifact
validation state for implementing's requires:

```bash
node packages/cli/dist/index.js change transition <name> implementing
```

Mark "Verify" task back to `in_progress`. Re-mark "Implement" task as `in_progress`.
Inform the user which scenarios failed and what needs fixing.

**Next:** Read `phase-implementing.md` and return to Phase C.
