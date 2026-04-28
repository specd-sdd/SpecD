# specd-design — write artifacts

Read @shared.md before doing anything.

## What this does

Writes ONE artifact for the change, validates it, and stops. If the user says
"all at once", or passes `--ff`, writes ALL remaining artifacts
without stopping (fast-forward mode).

## Execution discipline

These rules constrain **how** you execute the workflow; they do not change the
schema or lifecycle semantics.

- Treat the current artifact from `change artifact-instruction` as the **only**
  writable scope. Do not prepare or write files for later artifacts.
- Execute artifact work **sequentially**. Avoid large shell commands that create
  or write multiple artifact files in one shot.
- Do not manually create change artifact directory structure with `mkdir` unless
  the current artifact cannot be written otherwise. Prefer writing the target file
  directly and let normal file creation happen as part of that write.
- If the current artifact requires scope changes (for example `change edit --add-spec`
  before writing spec deltas), perform those CLI writes first, then re-check state
  sequentially before writing artifact files.
- In **one-at-a-time** mode, once the current artifact is validated, stop immediately.
  Do not fetch the next artifact, do not modify scope for the next artifact, and do
  not write any additional files until the user explicitly tells you to continue.

## Steps

### 1. Load change state

```bash
specd changes status <name> --format text
```

Identify any high-visibility blockers from the **blockers:** section (e.g. `ARTIFACT_DRIFT`,
`OVERLAP_CONFLICT`, `REVIEW_REQUIRED`) and inform the user. Follow the **next action:**
command recommendation.

Extract the `path:` field from the "lifecycle:" section.

If the status output shows `review: required: yes`, enter **artifact review mode**:

- Treat the artifacts listed under `review:` as the first review scope
- Review those artifact files against the latest user conversation and the
  current change state before deciding what to rewrite
- Do NOT revalidate or rewrite downstream artifacts blindly just because they
  are marked `pending-review`; first confirm whether the upstream change really
  requires a content update
- If the review reason is `artifact-drift`, inspect the drifted files first and
  use them to decide which other artifacts actually need edits

If state is `drafting` or `designing`, transition to `designing`:

```bash
specd changes run-hooks <name> designing --phase pre
specd changes hook-instruction <name> designing --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> designing --skip-hooks all
```

If state is not `drafting` or `designing`, this is the wrong skill. Redirect based on the
**next action:** `target` recommendation.

**Stop — do not continue.**

Check the **artifacts (DAG):** section — if some are already marked `[✓]`, you're resuming
mid-design.

### 2. Check workspace ownership

```bash
specd project status --format toon
```

From the response, build a map of each workspace's `codeRoot` and `ownership` from the `workspaces` array.
For each `specId` in the change, determine which workspace it belongs to.

**If any spec targets a `readOnly` workspace:**

> **Blocked.** The following specs belong to readOnly workspaces and cannot be modified:
>
> | Spec | Workspace | codeRoot |
> | ---- | --------- | -------- |
> | ...  | ...       | ...      |
>
> Remove them from the change or update the workspace ownership in `specd.yaml`.

**Stop — do not continue.**

**Continuous guard — applies throughout the entire design session:**

ReadOnly workspaces are off-limits for both specs AND code. You must NOT:

- Write or modify specs belonging to a readOnly workspace
- Design artifacts that prescribe changes to code under a readOnly `codeRoot`
- Include tasks, proposals, or instructions that require modifying files under a readOnly `codeRoot`

If during artifact writing you realize the design needs changes in a readOnly workspace's
code or specs, **stop and surface it to the user** — do not write the artifact assuming
those changes can be made. The user must either change the ownership in `specd.yaml` or
adjust the design to work within owned/shared boundaries.

External workspaces remain valid read targets during design:

- Read **specs** through specd CLI commands only. Do NOT inspect specs directly from
  `specsPath`, whether the workspace is local or external.
- Read **code** directly from a workspace's `codeRoot` when you need implementation
  context, architecture evidence, or impact analysis, even if that `codeRoot` is
  outside the current git root.
- `isExternal` changes location only. `ownership` still governs writes.

### 3. Load schema

```bash
specd schema show --format toon
```

### 4. Load context

```bash
specd changes context <name> designing --follow-deps --depth 1 --rules --constraints --format text [--fingerprint <stored-value>]
```

Pass `--fingerprint <stored-value>` if you have a `contextFingerprint` from a previous `change context` call in this conversation (see `shared.md` — "Fingerprint mechanism"). If lazy mode returns summary specs, evaluate each one and load any that are relevant to the artifact you're about to write (see `shared.md` — "Processing `change context` output").

#### Use code graph to enrich context

When the change targets specific code areas, use the graph to find related symbols and
assess complexity — this is mandatory, not optional:

```bash
specd graph search "<keyword from spec>" --format toon
specd graph hotspots --format toon
```

Graph search helps you discover specs you might need to load as context. Hotspots help
you identify high-coupling symbols that the design should handle carefully.

When writing the **design** or **tasks** artifact, if you know specific files or symbols
that will be modified, check their dependent impact:

```bash
specd graph impact --symbol "<name>" --direction dependents --format toon
```

Include impact findings in the design artifact so the implementer knows what's at stake.

#### Load exploration context

Check if `<changePath>/.specd-exploration.md` exists. If it does, read it — it contains
the full discovery context from `/specd-new`. Use it to inform every artifact you write.

**Staleness check — mandatory.** The exploration file is a snapshot from a past
conversation. Before trusting its content:

