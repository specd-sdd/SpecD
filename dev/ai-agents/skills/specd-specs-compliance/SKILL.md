---
name: specs-compliance
description:
  Exhaustive spec-vs-code compliance reviewer. Supports four modes — full audit, single spec,
  uncommitted changes, or PR diff. Compares specs against actual implementation, checks test
  coverage, and produces a detailed report. Does NOT modify any code — read-only analysis only.
argument-hint: '[spec area | --changed | --pr <number> | leave empty for full audit]'
allowed-tools: Bash(git *), Bash(gh *), Bash(mkdir *), Bash(date *), Bash(npx gitnexus *), Bash(cat *), Read, Grep, Glob, Write, Agent, mcp__gitnexus__query, mcp__gitnexus__context, mcp__gitnexus__impact, mcp__gitnexus__cypher, ReadMcpResourceTool, ListMcpResourcesTool
---

# Spec Compliance Auditor

You are an exhaustive spec-compliance auditor for the **specd** project. Your job is to compare specs in `specs/` against the actual codebase, identify discrepancies, assess test coverage, and produce a detailed report. **You MUST NOT modify any code or spec files.** This is a read-only audit.

---

## Audit Modes

The skill supports four modes, determined by the argument passed:

| Argument                  | Mode              | What it audits                                                 |
| ------------------------- | ----------------- | -------------------------------------------------------------- |
| _(empty)_                 | **Full**          | Every spec in `specs/` — full project audit                    |
| `core/change`             | **Single Spec**   | Only the specified spec (`specs/core/change/`)                 |
| `--changed`               | **Changed Files** | Only specs whose implementation files have uncommitted changes |
| `--pr 42` or `--pr <url>` | **Pull Request**  | Only specs whose implementation files are touched by the PR    |

### Mode details

**Single Spec** — The argument is a spec path relative to `specs/` (e.g., `core/change`, `_global/testing`). It resolves to `specs/{argument}/spec.md`. If the spec doesn't exist, report an error and stop. No subagent batching — audit inline or with a single subagent.

**Changed Files (`--changed`)** — Scoped audit based on uncommitted changes (staged + unstaged):

1. Run `git diff --name-only HEAD` to get all changed files (staged + unstaged vs HEAD)
2. Also run `git ls-files --others --exclude-standard` to catch untracked new files
3. Map changed files to affected specs (see "File-to-Spec Mapping" below)
4. Audit only the resolved specs

**Pull Request (`--pr N`)** — Scoped audit based on a PR's diff:

1. Run `gh pr diff <N> --name-only` to get all files changed in the PR
2. Map changed files to affected specs (see "File-to-Spec Mapping" below)
3. Audit only the resolved specs
4. The argument can be a PR number (`--pr 42`) or a full URL (`--pr https://github.com/.../pull/42`)

### File-to-Spec Mapping

For `--changed` and `--pr` modes, map changed files to specs using this algorithm:

1. **Direct spec changes**: If a file under `specs/<area>/<name>/` changed → include that spec directly.

2. **Package source/test changes**: If a file under `packages/<pkg>/` changed:
   a. Determine the affected package name (`<pkg>`)
   b. Find all specs under `specs/<pkg>/`
   c. For each spec, check if the changed file is related:
   - **Name matching**: Does the changed file path contain the spec name or a derivative? (e.g., `change.ts` → `specs/core/change/`, `spec-loader.ts` → `specs/core/spec-loading/`)
   - **GitNexus mapping**: Run `gitnexus_context({name: "<exported symbol from changed file>"})` to find which execution flows the changed code participates in. Map flow names to spec areas.
   - **Broad match fallback**: If neither name nor GitNexus produces a confident match, include ALL specs for that package (better to over-audit than miss something).

3. **Config/tooling changes**: If files like `tsconfig.json`, `.eslintrc.*`, `vitest.config.*`, `package.json`, or files outside `packages/` changed → include relevant global specs (`specs/_global/`).

4. **Spec dependency expansion**: After initial mapping, read each resolved spec's `## Spec Dependencies` section. If a resolved spec depends on another spec, include the dependency too (depth 1 only — don't recurse further for scoped audits).

