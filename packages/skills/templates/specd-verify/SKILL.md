# specd-verify — check implementation against specs

Read @shared.md before doing anything.

## What this does

Runs through verification scenarios for each spec in the change. If all pass,
transitions to `done`. If any fail, loops back to implementing.

## Steps

### 1. Load change state

```bash
specd change status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`OVERLAP_CONFLICT`, `REVIEW_REQUIRED`) and inform the user. Follow the **next action:**
command recommendation.

Extract the `path:` field from the "lifecycle:" section.

If the status output shows `review: required: yes`, tell the user:

> Artifacts need review before verification can continue. Run `/specd-design <name>`.

**Stop — do not continue.**

If not in `implementing`, `verifying`, or `done`, this is the wrong skill.
Redirect based on the **next action:** `target` recommendation.

**Stop — do not continue.**

### 2. Enter verification (or resume)

**If in `implementing`** (normal entry from `/specd-implement`):

Run pre-hooks and transition:

```bash
specd change run-hooks <name> verifying --phase pre
specd change hook-instruction <name> verifying --phase pre --format text
```

Follow guidance.

```bash
specd change transition <name> verifying --skip-hooks all
```

If it fails, follow the **Repair Guide** output.

**If in `verifying`** (resuming): run pre-hooks but skip the transition:

```bash
specd change run-hooks <name> verifying --phase pre
specd change hook-instruction <name> verifying --phase pre --format text
```

**If in `done`**: skip directly to step 6a (transition to archivable path).

Continue to step 3.

### 3. Load verification context

```bash
specd change context <name> verifying --follow-deps --depth 1 --scenarios --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `change context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If output says `unchanged`, use the context already in memory.

**MUST follow** — project context entries are binding directives. If lazy mode returns
summary specs, evaluate each one and load any that are relevant to the scenarios you're
about to verify (see `shared.md` — "Processing `change context` output").

### 3b. Get merged specs with deltas applied

For each spec in the change, use `spec-preview` to get the final merged spec content
with deltas applied:

```bash
specd change spec-preview <name> <specId> --format toon
```

This merged view is what you should verify against.

### 4. Verify each scenario

For each spec in the change, read the merged spec content from step 3b. Then verify
each scenario against:

1. The **merged spec** (from `spec-preview`)
2. The **verification scenarios** in the merged `verify.md`

For each scenario:

- Inspect the implementation code
- Run relevant tests if applicable
- Confirm GIVEN/WHEN/THEN conditions are satisfied using the merged spec content

### 5. Run exit hooks — immediately after last scenario verified

The moment all scenarios have been evaluated, run the post-verifying hooks:

```bash
specd change run-hooks <name> verifying --phase post
specd change hook-instruction <name> verifying --phase post --format text
```

Follow guidance. If hooks fail, fix and re-run.

### 6. Report results and transition

Present findings to the user.

**If any fail:**

First classify the failure:

- **Implementation-only failure** —artifacts still correct
- **Artifact review required** — desired behavior changed or artifacts wrong

Before choosing a transition, reload status:

```bash
specd change status <name> --format text
```

If the fresh status shows `review: required: yes`, do NOT route back to
`implementing`. Tell the user to run `/specd-design <name>` and **stop**.

If this is an implementation-only failure:

```bash
specd change transition <name> implementing --skip-hooks all
```

Tell the user to run `/specd-implement <name>` to fix the implementation. **Stop.**

If this is artifact review required:

```bash
specd change transition <name> designing --skip-hooks all
```

Tell the user to run `/specd-design <name>` to update them. **Stop.**

**If all pass:** transition through `done` and the signoff gate to reach `archivable`.

#### 6a. Transition to done

Run done pre-hooks, then transition:

```bash
specd change run-hooks <name> done --phase pre
specd change hook-instruction <name> done --phase pre --format text
```

Follow guidance.

```bash
specd change transition <name> done --skip-hooks all
```

Run done post-hooks:

```bash
specd change run-hooks <name> done --phase post
specd change hook-instruction <name> done --phase post --format text
```

#### 6b. Handle signoff gate

Run `change status <name> --format text` and check `approvals:` line.

**If signoff=off:** no signoff needed — run archivable hooks and transition:

```bash
specd change run-hooks <name> archivable --phase pre
specd change hook-instruction <name> archivable --phase pre --format text
```

Follow guidance.

```bash
specd change transition <name> archivable --skip-hooks all
```

```bash
specd change run-hooks <name> archivable --phase post
specd change hook-instruction <name> archivable --phase post --format text
```

**If signoff=on:** transition routes to `pending-signoff`. Tell user:

> Signoff required. Run: `specd change approve signoff <name> --reason "..."`
> Then: `/specd-archive <name>`

**Stop.**

> All scenarios pass. Change is ready to archive. Run `/specd-archive <name>`.

**Stop.**

## Session tasks

1. `Load state & hooks`
2. `Load verification context`
3. For each spec: `Verify: <specId>`
4. `Report results & transition`

## Handling failed transitions

When `change transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

**Stop — do not continue after redirecting.**

## Returning to design

If during verification you discover that the artifacts need revision, stop and explain.
If the user agrees:

```bash
specd change transition <name> designing --skip-hooks all
```

> Artifacts need revision. Run `/specd-design <name>` to update them.

**Stop — do not continue verifying.**

## Guardrails

- Verify against scenarios from the compiled context
- Run actual tests where applicable
- Any time a fresh `change status` shows `review: required: yes`, stop
  verification and redirect to `/specd-design <name>`
