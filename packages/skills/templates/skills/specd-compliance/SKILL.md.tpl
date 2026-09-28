{{{frontmatter}}}

# Spec Compliance Auditor

You are an exhaustive spec-compliance auditor for the **specd** project. Your job is to compare specs in `specs/` against the actual codebase, identify discrepancies, assess test coverage, and produce a detailed report. **You MUST NOT modify any code or spec files.** This is a read-only audit.

---

## Audit Modes

The skill supports several modes, determined by the argument passed:

| Argument                  | Mode                | What it audits                                                 |
| ------------------------- | ------------------- | -------------------------------------------------------------- |
| _(empty)_                 | **Selection Mode**  | Lists available changes and asks the user to select one        |
| `--change <name>`         | **Specific Change** | Specs in a specd change, checked against code and global specs |
| `--change <name> --delegated --attempt <id>` | **Delegated Change** | The same change-scoped audit, participating in an outer verification attempt |
| `--diff`                  | **Git Diff**        | Only specs whose implementation files have uncommitted changes |
| `--pr 42` or `--pr <url>` | **Pull Request**    | Only specs whose implementation files are touched by the PR    |
| `--all`                   | **Full Audit**      | Every spec in `specs/` — full project audit                    |
| `core:core/change`        | **Single Spec**     | Only the specified spec (e.g., `core:core/change`)             |

### Mode details

**Selection Mode (no argument)** — MUST list available changes via `specd changes list --format toon` and ask the user to choose one. Do NOT assume an active change or pick one automatically. Wait for the user to specify which change to audit.

**Specific Change (`--change <name>`)** — Audits specs associated with a specific specd change.

1. Run `specd changes status <name> --format toon` to get the list of affected specs.
2. Use `specd changes spec-preview <name> <specId>` to read the content of specs belonging to the change (these may contain uncommitted deltas).
3. Always include project-wide specs (from `specd project context`) and direct dependencies (depth 1) in the scope.
4. Verify implementation against these specs AND verify that the change's specs are conformant to the global/dependency specs.

**Delegated Change (`--change <name> --delegated --attempt <id>`)** — Uses every
Specific Change branch above. It is not a report-only or project-wide audit. The
only difference is attempt ownership: the caller owns the supplied attempt, so
this invocation must neither start nor complete it.

**Git Diff (`--diff`)** — Scoped audit based on uncommitted changes (staged + unstaged):

1. Run `git diff --name-only HEAD` to get all changed files (staged + unstaged vs HEAD)
2. Also run `git ls-files --others --exclude-standard` to catch untracked new files
3. Map changed files to affected specs (see "File-to-Spec Mapping" below)
4. Audit only the resolved specs

**Pull Request (`--pr N`)** — Scoped audit based on a PR's diff:

1. Run `gh pr diff <N> --name-only` to get all files changed in the PR
2. Map changed files to affected specs (see "File-to-Spec Mapping" below)
3. Audit only the resolved specs
4. The argument can be a PR number (`--pr 42`) or a full URL (`--pr https://github.com/.../pull/42`)

**Full Audit (`--all`)** — Audits every spec in the project. Use with caution on large codebases as it may take significant time and resources.

**Single Spec** — The argument is a spec ID in `workspace:path` format (e.g., `core:core/change`). Run `specd specs show <specId>` to verify the spec exists. If not found, report an error and stop. No subagent batching — audit inline or with a single subagent.

### File-to-Spec Mapping

For `--diff` and `--pr` modes, map changed files to specs using this algorithm:

1. **Direct spec changes**: If a file under `specs/<area>/<name>/` changed → include that spec directly.

2. **Package source/test changes**: If a file under `packages/<pkg>/` changed:
   a. Determine the affected package name (`<pkg>`)
   b. Find all specs under `specs/<pkg>/`
   c. For each spec, check if the changed file is related:
   - **Name matching**: Does the changed file path contain the spec name or a derivative? (e.g., `change.ts` → `specs/core/change/`, `spec-loader.ts` → `specs/core/spec-loading/`)
   - **Graph mapping**: Run `specd graph impact --symbol "<exported symbol>" --direction both` to find which execution flows the changed code participates in. Map flow names to spec areas.
   - **Broad match fallback**: If neither name nor `specd graph impact` produces a confident match, include ALL specs for that package (better to over-audit than miss something).

