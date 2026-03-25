# Phase C — Implementing

Mark "Implement" task as `in_progress`.

---

## C.1 Load schema, context, and hook instructions

First, identify the task-tracking artifact(s) from the schema:

```bash
node packages/cli/dist/index.js schema show --format json
```

Find every artifact where `hasTaskCompletionCheck` is `true` — those are the files with
trackable checkboxes. Note their `output` field to know the filename(s).

Then load context and hook instructions:

```bash
node packages/cli/dist/index.js change context <name> implementing --follow-deps --depth 1 --rules --constraints --format text
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any relevant to the code you're about to write
(see `shared.md` — "Processing `change context` output").

**Follow the pre-hook instructions carefully** — they tell you which change artifacts to
read and what role each one plays. Read all of them from the change directory before
starting work.

### C.1b Create implementation subtasks

After reading the task-tracking artifact(s), parse every checkbox line (`- [ ] ...`).
For each one, create a subtask using `TaskCreate`:

- **subject**: `"Implement: <checkbox text>"` — prefixed so it's visually grouped
- **description**: the full checkbox text plus any relevant context from the design artifact
- **blockedBy**: the "Implement" parent task ID (so they appear nested)

Example — if the task artifact has:

```
- [ ] Add validation to schema parser
- [ ] Update error messages
- [ ] Add unit tests for parser
```

Create three tasks:

1. `"Implement: Add validation to schema parser"`
2. `"Implement: Update error messages"` (blockedBy: 1)
3. `"Implement: Add unit tests for parser"` (blockedBy: 2)

Chain them sequentially with `blockedBy` so they reflect the intended order from the
artifact. As you complete each subtask, mark it `completed` **and** update the checkbox
in the artifact file (`- [ ]` → `- [x]`).

## C.2 Work through the implementation

Work through subtasks one by one. For each subtask:

1. Mark the subtask as `in_progress` with `TaskUpdate`
2. Do the implementation work
3. Mark the checkbox done (`- [ ]` → `- [x]`) in the task-tracking artifact
4. Mark the subtask as `completed` with `TaskUpdate`

**Update both the artifact checkbox and the subtask status after each item.** Do not
batch updates — the file and task list must reflect progress in real time so the user
(and the transition gate) can see what has been done.

Use the change artifacts as your references (as directed by the hook instructions).
The compiled context contains the spec content — use it alongside the change artifacts.

If any task is ambiguous, consult the design artifact first — it is the source of truth
for implementation approach. If still unclear, ask the user before proceeding.

## C.2b Scope reconciliation during implementation

While implementing, you may discover that the actual code changes touch areas not
covered by the change's specs, or that specs originally in scope are not actually
affected. This is normal — designing is speculative, implementation is concrete.

**After completing each task** (and updating the checkbox), briefly assess whether the
code you just wrote touches modules, adapters, or domain concepts outside the change's
current specIds or dependencies. If it does:

1. Cross-reference against existing specs:

   ```bash
   node packages/cli/dist/index.js spec list --format text --summary
   ```

2. Surface findings to the user:

   > While implementing `<task>`, I touched `<module/area>`. This is covered by spec
   > `<workspace>:<path>` which is not in this change's scope.
   >
   > - Should I **add it as a modified spec**? (requires going back to designing for a delta)
   > - Or register it as a **dependency**? (context only)
   > - Or is this incidental and can be ignored?

3. If the user wants to add a modified spec, this requires returning to designing:

   ```bash
   node packages/cli/dist/index.js change edit <name> --add-spec <workspace>:<path>
   ```

   Note: `change edit` may reset the state to `designing` and invalidate approvals.
   The artifact loop must run again for the new spec's artifacts. Inform the user of
   this cost before proceeding.

4. If it's just a dependency:

   ```bash
   node packages/cli/dist/index.js change deps <name> <specId> --add <dep-spec-id>
   ```

5. If the implementation reveals that a spec in the change is **not actually being
   modified** (the design was wrong about scope), flag it:
   > Spec `<specId>` is in this change but I haven't needed to modify anything it
   > covers. Should I remove it from scope?

Do not block implementation for minor scope questions — batch them if several arise
in quick succession and present them together. But do surface them before transitioning
to verifying, as verification checks against the declared scope.

## C.3 Run hooks

```bash
node packages/cli/dist/index.js change run-hooks <name> implementing --phase post
```

If hooks fail, fix the issue and re-run.

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase post --format text
```

Follow the guidance there.

## C.4 Transition to verifying

```bash
node packages/cli/dist/index.js change hook-instruction <name> verifying --phase pre --format text
```

Follow the guidance there.

The transition enforces task completion — if any artifact with `taskCompletionCheck`
has incomplete items, it will fail:

```bash
node packages/cli/dist/index.js change transition <name> verifying --skip-hooks source.post
```

If it fails with `InvalidStateTransitionError`, show which items are still incomplete
and continue working.

Mark "Implement" task as `completed`.

**Next:** Read `phase-verifying.md` and continue to Phase D.
