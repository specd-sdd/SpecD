# Phase B — Review and spec approval gate

Mark "Spec approval" task as `in_progress`.

---

## B.0 Load ready hook instructions

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase pre --format text
```

Follow the guidance there.

## B.1 Mandatory review stop

**ALWAYS stop here for user review, regardless of approval gate configuration.**

Present a summary of everything designed:

```bash
node packages/cli/dist/index.js change status <name> --format json
```

The response now includes a `lifecycle` object with `availableTransitions`, `blockers`,
`approvals`, `nextArtifact`, and `changePath`. Use these fields throughout the remaining
phases instead of making separate calls.

Show the user:

- All artifacts and their statuses
- The specIds in the change
- Any registered dependencies
- Available transitions and blockers (from `lifecycle`)

Then ask:

> **Design phase complete.** Here's what was produced:
>
> | Artifact | Status |
> | -------- | ------ |
> | ...      | ...    |
>
> Specs: `<specId1>`, `<specId2>`, ...
>
> Want to review any artifact before proceeding to implementation?
> You can also request changes — I'll re-enter the design loop.
> When you're satisfied, say **"continue"** to move to implementation.

**Do NOT proceed until the user explicitly confirms.** If the user requests changes,
return to Phase A (the artifact loop) to make edits and re-validate. When editing an
artifact, apply the propagation check from A.3g — changes may cascade to upstream
and downstream artifacts.

## B.1b Run ready post hooks

After the user confirms the review:

```bash
node packages/cli/dist/index.js change run-hooks <name> ready --phase post
```

If hooks fail, fix the issue and re-run.

```bash
node packages/cli/dist/index.js change hook-instruction <name> ready --phase post --format text
```

Follow the guidance there.

## B.2 Spec approval gate

After the user confirms, check if the approval gate is active using `lifecycle.approvals`
from the status response obtained in B.1. No separate `config show` call is needed.

**If `lifecycle.approvals.spec` is `false`:** the gate is inactive. Read target pre-hook
instructions, then transition:

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change transition <name> implementing --skip-hooks source.post
```

Mark "Spec approval" task as `completed`.

**Next:** Read `phase-implementing.md` and continue to Phase C.

**If `approvals.spec: true`:** `TransitionChange` automatically reroutes to
`pending-spec-approval`. Run hooks for the new state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> pending-spec-approval --phase pre --format text
```

Follow the guidance there. The agent **cannot** approve — approval is an external
action that must happen outside this skill. Inform the user:

> This change requires spec approval before implementation can begin.
> Run externally: `specd change approve spec <name> --reason "<rationale>"`
>
> Re-invoke `/specd-v2` after approving to continue.

Run post hooks before stopping:

```bash
node packages/cli/dist/index.js change run-hooks <name> pending-spec-approval --phase post
node packages/cli/dist/index.js change hook-instruction <name> pending-spec-approval --phase post --format text
```

Follow the guidance there. Leave "Spec approval" task as `in_progress` and **stop**.

**If the change is already in `pending-spec-approval`:** run pre hooks, remind the user
that approval is pending and must be done externally, run post hooks. **Stop.**

**If the change is in `spec-approved`:** run hooks for the `spec-approved` state:

```bash
node packages/cli/dist/index.js change hook-instruction <name> spec-approved --phase pre --format text
```

Follow the guidance there. Then run post hooks and transition to implementing:

```bash
node packages/cli/dist/index.js change run-hooks <name> spec-approved --phase post
node packages/cli/dist/index.js change hook-instruction <name> spec-approved --phase post --format text
```

Follow the guidance there.

```bash
node packages/cli/dist/index.js change hook-instruction <name> implementing --phase pre --format text
```

Follow the guidance there. Then transition:

```bash
node packages/cli/dist/index.js change transition <name> implementing --skip-hooks source.post
```

Mark "Spec approval" task as `completed`.

**Next:** Read `phase-implementing.md` and continue to Phase C.
