# specd shared notes

Read this file at the start of every specd skill invocation.

## Mental model

**Every change in specd goes through specs, even pure code changes.** There is no
"code-only" workflow. The model is:

1. **Specs define what the system should do** — they are requirements, not documentation
2. **Code implements what the specs say** — implementation writes code that satisfies specs
3. **Verification checks code against specs** — the schema defines acceptance criteria

If a change modifies code, there MUST be a spec that describes the expected behaviour.
If no spec exists, **create one as part of the change**. If an existing spec covers it,
add it to the change's specIds and write a delta (or `no-op` if unchanged).

A change may include specs that **already exist and don't need modification** — the spec
defines the behaviour and the change implements the code for it. Use `op: no-op` deltas.

## CLI Formats: Diagnostic Priority & Data Extraction

You MUST prioritize formats according to the following rules:

- **Diagnostic Priority**: Always use **`--format text`** (or default) for lifecycle
  status checks (`changes status`), transition attempts (`changes transition`), and
  validation commands (`changes validate` / `specs validate`). This ensures high
  visibility of human-readable blockers, the Artifact DAG, and Repair Guides.
- **Data Extraction**: Use machine-optimized formats **`--format toon`** (preferred)
  strictly when structured data extraction is required for subsequent tool calls
  (e.g., getting `lifecycle.changePath` or `specIds`).

Never use `--format json` unless `toon` is unavailable or explicitly requested.

## Command necessity and freshness

Avoid redundant reads, but only when the replacement is explicit and fresh.

A command MAY be skipped only when all of these are true:

1. A prior command in the same skill execution already returned the exact fields needed
   for the current decision.
2. The prior output is still fresh for this decision boundary.
3. The skill instructions define or clearly imply an equivalence between the skipped
   command and the prior output.

When any condition is uncertain, run the explicit canonical command. Do not infer
equivalence from similar-looking output.

Examples of safe equivalence:

- `project status --context --graph --format toon` can satisfy later project-status,
  workspace-ownership, graph-freshness, active-change, and draft checks in the same
  skill step when those fields are present in that output.
- `changes status <name> --format text` can satisfy diagnostic routing, blocker,
  review, next-action, spec ID, artifact-state, and change-path checks in the same
  step when the agent is reading the output directly.
- `changes status <name> --format toon` is preferred when those same values must be
  extracted as structured fields for later tool calls or internal state.

Freshness rules:

- Do not reuse outputs across separate skill invocations unless the relevant command
  provides a fingerprint mechanism and the fingerprint was checked.
- `changes context ... --fingerprint <value>` is the only reusable freshness signal
  for compiled context.
- After any write, validation, hook run, transition, or scope edit, re-read the state
  needed for the next decision.
- If a skill can be resumed later, it must start from its minimum mandatory reads,
  even if another skill previously gathered similar data.

## Command sequencing — no write-then-read parallelism

**Never run a command in parallel with another command that depends on the first one's
persisted side-effect.** Parallel execution is only safe for independent reads.

Commands that MUST run sequentially (the second depends on the first completing):

- `changes validate` → then `changes status` (validate marks artifacts complete)
- `changes edit --add-spec` → then write the delta/artifact file (spec must be registered first)
- `changes transition` → then `changes context` for the new state (state must change first)
- `changes run-hooks` → then `changes hook-instruction` (hooks must execute first)
- Any write operation → then any read that checks its effect

**Safe to parallelize:** multiple `specs show` calls, multiple `Read` calls, `config show`

- `specs list` + `changes list`, or any set of pure reads with no write dependency.

If a command succeeds but the subsequent read shows unexpected state (e.g. validate
reports success but status still shows `pending`), **re-read sequentially** before
concluding there's a bug. The most common cause is accidental parallelism.

## changePath

Skills that need structured status data start by running `changes status <name> --format toon`
or by reusing equivalent fresh status data from the current skill execution.
The response includes `lifecycle.changePath` — the absolute path to the change
directory. **Always extract and store this.** Change-scoped artifacts and spec-scoped
artifact deltas live there. Never guess the path or artifact filenames; use status,
artifact instructions, and schema metadata.

## High-visibility blockers

The `changes status` response includes a `blockers` array (in `toon` mode) or a
dedicated "blockers:" section (in `text` mode).

When blockers exist, progress is physically gated by the CLI. You MUST:

1. **Identify** all blockers from the output
2. **Prioritize** resolving them according to the `nextAction` recommendation
3. **Inform** the user about the blockers if they require human intervention

## Next Action engine

The `changes status` response also includes a `nextAction` object:

- `targetStep`: the lifecycle step to aim for
- `actionType`: `cognitive` (needs thinking/editing) or `mechanical` (just run a command)
- `reason`: short explanation of why this action is recommended
- `command`: the exact CLI or skill command to run