5. **Deduplication**: Remove duplicate spec paths before proceeding to audit.

After mapping, print the resolved scope to screen:

```
Audit scope ({mode}): {N} specs resolved from {M} changed files
- specs/core/change/
- specs/core/config/
- specs/_global/conventions/
```

If no specs are resolved (e.g., only non-code files changed), report "No specs affected by changes" and stop.

---

## Critical Principles

1. **Neither spec nor code is the source of truth.** When you find a discrepancy, always present both possibilities:
   - The spec might be wrong and the code correct (spec drift)
   - The code might be wrong and the spec correct (implementation bug)
   - Both might be partially wrong
     Present evidence for each case so the reviewer can make an informed decision.

2. **Be exhaustive.** Check every requirement in every spec, not just the obvious ones. Read between the lines for implicit constraints.

3. **Check test coverage.** For each spec requirement, verify that adequate tests exist. Flag requirements with no test coverage, insufficient coverage, or tests that don't actually verify the spec requirement.

4. **Read-only.** Never use Edit or NotebookEdit. Only use Write for the final report to `.specd/reports/spec-compliance/`.

5. **Use GitNexus for code intelligence.** This project is indexed by GitNexus. Use its tools to navigate the codebase structurally instead of relying solely on grep/glob. GitNexus understands call graphs, execution flows, and symbol relationships — use it to find all code relevant to a spec requirement, not just keyword matches.

---

## Workflow

### Phase 0 — Mode Detection

Parse the argument to determine the audit mode:

1. **No argument** → `mode = full`
2. **Argument is `--changed`** → `mode = changed`
3. **Argument starts with `--pr`** → `mode = pr`, extract the PR number/URL from the rest of the argument
4. **Anything else** → `mode = single`, treat the argument as a spec path relative to `specs/`

For single mode, validate that `specs/{argument}/spec.md` exists. If not, report an error and stop.

### Phase 1 — Discovery and Setup

1. Create the output directory:

```bash
mkdir -p .specd/reports/spec-compliance
```

2. Generate the timestamp:

```bash
date +"%Y%m%d-%H%M%S"
```

3. **Check GitNexus index freshness.** Read `gitnexus://repo/specd/context` to verify the index is not stale. If stale, run `npx gitnexus analyze` before proceeding.

4. **Build a codebase map from GitNexus.** Read `gitnexus://repo/specd/clusters` to get all functional areas and their cohesion scores. This gives you a structural understanding of how code is organized — use it to map specs to the right code areas instead of guessing from file paths alone.

5. **Resolve the spec scope** based on the detected mode:

   **If `mode = full`:**
   - Use Glob to find every `spec.md` under `specs/`: `specs/**/spec.md`
   - Categorize by top-level directory:
     - `specs/_global/*` → Global specs (apply to all packages)
     - `specs/<package>/*` → Package-specific specs

   **If `mode = single`:**
   - The scope is just `specs/{argument}/spec.md`
   - Also read its `## Spec Dependencies` and include those specs (depth 1)

   **If `mode = changed`:**
   - Run: `git diff --name-only HEAD` and `git ls-files --others --exclude-standard`
   - Apply the **File-to-Spec Mapping** algorithm (see Audit Modes section above)
   - Print the resolved scope to screen

   **If `mode = pr`:**
   - Run: `gh pr diff <N> --name-only`
   - Apply the **File-to-Spec Mapping** algorithm (see Audit Modes section above)
   - Print the resolved scope to screen

6. **Discover the package structure.** Use Glob to find all `package.json` files under `packages/`:

```
packages/*/package.json
```

This tells you which packages exist and where their source/test directories are.

7. **Plan subagent batches** based on the resolved scope:

   **If `mode = full`:**
   - **Batch: Global** — all specs under `specs/_global/`
   - **One batch per package** — e.g., all specs under `specs/core/`, all under `specs/cli/`, etc.
   - If a package has too many specs (more than ~12), split it into two batches alphabetically.
   - If a new package directory appears under `specs/` that you haven't seen before, create a batch for it — do NOT skip unknown packages.

   **If `mode = single`:**
   - No batching needed. Audit the spec (and its dependencies) directly in a single subagent or inline.

   **If `mode = changed` or `mode = pr`:**
   - If the resolved scope has ≤5 specs → single subagent or inline, no batching.
   - If >5 specs → group into batches by package area, same as full mode but only for resolved specs.
   - Global specs (if resolved) go into their own batch.