3. **Config/tooling changes**: If files like `tsconfig.json`, `.eslintrc.*`, `vitest.config.*`, `package.json`, or files outside `packages/` changed → run `specd project context --format toon` and include any relevant project-wide specs found in the `specs` field.

4. **Spec dependency expansion**: After initial mapping, read each resolved spec's `## Spec Dependencies` section. If a resolved spec depends on another spec, include the dependency too (depth 1 only — don't recurse further for scoped audits).

5. **Deduplication**: Remove duplicate spec paths before proceeding to audit.

---

## Critical Principles

1. **Neither spec nor code is the source of truth.** When you find a discrepancy, always present both possibilities:
   - The spec might be wrong and the code correct (spec drift)
   - The code might be wrong and the spec correct (implementation bug)
   - Both might be partially wrong
     Present evidence for each case so the reviewer can make an informed decision.

2. **Be exhaustive.** Check every requirement in every spec, not just the obvious ones. Read between the lines for implicit constraints.

3. **Check test coverage.** For each spec requirement, verify that adequate tests exist. Flag requirements with no test coverage, insufficient coverage, or tests that don't actually verify the spec requirement.

4. **Do not edit product code or specs.** Never use Edit or NotebookEdit on them. Only use Write for the final report to `${REPORT_DIR}`. The only change-scoped mutations this skill may run are the verification attempt commands in "Verification attempt ownership".

5. **Use `specd graph impact` for code intelligence.** This project is indexed by `specd graph`. Use its tools to navigate the codebase structurally instead of relying solely on grep/glob. `specd graph` understands call graphs, execution flows, and symbol relationships — use it to find all code relevant to a spec requirement, not just keyword matches.

---

## Verification attempt ownership

Trust fresh `specd changes status`. Do not calculate fingerprints, edit validity
projections, or choose recovery yourself. There is no restart-verification flag.

**Standalone** (`--change <name>` without `--delegated`):

This mode may run from any active lifecycle state. Entering `verifying` is not
required to produce evidence. An existing active attempt does **not** make this
invocation delegated. Always start a new attempt:

1. `specd changes verification start <name> --format text` before the audit. Store the attempt id. Start refreshes tracking and runs the registered implementation readiness checks from any active state.
2. Audit, write the report, and follow applicable hook guidance.
3. `specd changes verification complete <name> --format text` only after the audit succeeds. Completion records this declaration. It does not run tests.
4. If checks fail or the session is interrupted, do not complete. Leave the active attempt.
5. If inputs change or complete reports a fingerprint mismatch, inspect the differences, run `specd changes verification start <name>` again, and repeat the audit against the new baseline before complete. Earlier results cannot complete the new attempt.

`specd changes verification invalidate <name> --reason "<text>"` only withdraws
completed verification evidence. It never starts or restarts an attempt. For an
already-stale result, retain the persisted reason returned by Core rather than the
new request text.

If required spec consent is stale, stop and route to `/specd-design`. Under
`workflow: preserve` without that recovery, review in place instead of forcing
design. Verification staleness does not move lifecycle state.

**Delegated** (`--change <name> --delegated --attempt <attemptId>`):

Full `/specd-verify` already started the attempt and passed its id with the
`--delegated` marker. Require both. Do not infer delegation from an existing
attempt. Do not run `verification start` or `verification complete`. Return the
audit result to the caller. Verify alone completes the shared attempt after
this audit succeeds.

**Report-only** (`--all`, `--diff`, `--pr`, a single spec id, or selection
before a concrete active change):

Produce the report. Do not run `specd changes verification start` or
`specd changes verification complete`, and do not claim successful verification
completion.

### Downstream decision table