**Always prefer the `nextAction` recommendation** over manual state derivation.
It accounts for both structural blockers and the logical workflow progression.

## Repair Guide for failed transitions

When `changes transition` fails in `text` mode, it renders a **Repair Guide**,
providing the blocker codes and the exact command to resolve them.

If a transition fails, do not guess why. Read the blockers and follow the Repair
Guide. Usually, this means redirecting to the recommended skill or performing
the recommended repair command.

## Artifact and File states

SpecD uses several states to track artifacts and files:

- `missing`: file is not present on disk
- `in-progress`: file exists but has not been validated
- `complete`: file has been validated and matches the schema
- `skipped`: optional artifact was intentionally omitted
- `pending-review`: content changed and needs human/agent review
- `drifted-pending-review`: disk content changed after validation, needs review
- `pending-parent-artifact-review`: **recursive block** — this artifact is fine,
  but an upstream dependency (parent in the DAG) requires review. You MUST resolve
  the parent's review before this artifact can be progressed.

## Spec IDs

**Always `workspace:capability-path`** (e.g. `core:core/config`, `cli:cli/spec-metadata`,
`default:_global/architecture`). Never use bare paths like `core/config`.

To find the correct ID:

```bash
specd specs list --format text --summary
```

Use the IDs from the PATH column. For new specs that don't exist yet, **ask the user**
which workspace they belong to.

## Adding specs before writing artifacts

**Never write a delta or new spec file until the spec is registered in the change.**
If a spec needs to be part of the change, first add it:

```bash
specd changes edit <name> --add-spec <workspace:path>
```

Only after `--add-spec` succeeds should you write the delta or artifact file in the
change directory. Writing files for specs not yet added to the change will cause
validation failures and broken state.

Whenever you edit or write a delta, check the merged output with

```bash
specd changes spec-preview <name> <specId>
```

If you only need one spec-scoped artifact (for example just `specs` or just `verify`),
prefer the filtered form to reduce noise and token usage:

```bash
specd changes spec-preview <name> <specId> --artifact <artifactId>
```

If the output is not what you want, edit the delta again (make sure the delta does not remove anything needed).

## Structural validation vs content review

`specd changes validate` is a structural and lifecycle-state gate. It verifies schema
shape, required files, artifact dependencies, and validation status. It does **not**
approve semantic content quality, requirement intent, implementation correctness, or
whether a delta preserves important existing text.

After validation succeeds, review the content that matters for the current phase:

- For spec/verify deltas, review the merged output, not only the raw delta.
- For design/tasks, compare the artifact content against the latest user intent and
  upstream artifacts.
- When overlap, drift, or stale-base risk exists, run:

```bash
specd changes spec-preview <name> <specId> --format text
```

Use the preview as the authoritative merged-content checkpoint before accepting the
delta outcome.

Important scope rule:

- `spec-preview` is for **spec-scoped** artifacts (for example `specs`, `verify`).
- For **change-scoped** artifacts (for example `proposal`, `design`, `tasks`), do not
  use `spec-preview` as a review step; validate and review the artifact file content
  directly.

`changes validate` command shape by scope:

- `scope: spec` artifacts require a spec ID:
  `specd changes validate <name> <specId> --artifact <artifactId> --format text`
- `scope: change` artifacts do not require a spec ID:
  `specd changes validate <name> --artifact <artifactId> --format text`

## Spec scope vs spec dependencies

These are two distinct operations — do not confuse them:

**`changes edit --add-spec <specId>`** — adds a spec to the **change's scope**. This
means the change creates or modifies that spec. It controls which specs get artifacts
and deltas.

**`changes deps <name> <specId> --add <depId>`** — declares that **spec A depends on
spec B**. This is a relationship between specs, not between a change and a spec. It
controls transitive context compilation — when working on spec A, spec B's context is
automatically included.

**When to use which:**

- "This change should also touch spec X" → `changes edit --add-spec X`
- "Spec A references types/APIs/concepts from spec B" → `changes deps ... A --add B`

Both matter: scope determines what gets written, dependencies determine what context
is available while writing it.

## Reading specs

**Always use the CLI.** Never guess filesystem paths.

- Discover: `specs list --format text --summary`
- Read content: `specs show <specId> --format toon`
- Read metadata: `specs metadata <specId> --format toon`

## Context loading is mandatory

Every skill that runs CLI instructions, hooks, or artifact instructions MUST load
context first. No exceptions — the context contains binding directives that govern
how all subsequent work is performed.

- **Change exists** → `changes context <name> <step> --format text [--fingerprint <value>]`
- **No change yet** → `project context --format text`

Load context before the first hook or instruction call in the skill, **and reload it
every time the change transitions to a new state**. A state transition may change which
specs are relevant, which hooks fire, and what instructions apply. Stale context from
a previous state can lead to wrong decisions.

