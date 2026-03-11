---
name: code-reviewer
description:
  Use this skill to review code exhaustively. Supports local changes (staged/working tree),
  remote Pull Requests (by number or URL), and full codebase reviews. Analyzes correctness,
  maintainability, security, architecture compliance, and more using parallel subagents
  with the most capable model.
argument-hint: '[PR number, URL, or leave empty for local changes]'
allowed-tools: Bash(git *), Bash(gh *), Bash(npm run *), Bash(pnpm run *), Bash(npx *), Read, Grep, Glob, Agent, mcp__gitnexus__query, mcp__gitnexus__context, mcp__gitnexus__impact, mcp__gitnexus__detect_changes, mcp__gitnexus__cypher, ReadMcpResourceTool, ListMcpResourcesTool
---

# Code Reviewer

Conduct exhaustive, professional code reviews. Always use the **most capable model** (`model: "opus"`) for all Agent subagents.

---

## Phase 0 — Determine Scope

Parse `$ARGUMENTS` to determine the review target:

| Input                              | Mode                | Scope                           |
| ---------------------------------- | ------------------- | ------------------------------- |
| PR number or URL                   | **PR Review**       | All files changed in the PR     |
| Empty / "my changes"               | **Local Review**    | Staged + unstaged changes       |
| "full" / "everything" / "codebase" | **Full Review**     | All source files in the project |
| File path or glob                  | **Targeted Review** | Only the specified files        |

---

## Phase 1 — Gather Context

### 1a. Collect the code to review

**PR Review:**

```bash
gh pr view $ARGUMENTS --json title,body,baseRefName,headRefName,files,reviews,comments
gh pr diff $ARGUMENTS
```

- Read the PR description, existing review comments, and linked issues.
- Identify ALL changed files — read their FULL content, not just the diff. Context around changes is critical.
- Check CI status: `gh pr checks $ARGUMENTS`

**Local Review:**

```bash
git status
git diff
git diff --staged
git log --oneline -10  # recent commit context
```

- Read the full content of every modified file.

**Churn analysis (all modes):**

For each file in scope, check how many times it has changed recently — high-churn files carry higher regression risk and deserve deeper scrutiny:

```bash
git log --oneline -20 -- <file>
```

Flag files with > 5 commits in the last 20 as high-churn. Spend proportionally more analysis depth on them.

**Full Review:**

- Discover source files: `**/*.ts`, `**/*.tsx`, `**/*.js`, `**/*.jsx`, `**/*.py`, etc.
- Count total files. If > 40, use parallel Agent subagents (see Phase 2b).

### 1b. Load project standards

The review MUST verify compliance against ALL applicable specs, not a cherry-picked subset.

**Step 1 — Load global specs (apply to every file in every package):**

Discover and read every `spec.md` under `specs/_global/`:

```bash
find specs/_global -name 'spec.md' -type f
```

Read ALL of them. Each one is a binding constraint. Common ones include architecture, conventions, testing, commits, docs, eslint, spec-layout, schema-format, config — but do not assume a fixed list. Read whatever exists.

Also read the paired `verify.md` in each directory if you need to understand edge cases or expected behaviour for a particular rule.

**Step 2 — Load scope-specific specs (apply to the package being reviewed):**

For each package in scope, discover and read its specs:

```bash
# Example: when reviewing @specd/core
find specs/core -name 'spec.md' -type f
```

These are binding for that package and add to (not replace) the global constraints.

**Step 3 — Load active Architecture Decision Records:**

Discover all ADRs:

```bash
find docs/adr -name '*.md' -type f | sort
```

For each ADR, read the file and check the `status:` frontmatter field. Only load ADRs with `status: accepted`. Skip any with `status: deprecated`, `status: superseded`, or similar. These are binding architectural decisions that code must respect — treat violations as Critical findings.

**Step 4 — Load project-level configuration:**

```
CLAUDE.md, AGENTS.md                          # Agent instructions / project context
.eslintrc*, eslint.config*                    # ESLint rules
tsconfig.json                                 # TypeScript strictness settings
```

**Every finding must cite which spec or ADR it violates** — e.g., "Violates `specs/_global/architecture/spec.md` — Requirement: Domain layer is pure." or "Violates `docs/adr/0001-hexagonal-architecture.md` — Decision: infrastructure adapters must implement ports."

### 1c. Understand the architecture

Before reviewing code, build a mental model using GitNexus as the primary navigation tool:

**Step 1 — Check index freshness and get codebase overview:**

```
READ gitnexus://repo/specd/context
```

If stale, run `npx gitnexus analyze` before proceeding.

**Step 2 — Map the functional areas:**

```
READ gitnexus://repo/specd/clusters
```

This gives you all functional areas with cohesion scores — a pre-computed view of how code is organized, replacing manual barrel-file reading.

**Step 3 — Understand execution flows:**

```
READ gitnexus://repo/specd/processes
```

This lists all execution flows in the codebase. Use it to understand how components interact.

**Step 4 — Fill gaps with manual inspection:**

- Read barrel files (`index.ts`, `package.json`) only for details GitNexus doesn't surface (e.g., exact export lists, package metadata).
- Identify entry points (CLI, API, MCP) if not clear from the processes list.

### 1d. Cross-package impact (monorepo)

If any changed file is a public export (appears in a package's `index.ts` or `exports` in `package.json`), identify all other packages in the monorepo that depend on it.

For each changed public symbol, run impact analysis to get the full blast radius:

```
gitnexus_impact({target: "symbolName", direction: "upstream"})
```

This returns direct callers (d=1), indirect dependents (d=2-3), affected execution flows, and a risk level.

For a 360-degree view of a specific symbol (callers, callees, execution flow participation):

```
gitnexus_context({name: "symbolName"})
```

Use this to determine whether the change broke any cross-package contract. Flag any cross-package breakage as Critical.

**Fallback (if GitNexus is unavailable or index is stale):**

```bash
find packages -name 'package.json' -not -path '*/node_modules/*'
```

Read each `package.json` and check `dependencies` / `devDependencies` for the changed package. For each dependent package, search for imports of the changed symbol.

### 1d. Run automated checks (if available)

Ask the user before running. If they agree:

```bash
# TypeScript compilation
npx tsc --noEmit 2>&1 | head -50

# Linting
npm run lint 2>&1 | head -100

# Tests
npm test 2>&1 | tail -50
```

Log results — they inform the review but don't replace manual analysis.

---

## Phase 2 — Deep Analysis

### 2a. Per-file analysis (for PR/Local/Targeted reviews)

For each changed file, read the FULL file and analyze against ALL pillars below. Do not skim. Do not skip files.

### 2b. Parallel analysis (for Full Codebase reviews)

When reviewing > 40 files, split into parallel Agent subagents. **Always use `model: "opus"`** for subagents.

Partition strategy — split by architectural layer or directory:

- **Subagent 1**: Domain layer (entities, value objects, errors, domain services)
- **Subagent 2**: Application layer (ports, use cases, application errors)
- **Subagent 3**: Infrastructure layer (adapters, parsers, validators)
- **Subagent 4**: Composition layer (factories, kernel, wiring)
- **Subagent 5**: Satellite packages (CLI, MCP, plugins, schemas)
- **Subagent 6**: Tests (all test files)

If the project doesn't follow this structure, partition by directory or package.

Each subagent prompt MUST include:

1. The full list of review pillars (copy verbatim from section 2c below)
2. The full text of ALL global specs (`specs/_global/*/spec.md`) — every one of them, not a subset
3. The full text of ALL scope-specific specs for the package the subagent is reviewing (e.g., `specs/core/*/spec.md`)
4. The specific list of files to review
5. Instructions to read EVERY file completely and return structured findings
6. Instructions to check compliance against EVERY spec provided, citing the spec for each violation

### 2c. Review Pillars — Exhaustive Checklist

Every file must be evaluated against ALL of the following:

---

#### Pillar 1: Correctness

**Logic:**

- [ ] Does the code do what its name/docs/tests claim?
- [ ] Off-by-one errors in loops, slices, ranges, indices?
- [ ] Correct operator usage (`===` vs `==`, `&&` vs `||`, bitwise vs logical)?
- [ ] Correct order of operations and short-circuit evaluation?
- [ ] Correct handling of return values (especially for functions that return `null`/`undefined`/`false`/`0`)?

**State:**

- [ ] State machines: are all transitions valid? Any unreachable or missing states?
- [ ] Mutable shared state: any risk of concurrent modification?
- [ ] Object identity vs equality: using reference comparison where deep equality is needed?
- [ ] Defensive copying: are mutable inputs/outputs protected from external mutation?

**Async:**

- [ ] All async operations properly `await`ed? No floating promises?
- [ ] Error handling in async chains: `.catch()` on promises, try/catch around `await`?
- [ ] Race conditions: TOCTOU between check and use? Concurrent modifications?
- [ ] Resource cleanup in async code: are `finally` blocks used for cleanup?
- [ ] Deadlock potential in complex async flows?

**Types:**

- [ ] Are type assertions (`as`) justified? Could they mask bugs?
- [ ] Non-null assertions (`!`): is the non-null guarantee actually upheld?
- [ ] Index signatures: could `undefined` values sneak through?
- [ ] Discriminated unions: are all variants handled (exhaustive switch)?
- [ ] Generic constraints: are they tight enough to prevent misuse?

---

#### Pillar 2: Maintainability

**Structure:**

- [ ] Single Responsibility: does each class/function/module do one thing?
- [ ] Is the file too long? (> 300 lines for a single class/module is a smell)
- [ ] Are abstractions at the right level? (not too abstract, not too concrete)
- [ ] Could new requirements be added without modifying existing code (Open/Closed)?
- [ ] Is there duplicated logic across files that should be extracted?

**Dependencies:**

- [ ] Are dependencies injected (not imported directly from infrastructure)?
- [ ] Are import paths clean? No reaching into another module's internals?
- [ ] Are circular dependencies present (directly or transitively)?
- [ ] Are there unused imports or dependencies?

**API Design:**

- [ ] Are public APIs minimal? (don't expose more than needed)
- [ ] Are function signatures clear? (no boolean parameters that change behavior)
- [ ] Are return types unambiguous? (`T | null` vs throwing — pick one convention)
- [ ] Are input types validated at boundaries?
- [ ] Are breaking changes introduced? Are they documented?

---

#### Pillar 3: Readability

**Naming:**

- [ ] Do names reveal intent? (`filteredUsers` not `arr2`)
- [ ] Consistent naming conventions? (camelCase, PascalCase, kebab-case per project rules)
- [ ] No misleading names? (a function called `getUser` that also modifies state)
- [ ] Acronyms/abbreviations: are they project-standard or cryptic?

**Code organization:**

- [ ] Is the code organized top-down? (public API first, helpers last — or the reverse, consistently)
- [ ] Are related things grouped together?
- [ ] Are imports organized? (stdlib, external, internal, relative)

**Comments and docs:**

- [ ] JSDoc on public API? (classes, exported functions, complex types)
- [ ] Comments explain _why_, not _what_?
- [ ] No commented-out code left behind?
- [ ] No misleading/stale comments?
- [ ] Are TODOs tracked with issue references?

---

#### Pillar 4: Efficiency

**Algorithmic:**

- [ ] Appropriate data structure? (Map/Set vs Array for lookups)
- [ ] O(n^2) or worse when O(n) or O(n log n) is possible?
- [ ] Unnecessary recomputation? (same value calculated multiple times in a loop)
- [ ] String concatenation in loops? (use array + join)

**I/O:**

- [ ] Redundant filesystem reads/writes?
- [ ] N+1 query patterns? (loop of individual reads vs batch)
- [ ] Unbounded reads? (reading entire files when only headers are needed)
- [ ] Are large operations streamed or loaded entirely into memory?

**Memory:**

- [ ] Large objects retained unnecessarily? (closures capturing more than needed)
- [ ] Potential memory leaks? (event listeners not removed, timers not cleared)
- [ ] Are temporary large arrays/maps cleaned up after use?

**Caching:**

- [ ] Are expensive pure computations cached/memoized when called repeatedly?
- [ ] Are cached values invalidated when underlying data changes?

---

#### Pillar 5: Security

**Injection:**

- [ ] Command injection: is user input passed to `exec`/`execSync`? Use `execFile` instead.
- [ ] SQL injection: are queries parameterized?
- [ ] Path traversal: are file paths validated/sandboxed? Does `path.join` receive untrusted input?
- [ ] Template injection: are template engines configured to auto-escape?
- [ ] Regex DoS (ReDoS): are regexes safe against catastrophic backtracking?

**Data handling:**

- [ ] Secrets in code? API keys, passwords, tokens in source files?
- [ ] Are secrets loaded from environment variables or secure stores?
- [ ] Sensitive data in logs? (passwords, tokens, PII)
- [ ] Are inputs validated/sanitized at system boundaries?

**Dependencies:**

- [ ] Known vulnerable dependencies? (`npm audit`)
- [ ] Are dependency versions pinned or using floating ranges?

**Filesystem:**

- [ ] Are symlinks followed safely?
- [ ] Are file permissions set correctly?
- [ ] Are temporary files created securely? (unique names, proper cleanup)
- [ ] Defense-in-depth: is the resolved path verified to be within expected directories?

**Process:**

- [ ] Are child processes spawned with minimal privileges?
- [ ] Is `shell: true` avoided in `spawn`/`execFile`?
- [ ] Are environment variables sanitized when passed to child processes?

---

#### Pillar 6: Edge Cases and Error Handling

**Inputs:**

- [ ] Null/undefined inputs handled?
- [ ] Empty strings, empty arrays, empty objects?
- [ ] Very large inputs? Very long strings?
- [ ] Unicode/special characters?
- [ ] Negative numbers, zero, NaN, Infinity?

**Error handling:**

- [ ] Are errors caught at appropriate levels? (not too early, not too late)
- [ ] Are errors typed? (custom error classes with machine-readable codes)
- [ ] Are errors propagated correctly? (not swallowed silently)
- [ ] Are error messages actionable? (include context: what failed and why)
- [ ] Are cleanup operations in `finally` blocks?
- [ ] Is the system left in a consistent state after partial failures?

**Boundaries:**

- [ ] Filesystem: ENOENT, EACCES, EEXIST handled?
- [ ] Network: timeouts, connection refused, DNS failures?
- [ ] Parsing: malformed input, unexpected types, missing fields?

---

#### Pillar 7: Testability

**Coverage:**

- [ ] Does every public function/method have at least one test?
- [ ] Are invariant-enforcing methods tested for both success and failure cases?
- [ ] Are edge cases tested? (empty input, boundary values, error paths)
- [ ] Are new features covered by new tests?
- [ ] Are bug fixes accompanied by a regression test?

**Quality:**

- [ ] Are tests independent? (no shared mutable state between tests)
- [ ] Are test descriptions clear? ("given X, when Y, then Z")
- [ ] Are assertions specific? (not just "doesn't throw" — check the actual result)
- [ ] Are mocks/stubs properly typed? (no `as unknown as Port` or `as any`)
- [ ] Are mocks complete? (implement all interface methods, not just the ones used)

**Patterns:**

- [ ] No snapshot tests (if project forbids them)?
- [ ] No filesystem/network access in unit tests?
- [ ] Integration tests clean up after themselves? (temp dirs, DB state)
- [ ] Are test helpers/factories used to reduce boilerplate?
- [ ] Are test helpers shared, not duplicated across test files?

**Test gap prescription:**

For every public function, method, or invariant that lacks adequate test coverage, do not just flag the absence — describe specifically what test should exist:

- Which scenario or requirement from the spec it should cover
- What input, what expected output or behaviour
- Which error paths need a dedicated test case

This makes the gap actionable, not just observable.

---

### 2d. Cross-File Analysis

After per-file review, perform cross-cutting analysis using GitNexus as the primary tool.

**Structural checks via knowledge graph:**

```
# Find layer boundary violations — e.g., domain importing infrastructure
gitnexus_cypher({query: "MATCH (a:Symbol)-[:IMPORTS]->(b:Symbol) WHERE a.layer = 'domain' AND b.layer = 'infrastructure' RETURN a.name, b.name, a.file, b.file"})

# Find circular dependencies between modules
gitnexus_cypher({query: "MATCH (a:Symbol)-[:IMPORTS]->(b:Symbol)-[:IMPORTS]->(a) RETURN a.name, b.name, a.file, b.file"})

# Find conceptually related code that may be duplicated
gitnexus_query({query: "spec resolution"})
```

**Enrich findings with context:**

For each symbol flagged in findings, use `gitnexus_context({name: "symbolName"})` to show the full dependency picture (callers, callees, process participation). This makes recommendations more actionable — the reviewer sees not just the problem, but its blast radius.

**Manual cross-file checks (complement GitNexus results):**

- **Duplication:** look for near-identical functions/methods across files; check for duplicated type definitions
- **Consistency:** are similar problems solved the same way? Are naming and error handling patterns uniform?
- **API surface:** are barrel files (`index.ts`) exporting the right things? Are internal details leaking?

---

## Phase 3 — Synthesize and Report

### 3a. Aggregate findings

If using parallel subagents, merge their results:

1. Deduplicate findings that span multiple files
2. Promote findings that affect multiple areas (e.g., duplicated patterns)
3. Group related findings under a single heading
4. Number all findings sequentially (C1, C2... I1, I2... N1, N2...)

### 3b. Score each pillar

Rate each pillar on a 1–10 scale:

| Score | Meaning                                                  |
| ----- | -------------------------------------------------------- |
| 10    | Exemplary — no issues found, could serve as a reference  |
| 8–9   | Strong — minor issues only                               |
| 6–7   | Adequate — some improvements needed                      |
| 4–5   | Concerning — significant issues that should be addressed |
| 1–3   | Critical — fundamental problems that must be fixed       |

### 3c. Write the review document

Use this structure:

```markdown
# Code Review — [target description]

**Date:** [YYYY-MM-DD]
**Scope:** [PR #N / Local changes / Full codebase (N files)]
**Methodology:** code-reviewer skill — exhaustive 7-pillar analysis
**Model:** [model used for analysis]

---

## Summary

[3-5 sentences: overall quality assessment, key themes, most important findings]

---

## Pillar Scores

| Pillar                      | Score    | Key Issues         |
| --------------------------- | -------- | ------------------ |
| Correctness                 | X/10     | [one-line summary] |
| Maintainability             | X/10     | [one-line summary] |
| Readability                 | X/10     | [one-line summary] |
| Efficiency                  | X/10     | [one-line summary] |
| Security                    | X/10     | [one-line summary] |
| Edge Cases & Error Handling | X/10     | [one-line summary] |
| Testability                 | X/10     | [one-line summary] |
| **Overall**                 | **X/10** |                    |

---

## Findings

### Critical

[Numbered: C1, C2, C3...]
Each finding MUST include:

- A checkbox prefix for tracking: `- [ ] **C1. Title**`
- `file:line` reference(s)
- Description of the problem
- WHY it's critical (what can go wrong)
- Recommended fix

### Improvements

[Numbered: I1, I2, I3...]
Each finding MUST include:

- A checkbox prefix for tracking: `- [ ] **I1. Title**`
- `file:line` reference(s)
- Description of the issue
- Benefit of fixing it

### Nitpicks

[Numbered: N1, N2, N3... — optional]

- A checkbox prefix for tracking: `- [ ] **N1. Title**`
- Minor style, formatting, naming issues

---

## Spec Compliance

For EACH spec loaded in Phase 1 (global + scope-specific), add a subsection:

### [spec name] (e.g., Architecture, Conventions, Testing, ...)

- **Spec:** `specs/_global/<name>/spec.md` (or `specs/<package>/<name>/spec.md`)
- **Requirements checked:** [list each requirement from the spec]
- **Status per requirement:** PASS / PARTIAL / FAIL
- Specific violations with `file:line` references and quoted spec text
- **Score:** X/10

**IMPORTANT — Every violation is a finding:** Every PARTIAL or FAIL requirement MUST also appear as a numbered finding in the Findings section (Critical, Improvement, or Nitpick — classified by severity). The Spec Compliance section is the audit trail; the Findings section is the actionable checklist. No violation stays only in compliance — it must always be promoted to a finding so it is tracked and fixable.

Repeat for every spec that applies to the files under review. Do NOT skip specs
— if a spec exists under `specs/_global/`, every file must be checked against it.
If a package-specific spec exists for the reviewed package, add it too.

---

## Conclusion

**Verdict:** [Approved / Approved with Suggestions / Request Changes]

### Must Fix (blocking)

[Checkbox list referencing critical items — e.g., `- [ ] **C1** — Extract ContentHasher port...`]

### Should Fix (non-blocking)

[Checkbox list referencing improvement items — e.g., `- [ ] **I1** — Decompose CompileContext...`]

### Nice to Have

[Checkbox list referencing optional items — e.g., `- [ ] **I4** — Validate Change constructor...`]
```

### 3d. Severity classification rules

Apply these consistently:

**Critical** (must fix):

- Bugs that produce wrong results
- Security vulnerabilities (injection, traversal, secrets exposure)
- Data loss or corruption risks
- Spec/architecture violations that break fundamental invariants
- Breaking changes to public API without documentation
- Infinite loops/recursion without termination guards
- Resource leaks (file handles, connections, memory)

**Improvement** (should fix):

- Code duplication (3+ occurrences or > 10 lines duplicated)
- Performance issues (O(n^2) where O(n) suffices, redundant I/O)
- Missing tests for public API or invariant-enforcing code
- Inconsistent error handling patterns
- Overly complex code (cyclomatic complexity, file length)
- Missing `readonly` / immutability where appropriate
- Non-determinism in pure code (e.g., `new Date()` in domain)

**Nitpick** (nice to fix):

- Style inconsistencies within the file
- Minor naming improvements
- Import ordering
- Comment improvements
- Type narrowing that could be more precise

---

## Phase 4 — Deliver

### Always persist the review

Every review MUST be written to a file so it is never lost:

```bash
mkdir -p .codereview
```

**File path:** `.specd/reports/code-review/review-{timestamp}.md`

Where `{timestamp}` is `YYYYMMDD-HHmmss` (e.g., `.specd/reports/code-review/review-20260302-143027.md`).

For PR reviews, include the PR number: `.specd/reports/code-review/review-PR123-20260302-143027.md`

### Then deliver to the user

**For Local/Full Reviews:**

1. Write the review to `.specd/reports/code-review/review-{timestamp}.md`
2. Present a summary to the user (key findings, verdict, scores)
3. Commit and push if requested

**For PR Reviews:**

1. Write the review to `.specd/reports/code-review/review-PR{N}-{timestamp}.md`
2. Present a summary to the user
3. Ask if they want to:
   - Post as a PR review comment: `gh pr review $ARGUMENTS --body "..."`
   - Post individual inline comments on specific lines
   - Switch back to the default branch

---

## Phase 5 — Offer a Fix Plan

After delivering the review, **always** ask the user:

> "¿Querés que cree un plan para corregir los problemas encontrados?"

(Or in English if the conversation is in English: "Would you like me to create a plan to fix the issues found?")

### If the user says YES:

**Step 1 — Identify open questions**

Before writing the plan, reflect on the review findings. For each critical or improvement item, determine whether you have enough information to prescribe a concrete fix:

- Is the intended behavior unambiguous, or could it go multiple ways?
- Are there architectural trade-offs the user should decide (e.g., two valid approaches)?
- Is there missing context that would change the recommended fix?
- Are there findings where the root cause is unclear and you'd need to dig deeper?

Compile a list of any open questions. If you have **zero** open questions, skip Step 2 and go directly to Step 3.

**Step 2 — Ask clarifying questions (only if needed)**

Ask ONLY the questions you genuinely need answered to produce a correct, non-ambiguous plan. Do not ask about things you already know or that have a clear single answer.

Present them concisely, grouped if related. Wait for the user's answers before proceeding.

**Step 2b — Impact analysis before planning**

Before writing the plan, run impact analysis on each symbol that will be modified:

```
gitnexus_impact({target: "symbolToFix", direction: "upstream"})
```

This reveals the blast radius of each fix, helping prioritize order-of-attack and identify hidden dependencies between fixes. Include the risk level and affected dependents in the plan. If any fix has HIGH or CRITICAL risk, flag it explicitly so the user can decide on the approach.

**Step 3 — Enter plan mode**

Use the `EnterPlanMode` tool to switch to plan mode. Inside plan mode, write a concrete, ordered implementation plan to the plan file covering:

- Each **Critical** finding (C1, C2, ...) — specific file, line, and exact change to make
- Each **Improvement** finding (I1, I2, ...) — specific file, line, and action
- Any **Nitpick** worth addressing
- Suggested order of attack (considering dependencies between fixes)
- Estimated scope (files touched, rough complexity)

Then call `ExitPlanMode` to present the plan to the user for approval. The user will review and approve before any code is touched.

**Step 4 — Ask about branching (after plan approval)**

Once the user approves the plan, before writing any code, ask:

> "¿Querés trabajar en una rama nueva para estas correcciones?"

(Or in English: "Would you like to work on a new branch for these fixes?")

- If **yes**: ask for a branch name (or suggest one like `fix/code-review-YYYYMMDD`), then run `git checkout -b <branch-name>` before making any changes.
- If **no**: proceed on the current branch.

### If the user says NO:

Thank them and close. No plan is produced.

---

## Tone and Approach

- Be **specific**: every finding has a `file:line` reference and a concrete recommendation.
- Be **honest**: don't inflate scores or soften real problems. A critical bug is critical.
- Be **constructive**: explain WHY something is a problem, not just that it is.
- Be **fair**: acknowledge what's done well. Good code deserves recognition.
- Be **thorough**: read every file completely. Don't skim. Don't assume. Don't skip.
- Reference **project standards** when flagging violations — cite the spec.
- Use the **most capable model** for all analysis. Quality over speed.