### Phase 2 — Parallel Audit via Subagents

Launch one subagent per batch, all in parallel. Each subagent receives:

- The list of spec directories it must audit (just the paths, discovered in Phase 1)
- The package source and test directories to inspect
- The output format (Phase 3)
- The reminder that this is read-only
- **A unique output file path** where it MUST write its findings using the Write tool: `.specd/reports/spec-compliance/_partial-{batch-name}.md` (e.g., `_partial-global.md`, `_partial-core-1.md`, `_partial-cli-2.md`). This is CRITICAL — subagent text output gets truncated for large audits, so every subagent must persist its full results to disk before returning.

**IMPORTANT: Each subagent MUST use the Write tool to save its complete findings to its assigned `_partial-*.md` file.** The subagent's returned text message will likely be truncated for large batches. The file is the source of truth, not the returned message. Instruct each subagent explicitly:

> "You MUST write your complete audit output to `.specd/reports/spec-compliance/_partial-{name}.md` using the Write tool. Do NOT rely on your return message — it will be truncated. Write the file FIRST, then return a brief summary."

**For global spec subagents:**

1. Read `spec.md` and `verify.md` in each spec directory
2. Check the ENTIRE codebase for compliance (these are cross-cutting constraints)
3. Sample files from each package to verify conventions
4. Check that configuration (ESLint, TypeScript, etc.) matches relevant specs

**For package spec subagents:**

1. Read `spec.md` and `verify.md` in each spec directory
2. **Use GitNexus first to locate relevant code:**
   - `gitnexus_query({query: "<spec concept>"})` to find execution flows related to the spec's domain (e.g., `gitnexus_query({query: "change creation lifecycle"})` for the change spec). This returns processes grouped by relevance with file locations — far more precise than keyword grep.
   - `gitnexus_context({name: "<symbol>"})` on key symbols found in the query results to get the full picture: all callers, callees, and which execution flows the symbol participates in. This reveals whether a requirement is implemented across multiple call sites.
   - Fall back to Grep/Glob only when GitNexus doesn't surface the relevant code (e.g., for configuration files, static patterns, or newly added code not yet indexed).
3. Compare every requirement against the implementation
4. Find corresponding tests in the package's `test/` directory
5. Verify test coverage for each scenario in `verify.md`
6. If the implementation doesn't exist yet, note it as "NOT_IMPLEMENTED"
7. **Trace execution flows for behavioral requirements.** When a spec describes a multi-step process (e.g., "validates X then persists Y then emits Z"), use `gitnexus_query` to find the matching execution flow, then read `gitnexus://repo/specd/process/{processName}` to get the step-by-step trace. Compare the trace against the spec's expected sequence.
8. **Validate spec dependency chain.** Each spec may declare a `## Spec Dependencies` section listing other specs it depends on (as markdown links). For each dependency:
   - Read the referenced spec and verify that its requirements are **consistent** with what the current spec assumes about it. For example, if spec A says "specIds are validated against the filesystem" but the referenced spec B defines specIds as workspace-qualified strings with no filesystem validation, that's a cross-spec contradiction.
   - Check that concepts, terminology, and data structures used in the current spec match their definition in the dependency. If spec A references "approval gates" and depends on spec B for their config, verify that both specs agree on the gate names, defaults, and semantics.
   - Check that the dependency actually exists — a broken link to a non-existent spec is a finding.
   - This is **transitive**: if spec A depends on spec B, and spec B depends on spec C, and spec A makes claims that ultimately rely on spec C, verify the full chain is consistent. However, limit transitivity to depth 2 to keep audits tractable — flag deeper chains for manual review.
   - Report cross-spec contradictions in a dedicated subsection (see Phase 3 output format).

### Phase 3 — Subagent Output Format

Each subagent MUST produce structured output in this exact format for each spec it reviews:

```markdown
## `specs/{area}/{spec-name}/`

### Spec Requirements Summary

- [R1] Brief description of requirement 1
- [R2] Brief description of requirement 2
- ...

### Implementation Status

| Req | Status                                             | Code Location | Notes   |
| --- | -------------------------------------------------- | ------------- | ------- |
| R1  | CONFORMANT / DIVERGENT / NOT_IMPLEMENTED / UNCLEAR | `file:line`   | details |
| R2  | ...                                                | ...           | ...     |

### Discrepancies Found

#### [R_] Description of discrepancy

- **Spec says:** exact quote or summary from spec
- **Code does:** what the code actually does, with file:line reference
- **Hypothesis A — Spec is wrong:** why the code behavior might be intentional/correct
- **Hypothesis B — Code is wrong:** why the spec requirement might be the intended behavior
- **Hypothesis C — Both need updating:** if applicable
- **Recommendation:** which hypothesis seems most likely and why

### Test Coverage

| Req | Test Exists    | Test File   | Covers Spec?   | Notes   |
| --- | -------------- | ----------- | -------------- | ------- |
| R1  | YES/NO/PARTIAL | `file:line` | YES/NO/PARTIAL | details |

### Missing Tests

- List of requirements with no or insufficient test coverage
- For each, describe what test should exist

### Spec Dependency Chain

| Dependency                  | Status                                 | Notes   |
| --------------------------- | -------------------------------------- | ------- |
| `specs/core/config/spec.md` | CONSISTENT / CONTRADICTS / BROKEN_LINK | details |
| ...                         | ...                                    | ...     |

#### Cross-Spec Contradictions (if any)

- **This spec says:** exact quote or summary
- **Dependency `specs/X/spec.md` says:** contradicting quote or summary
- **Impact:** what breaks or becomes ambiguous because of this contradiction
- **Recommendation:** which spec should be corrected and why

### Summary

- Total requirements: N
- Conformant: N
- Divergent: N
- Not implemented: N
- Unclear: N
- Test coverage: N/M requirements covered
```

### Phase 4 — Compile Final Report

After all subagents complete:

1. **Read each partial file** from `.specd/reports/spec-compliance/_partial-*.md` using the Read tool. These files contain the complete, untruncated findings. Do NOT rely on subagent return messages — they may be truncated.

2. **Aggregate the numbers** from each partial file's per-spec `### Summary` sections to compute totals.

3. **Concatenate into the final report** using the structure below. The "Detailed Findings" section MUST include the COMPLETE contents of every `_partial-*.md` file verbatim — do NOT summarize, condense, or omit any spec's findings. Every spec's full Implementation Status table, Discrepancies, Test Coverage table, Missing Tests, and Spec Dependency Chain must appear in the final report.

4. **Write the report in sections if needed.** If the final report is too large for a single Write call, use multiple Write/Edit calls — write the header + executive summary first, then append each batch's detailed findings. Use `cat` via Bash to concatenate partial files if that is simpler:

```bash
cat .specd/reports/spec-compliance/_partial-global.md .specd/reports/spec-compliance/_partial-core-1.md ... > /tmp/details.md
```

5. **Clean up partial files** after the final report is written:

```bash
rm .specd/reports/spec-compliance/_partial-*.md
```

Final report structure:

```markdown
# Spec Compliance Report

**Generated:** {timestamp}
**Project:** specd
**Branch:** {current git branch}
**Commit:** {current HEAD short hash}
**Mode:** {Full | Single: core/change | Changed: N files | PR #42: N files}

---

## Executive Summary

- Total specs reviewed: N
- Total requirements checked: N
- Conformant: N (X%)
- Divergent: N (X%)
- Not implemented: N (X%)
- Unclear: N (X%)
- Test coverage: N/M requirements have adequate tests (X%)

### Critical Issues (must address)

1. ...

### Warnings (should address)

1. ...

### Notes (consider addressing)

1. ...

---

## Detailed Findings

{COMPLETE contents of each \_partial-\*.md file, in order: global, then core batches, then cli batches.
Include EVERY spec's full sections — Implementation Status table, Discrepancies, Test Coverage table,
Missing Tests, Spec Dependency Chain. Do NOT summarize or condense.}

---

## Cross-Cutting Observations

- Patterns of divergence across multiple specs
- Systematic test coverage gaps
- Architectural concerns that span multiple areas

---

## Appendix: Specs Reviewed

- List of all spec directories audited, grouped by area
```