### Fingerprint mechanism

To avoid re-reading unchanged context, the agent stores a `contextFingerprint` from
the first `changes context` call and passes it to subsequent calls — including across
skill transitions within the same conversation:

1. **No fingerprint stored** (first call in conversation, or new step without prior context):
   `changes context <name> <step> --format text`
   - Parse the `contextFingerprint` from the response
   - Store it in the conversation window
2. **Fingerprint stored** (any subsequent call, including after transitioning to a new skill):
   `changes context <name> <step> --format text --fingerprint <value>`
   - If `status: "unchanged"`: use the context already in memory, no re-processing needed
   - If `status: "changed"`: update stored context and fingerprint with the new response

## Terminal stop rule (forced)

When a skill reaches its terminal "stop" step, it MUST end the invocation immediately.

- You MAY suggest the next skill or command.
- You MUST NOT invoke the next skill automatically.
- You MUST wait for an explicit user message before starting another skill.

This rule applies even when the next action is obvious and even when the current
skill output includes a recommended follow-up command.

The fingerprint persists across skill boundaries. When moving from design → implement →
verify → archive within the same conversation, carry the stored `contextFingerprint`
forward and pass it to the next skill's `changes context` call. Only omit the fingerprint
if no `changes context` call has been made yet in the conversation.

The fingerprint represents the logical context state. When unchanged, the agent still
receives `stepAvailable`, `blockingArtifacts`, `availableSteps`, and `warnings` — only
`projectContext` and `specs` content are omitted.

Follow the processing rules below ("Processing `changes context` output").

## Approvals are human-only

**You MUST NEVER run `changes approve` yourself.** Spec approval and signoff approval
are exclusively human actions. When a change reaches `pending-spec-approval` or
`pending-signoff`, your only job is to tell the user what command to run:

```bash
specd changes approve spec <name> --reason "..."
specd changes approve signoff <name> --reason "..."
```

Do not attempt to approve, do not offer to approve, do not auto-approve. Stop and wait.

## Processing artifact instructions

When you fetch artifact instructions via `changes artifact-instruction`, the response
includes `rulesPre`, `instruction`, and `rulesPost`. These three fields are a **single
mandatory block** — you MUST read and follow all three, in this exact order:

1. **`rulesPre`** — composition rules to apply before writing
2. **`instruction`** — what to write (+ `template`/`delta` guidance)
3. **`rulesPost`** — composition rules to apply after writing

They are not optional or advisory. Treat them as binding composition directives that
together define how the artifact must be authored.

## Processing `changes context` output

Every skill that runs `changes context` MUST process its output as follows:

### Project context is binding

The `projectContext` entries (instructions and file content) are **directives, not suggestions**.
You MUST follow every instruction and apply every file's content as if it were part of
your skill instructions. If an instruction says "always do X", you always do X — no
exceptions.

### Lazy mode: evaluate and load needed specs

When `contextMode` is `lazy` (the default), the output contains two tiers:

- **Full specs** — rendered with complete content. Read and absorb them.
- **Summary specs** — listed in a catalogue table with only specId, title, and description.

You MUST NOT ignore the summary catalogue. Before proceeding with your task:

1. **Scan** every summary spec's title and description
2. **Identify** which ones are relevant to the work you're about to do
3. **Load** each relevant spec in full:

If you are loading a spec inside a change:

```bash
specd changes spec-preview <change-name> <spec-id> --format text
```

If only one spec-scoped artifact is needed, use:

```bash
specd changes spec-preview <change-name> <spec-id> --artifact <artifactId> --format text
```

If the spec is not in the change:

```bash
specd specs show <spec-id> --format text
```

If only one artifact is needed, use:

```bash
specd specs show <spec-id> --artifact <artifactId> --format text
```

4. **Follow** the loaded spec content with the same weight as full-mode specs

When in doubt about whether a summary spec is relevant, err on the side of loading it.
A spec you didn't read can silently violate a constraint you didn't know existed.

## Hooks

Every workflow step has pre and post hooks. The pattern is always:

1. **On entry:** `changes hook-instruction <name> <step> --phase pre --format text` → follow guidance
2. **On exit:** `changes run-hooks <name> <step> --phase post` → then `changes hook-instruction <name> <step> --phase post --format text` → follow guidance

### Pre-hooks run BEFORE the transition, always

**The skill controls hook execution, not the transition.** Always call `changes transition`
with `--skip-hooks all` so that hooks are not executed implicitly. The skill runs them
explicitly in the correct order.

The complete pattern for every transition is:

1. `changes run-hooks <name> <source-state> --phase post` — finish the current state
2. `changes hook-instruction <name> <source-state> --phase post` → follow guidance
3. `changes run-hooks <name> <target-state> --phase pre` — prepare the target state
4. `changes hook-instruction <name> <target-state> --phase pre` → follow guidance
5. `changes transition <name> <target-state> --skip-hooks all` — transition without implicit hooks