- Verify that **file paths and spec IDs** mentioned in the exploration still exist.
- Cross-check **design decisions and agreements** against current code.

If you find significant drift, briefly summarize what changed and ask the user whether
the original plan still holds or needs adjustment before writing artifacts.

If the file does not exist, stop and tell the user you're missing the exploration context.
Have a natural conversation to fill in the gaps, then write a `<changePath>/.specd-exploration.md`
yourself to capture what you learned before continuing with step 5.

If `review: required: yes` was shown in step 1, use the reason and affected artifacts
together with the current context to decide what actually needs revision.

### 5. Show context summary

Before asking the user about review mode, show a brief summary:

> **Change:** `<name>` — `<description>`
>
> **Specs:** `<specId1>`, `<specId2>`, ...
>
> **What we're building:** <summary drawn from exploration context or change description>
>
> **Artifacts to write:** <list artifact IDs from the DAG, marking any already complete as done>
>
> **Next up:** `<nextArtifactId>` — <brief description of what this artifact covers>

### 6. Choose mode — MANDATORY

**You MUST ask the user this question. Do NOT skip it. Do NOT assume a mode.**

If the user already said "all at once", "fast-forward", or `--ff` in
their invocation → use fast-forward mode and mark the `Choose review mode` task
as done immediately. Otherwise:

1. Create (or update) the `Choose review mode` task to `in_progress`
2. Ask:

> How would you like to review artifacts?
>
> 1. **One at a time** — I write one, you review, then we continue
> 2. **All at once** — I write everything, you review at the end

3. **STOP.** End your response here.

### 7. Get next artifact

```bash
specd changes artifact-instruction <name> --format toon
```

Returns `artifactId`, `instruction`, `template`, `delta`, `rulesPre`, `rulesPost`.

If the next artifact is `null`, go to step 10.

### 8. Write the artifact

**`rulesPre`, `instruction`, and `rulesPost` are a single mandatory block.** You MUST
read and follow all three, in this exact order: rulesPre → instruction → rulesPost.

Key rules:

- **Optional artifact**: ask the user if needed. If not, skip:

  ```bash
  specd changes skip-artifact <name> <artifactId>
  ```

- **Delta**: if the spec already exists, write a delta file, NOT a new file.

- **New artifact**: write from scratch using `template` as scaffolding if provided.

After writing, check if the artifact implies scope changes:

```bash
specd specs list --format text --summary
```

### 9. Validate

Run in **text mode** to ensure visibility of notes (optimisation hints):

```bash
specd changes validate <name> <specId/anySpecId> --artifact <artifactId> --format text
```

If validation fails: fix and re-validate.

**One-at-a-time mode:** show what was written, ask:

> `<artifactId>` done. Review it, request changes, or continue?

Wait for user response. **Stop completely.**

**Fast-forward mode:** show a one-line summary and go to step 7.

### 10. All artifacts done — run exit hooks immediately

```bash
specd changes run-hooks <name> designing --phase post
specd changes hook-instruction <name> designing --phase post --format text
```

Follow guidance.

### 10b. Blast radius check

Use the code graph to assess the dependent impact of the planned implementation:

```bash
specd graph impact --changes <workspace:path1> <workspace:path2> ... --format toon
```

If risk is HIGH or CRITICAL, surface it to the user and confirm before continuing.

### 10c. Implementation scope guard — mandatory before `ready`

Before entering `ready`, verify that the implementation targets described by the design
stay inside the change's writable workspace code roots.

Reload workspace config:

```bash
specd project status --format toon
```

Build the set of **allowed implementation roots** from the `workspaces` array.
Exclude `readOnly` roots entirely.

If any target is **Blocked (readOnly)**, do NOT transition to `ready`. Show the
user the blocked paths.

If any target is **Out of scope** (but not `readOnly`), show the user and ask
whether to update scope or continue. **Stop and wait.**

### 10d. Enter `ready`

Run ready pre-hooks, then transition:

```bash
specd changes run-hooks <name> ready --phase pre
specd changes hook-instruction <name> ready --phase pre --format text
```

Follow guidance.

```bash
specd changes transition <name> ready --skip-hooks all
```

### 11. Mandatory review stop

Show summary of all artifacts and specs.

> **Design complete.** All artifacts written and validated.
>
> | Artifact | Status |
> | -------- | ------ |
> | ...      | ...    |
>
> Want to review anything, or continue to implementation?

**Do NOT proceed until the user confirms.**

Run ready post hooks:

```bash
specd changes run-hooks <name> ready --phase post
specd changes hook-instruction <name> ready --phase post --format text
```

### 12. Handle approval gate

Run `change status <name> --format text` and check `approvals:` line.

**If spec=off:** Suggest `/specd-implement <name>`

**If spec=on:** Tell user:

> Approval required. Run: `specd changes approve spec <name> --reason "..."`
> Then: `/specd-implement <name>`

**Stop.**

## Session tasks

1. `Load state & hooks`
2. `Load schema & context`
3. `Choose review mode`
4. For each artifact: `Write <artifactId>`
5. `Transition to ready`
6. `Review & approval gate`

## Handling failed transitions

When `change transition` fails, it renders a **Repair Guide** in text mode.
Follow the recommended repair command based on the target recommendation.

**Stop — do not continue after redirecting.**

## Guardrails

- Always validate after writing
- Delta, not rewrite — when outlines exist, always write a delta
- One spec at a time for `scope: spec` artifacts
- Never guess spec IDs — look them up from `spec list --format text --summary`
- If context is unclear, ask the user — don't guess