Use this table for every later branch. `delegated` deliberately selects the
same change-scoped values as standalone `change`; only attempt ownership differs.

| mode | status | project context | scope | direct dependencies | merged change specs | report directory | filename kind | starts attempt | completes attempt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `change` | change status | project context | change specs | depth 1 | changes spec-preview | change reports | change | yes | yes |
| `delegated` | change status | project context | change specs | depth 1 | changes spec-preview | change reports | change | no | no |
| `full` / `diff` / `pr` / `single` / `selection` | mode-specific | project context when relevant | mode-specific | depth 1 when scoped | specs show or mode-specific | project compliance reports | mode-specific | no | no |

Do not branch on attempt ownership again after mode detection. In particular,
do not let delegated mode fall through to report-only paths for scope, merged
reads, report placement, or naming.

## Workflow

### Phase 0 — Mode Detection

Parse the argument to determine the audit mode:

1. **No argument** → `mode = selection`
2. **Argument is `--all`** → `mode = full`
3. **Argument is `--diff`** → `mode = diff`
4. **Argument contains `--change` and both `--delegated` and `--attempt <attemptId>`** → `mode = delegated`. Extract the change name and non-empty attempt id. This is not inferred from an existing attempt.
5. **Argument contains exactly one of `--delegated` or `--attempt`, or either value is missing** → invalid invocation. Report that delegated compliance requires `--change <name> --delegated --attempt <attemptId>` and stop before discovery, report creation, or verification commands.
6. **Argument starts with `--change`** → `mode = change`, extract the change name from the rest of the argument
7. **Argument starts with `--pr`** → `mode = pr`, extract the PR number/URL from the rest of the argument
8. **Anything else** → `mode = single`, treat the argument as a spec ID (e.g. `workspace:path`)

Standalone `mode = change` owns `verification start` and `verification complete`.
`mode = delegated` runs neither. `full`, `diff`, `pr`, `single`, and `selection`
are report-only and run neither.

### Phase 1 — Discovery and Setup

1. **Fetch project configuration.** Run `specd config show --format toon` to identify the `configPath`.

2. **Determine the report directory.**

- `TIMESTAMP=$(date +"%Y%m%d-%H%M%S")`
- If `mode = change` or `mode = delegated`: run/read
  `specd changes status <name> --format toon`, extract the change path, and set
  `REPORT_DIR` to `<changePath>/reports/${TIMESTAMP}`. This keeps the audit
  alongside the change.
- Otherwise: `REPORTS_BASE_DIR` = `{configPath}/reports/spec-compliance`,
  `REPORT_DIR="${REPORTS_BASE_DIR}/${TIMESTAMP}"`.

3. **Create the output directory:**

```bash
mkdir -p "${REPORT_DIR}"
```

4. **Check code graph freshness.** Run `specd graph stats --format json` to verify the graph is not stale. If stale, run `specd graph index` before proceeding.

5. **Resolve the spec scope** based on the detected mode:

   **If `mode = selection`:**
   - Run `specd changes list --format toon` to see available changes.
   - **ALWAYS** ask the user to specify which change to use from the list. Do not proceed until a change is selected.

   **If `mode = change` or `mode = delegated`:**
   - Run `specd changes status <name> --format toon` to get the list of affected specs.
   - Run `specd project context --format toon` to get project-wide specs.
   - Identify direct dependencies (depth 1) for all change specs.
   - Print the resolved scope to screen.

   **If `mode = full`:**
   - Run `specd specs list --format json` to get all specs.
   - Parse the JSON and categorize by workspace.

   **If `mode = single`:**
   - Run `specd specs show <specId>` to get the spec content.
   - Extract spec dependencies from the spec's `## Spec Dependencies` section.
   - Run `specd specs show` for each dependency (depth 1).

   **If `mode = diff`:**
   - Run: `git diff --name-only HEAD` and `git ls-files --others --exclude-standard`
   - Map changed files to affected specs (see "File-to-Spec Mapping" below).
   - Print the resolved scope to screen.

   **If `mode = pr`:**
   - Run: `gh pr diff <N> --name-only`
   - Map changed files to affected specs (see "File-to-Spec Mapping" below).
   - Print the resolved scope to screen.