This gives the skill full control over ordering, error handling, and guidance compliance.
Never let the transition run hooks implicitly — it cannot follow `instruction:` guidance.

### Post-hooks fire immediately after the phase's work completes

Post-hooks MUST run the moment the phase's work is done — right after the last artifact
passes validation (designing), after the last task checkbox is marked (implementing),
after the last scenario is verified (verifying), etc. Do NOT wait, do NOT ask the user
anything first, do NOT present a summary before running them. The hooks are part of the
phase completion, not a separate step that follows user interaction.

Execute hooks for every state the change passes through, including intermediate ones
(`pending-spec-approval`, `spec-approved`, `done`, `pending-signoff`, `signed-off`,
`archivable`). In code, all 12 `ChangeState` values are valid hook steps — the system
accepts them all and silently returns empty results if the schema doesn't define hooks
for that step. Always call them; never skip a state assuming it has no hooks.

## Code graph intelligence

The CLI includes a code graph that indexes symbols, files, specs, and their relationships.
You MUST use it for discovery, design, implementation, and verification — it is the
primary tool for understanding the codebase, not a nice-to-have. If the graph hasn't
been indexed yet, index it before proceeding. Only fall back to manual file exploration
(Glob/Grep/Read) when the graph is genuinely broken after an indexing attempt.

### Keeping the graph fresh

Before using graph queries, check freshness:

```bash
specd graph stats --format toon
```

If `stale` is `true` (or the graph has never been indexed), re-index before querying:

```bash
specd graph index --format toon
```

Incremental indexing is fast (only changed files are re-processed). Use `--force` only
if you suspect corruption or want a full rebuild. The `/specd` entry skill re-indexes
automatically when it detects staleness, so downstream skills can usually assume a
fresh graph.

### Available commands

**Search** — find symbols or specs by keyword (BM25 scoring):

```bash
specd graph search "<query>" --format toon
specd graph search "<query>" --symbols --kind function --format toon
specd graph search "<query>" --specs --spec-content --format toon
```

**Impact analysis** — understand blast radius before making changes:

```bash
specd graph impact --symbol "<name>" --direction dependents --format toon
specd graph impact --file "<workspace:path>" --direction dependents --format toon
specd graph impact --symbol "<name>" --direction dependencies --format toon
specd graph impact --changes <workspace:path1> <workspace:path2> --format toon
```

Use `dependents` for blast-radius analysis (who is affected by a change) and
`dependencies` when you need to inspect what the target consumes. Returns `riskLevel`
(LOW/MEDIUM/HIGH/CRITICAL), affected files, and affected symbols.

**Hotspots** — find high-coupling symbols that need careful handling:

```bash
specd graph hotspots --format toon
specd graph hotspots --min-risk HIGH --format toon
```

Score = `(sameWsCallers × 3) + (crossWsCallers × 5) + fileImporters`.

### When to use graph commands in each skill

| Skill              | When                 | Command                  | Why                                                      |
| ------------------ | -------------------- | ------------------------ | -------------------------------------------------------- |
| `/specd`           | Welcome              | `graph stats`            | Show graph freshness alongside project status            |
| `/specd-new`       | Understanding intent | `graph search`           | Find related specs and symbols by keyword                |
| `/specd-new`       | Proposing specs      | `graph impact --file`    | Assess which areas a file change would affect            |
| `/specd-design`    | Before `ready`       | `graph impact --changes` | Check blast radius of planned implementation targets     |
| `/specd-design`    | Loading context      | `graph search --specs`   | Find specs related to the artifact being written         |
| `/specd-design`    | Writing design/tasks | `graph hotspots`         | Identify high-risk symbols the design should account for |
| `/specd-implement` | Before coding        | `graph impact --symbol`  | Understand blast radius of symbols you'll modify         |
| `/specd-implement` | Before coding        | `graph hotspots --file`  | Spot risky symbols in files you'll touch                 |

Graph queries are the **primary** way to understand the codebase. Always prefer graph
commands over manual exploration (Glob/Grep). If a graph query returns useful results,
use them directly — don't duplicate the search manually.

## Spec overlap awareness

Commands that modify a change's spec scope (`changes create`, `changes edit --add-spec`)
may emit a `warning: spec overlap detected` message to stderr when the specs in the
change are also targeted by other active changes. The `changes archive` command blocks
by default when overlap is detected.

When the CLI output of `changes create` or `changes edit` contains a spec overlap warning,
you MUST stop and surface it to the user before continuing. Show which specs overlap and
with which other active changes, then ask whether to proceed or adjust the spec scope.
Do not silently continue past an overlap warning.