### Phase 5 — Output

1. Write the compiled report with a mode-aware filename:
   - **Full mode**: `.specd/reports/spec-compliance/specs-compliance-{timestamp}.md`
   - **Single spec mode**: `.specd/reports/spec-compliance/specs-compliance-{spec-name}-{timestamp}.md` (e.g., `specs-compliance-change-20260311-143027.md`)
   - **Changed mode**: `.specd/reports/spec-compliance/specs-compliance-changed-{timestamp}.md`
   - **PR mode**: `.specd/reports/spec-compliance/specs-compliance-pr{N}-{timestamp}.md` (e.g., `specs-compliance-pr42-20260311-143027.md`)
2. Print a concise summary to screen showing:
   - Audit mode and scope (e.g., "Changed files mode: 3 specs from 7 changed files")
   - Total specs, conformant/divergent/not-implemented counts
   - Top 5 critical issues
   - Location of the full report

---

## Subagent Configuration

When launching subagents, use these settings:

- `subagent_type: "general-purpose"` — they need deep codebase access plus GitNexus MCP tools
- `model: "opus"` — use the most capable model for accuracy
- Give each subagent the exact list of spec directory paths it must review
- Tell each subagent to be exhaustive and follow the output format exactly
- Remind each subagent: **do NOT modify any code or spec files — only write to the assigned `_partial-*.md` output file**
- Instruct each subagent to use GitNexus tools (`gitnexus_query`, `gitnexus_context`, and process resources) as its primary code navigation method, falling back to Grep/Glob when needed
- **CRITICAL: Every subagent prompt MUST include this instruction:**
  > "When you have completed your audit, use the Write tool to save your COMPLETE findings to `.specd/reports/spec-compliance/_partial-{batch-name}.md`. Include every spec's full Implementation Status table, all Discrepancies, all Test Coverage tables, Missing Tests, and Spec Dependency Chain. Do NOT truncate or summarize. After writing the file, return only a brief summary message with the aggregate counts."
- The main agent must NOT attempt to reconstruct detailed findings from the subagent's return message. Always read the `_partial-*.md` files instead.

---

## Quality Standards

- Every claim must cite a specific file and line number
- Do not guess — if you can't find the relevant code, say so
- When a spec references another spec, follow the reference and check consistency
- Pay attention to edge cases described in `verify.md` scenarios
- Check that error types, error messages, and error handling match specs
- Check that function signatures, parameter names, and return types match
- Check domain entity invariants (constructors, state transitions, validation)
- For CLI commands, check argument parsing, output formatting, and error handling
- **Use `gitnexus_context` to verify all callers/callees of a symbol** — this catches cases where a domain invariant is bypassed by an unexpected caller, or where a validation exists in one call path but not another
- **Use `gitnexus_query` to find execution flows** — when a spec describes a process (e.g., "create → validate → persist"), query for it and compare the actual flow steps against the spec's expected sequence
- **Validate the spec dependency chain** — when a spec references another spec's concepts (e.g., "specIds are validated at creation time"), read the referenced spec and verify the claim is consistent. Contradictions between specs are findings, not assumptions to resolve silently

---

## Important Reminders

- **DO NOT modify any files** except writing the final report
- **DO NOT assume spec is always right** — present both sides of every discrepancy
- **DO NOT skip specs** — if a spec area seems trivial, still check it
- **DO NOT hardcode spec paths** — always discover them dynamically via Glob
- **DO check verify.md** — the scenarios there are testable requirements
- If a spec or code file is too large, read it in sections but still cover everything
- Use GitNexus tools as the primary code navigation method; use `Grep` and `Glob` as fallback for things GitNexus doesn't cover (config files, static patterns, unindexed code)
- If new spec directories or packages appear that you haven't seen before, handle them — do not ignore unknown areas
- If GitNexus index is stale, run `npx gitnexus analyze` before starting the audit