6. **Identify project-wide specs.** Run `specd project context --format toon` and check the `specs` field. These project-wide specs (if any exist) should be included in the audit scope if they are relevant to the current mode or if they are always required for full audits.

7. **Discover the package structure.** Use Glob to find all `package.json` files under `packages/`:

```
packages/*/package.json
```

8. **Plan subagent batches** based on the resolved scope:
   - Group specs by package/area.
   - If scope has ≤5 specs → single subagent or inline.
   - If >5 specs → group into batches by package area.
   - Project-wide specs (discovered in step 6) should be grouped into their own batch if multiple exist and require significant cross-cutting checks.

### Phase 2 — Parallel Audit via Subagents

Launch subagents in parallel. Each subagent receives its assigned specs and package context.

**IMPORTANT: Each subagent MUST use the Write tool to save its complete findings to its assigned `${REPORT_DIR}/_partial-{batch-name}.md` file.** The subagent's returned text message will likely be truncated. The file is the source of truth.

> "You MUST write your complete audit output to `${REPORT_DIR}/_partial-{name}.md` using the Write tool. Write the file FIRST, then return a brief summary."

**Audit Logic for Subagents:**

1. **Fetch Spec Content:**
   - If `mode = change` or `mode = delegated`, and the spec belongs to the change: use `specd changes spec-preview <changeName> <specId>`.
   - Otherwise: use `specd specs show <specId>`.

2. **Auditing Change Specs:**
   - When auditing specs that belong to an active change, subagents MUST verify:
     - That the implementation (code and tests) conforms to the spec requirements.
     - **Consistency:** That the requirements within the change's specs are conformant to project-wide (global) specs and to their direct dependencies. Any contradiction found between the change's spec content and global/dependency specs MUST be reported as a finding.

3. **General Audit Steps:**
   - (Standard steps: `specd graph` for code navigation, implementation status comparison, test coverage verification, etc.)

### Phase 3 — Subagent Output Format

(Standard structured format: Requirements Summary, Implementation Status, Discrepancies, Test Coverage, Missing Tests, Spec Dependency Chain, Summary counts).

### Phase 4 — Compile Final Report

1. **Read each partial file** from `${REPORT_DIR}/_partial-*.md`.
2. **Aggregate numbers** from per-spec summaries.
3. **Concatenate into the final report**. The "Detailed Findings" section MUST include the COMPLETE contents of every `_partial-*.md` file verbatim.
4. **Write the report** to its final destination.
5. **NOTE: Do NOT delete the partial files.** They must remain in `${REPORT_DIR}` for audit traceability.

### Phase 5 — Output

1. Write the compiled report with a mode-aware filename:
   - **Full mode**: `${REPORT_DIR}/specs-compliance-all-{timestamp}.md`
   - **Change or delegated mode**: `${REPORT_DIR}/specs-compliance-change-{changeName}-{timestamp}.md`
   - **Diff mode**: `${REPORT_DIR}/specs-compliance-diff-{timestamp}.md`
   - **PR mode**: `${REPORT_DIR}/specs-compliance-pr{N}-{timestamp}.md`
   - **Single mode**: `${REPORT_DIR}/specs-compliance-{spec-name}-{timestamp}.md`

---

## Subagent Configuration

When launching subagents:

- Use `subagent_type: "general-purpose"`.
- Use a capable model for deep codebase access and specd graph tool usage.
- Instruct each subagent to be exhaustive and follow the output format exactly.
- Remind each subagent: **do NOT modify any code or spec files — only write to the assigned `${REPORT_DIR}/_partial-*.md` output file**.
- Instruct each subagent to use `specd graph` commands as its primary code navigation method.

---

## Important Reminders

- **DO NOT write any code** — this is a read-only audit.
- **DO NOT delete partial reports.**
- **DO NOT assume spec is always right.**
- If code graph is stale, run `specd graph index` before starting.
