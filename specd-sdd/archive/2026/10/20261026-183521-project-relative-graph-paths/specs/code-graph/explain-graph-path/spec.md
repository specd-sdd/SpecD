# ExplainGraphPath

## Purpose

When a file is missing from, or unexpectedly present in, the code graph, users must read configuration, `.gitignore`, defaults and size limits to find out why. `ExplainGraphPath` answers that question for one path by running the same evaluation functions the indexer uses and returning the decisive rule at every step, so an explanation cannot drift from real indexing. It is a code-graph application use case consumed through a composition factory; hosts reach it through `@specd/sdk`.

## Requirements

### Requirement: Use case contract

`ExplainGraphPath.execute(input)` SHALL accept a path and the effective project graph configuration, and return an `ExplainGraphPathResult` without modifying the graph store, the filesystem, or `specd.yaml`.

- `input.path` MUST accept a project-relative path, an absolute path (converted to project-relative before evaluation), or a workspace-qualified path `workspace:path` where `path` is relative to that workspace's `codeRoot` and the workspace name restricts the candidates to that workspace.
- A drive-letter input on a POSIX host is reported with its normalized absolute spelling (forward slashes) as `projectRelativePath`. A single-letter workspace name is ambiguous with a drive only when the path after the colon starts with `/` or `\`; write `c:src/a.ts`, not `c:/src/a.ts`, for such a workspace.
- Inputs MUST be normalized to forward slashes without a leading `./`, on every host: backslashes in a relative input are treated as separators, and a Windows drive-letter path is recognised as absolute even on a POSIX host (it is then outside the project). Drive-letter paths MUST NOT be parsed as `workspace:path`.
- An absolute path outside the project root SHALL be converted to a project-relative path starting with `../`.
- The path need not exist on disk. When it does not, the result SHALL carry the diagnostic `PATH_NOT_FOUND` and rule evaluation SHALL still be performed on the path text; the size and adapter steps are reported as `not-applicable`.
- A `workspace:path` whose workspace is not configured SHALL fail with a `SpecdError` coded `UNKNOWN_WORKSPACE`.
- An empty input, or a `workspace:path` whose path escapes that workspace's `codeRoot`, SHALL fail with a `SpecdError` coded `INVALID_GRAPH_WHY_PATH`. A path equal to a `codeRoot` (or to the project root) is explained as a directory without evaluating patterns.
- When the provider that hosts the use case was created without a project configuration (bootstrap mode), asking it to explain a path SHALL fail with a `SpecdError` coded `GRAPH_WHY_REQUIRES_CONFIG`.
- The `execute` JSDoc SHALL document the thrown errors with `@throws`.

The factory `createExplainGraphPath(...)` in `packages/code-graph/src/composition/use-cases/` SHALL follow the construction pattern of the other composition use-case factories (`getGraphHealth`, `getSpecCoverage`).

### Requirement: Candidates and owners

The result SHALL identify the workspaces that can claim the path, using `code-graph:workspace-integration` Requirement: Workspace ownership is decided by discovery rules.

- A **candidate** is every workspace whose `codeRoot` contains the path, in configuration order. A `workspace:path` input restricts the candidates to that workspace.
- The result SHALL contain one evaluation per candidate: its `workspace`, graph `identity` (`{workspace}:{pathBelowCodeRoot}`), `verdict`, `category`, `kind`, and `steps`.
- `owners` lists the candidates whose verdict is `indexable`. Candidates are not ranked: the configuration order of `candidates` and `owners` only makes the output stable and implies no preference between owners, and hosts MUST NOT treat the first owner as primary.
- When `owners` has more than one entry, the diagnostic `MULTIPLE_OWNERS` SHALL be added: the same physical file receives several graph identities, which usually means the workspaces' `excludePaths` or `allowedPaths` do not partition the files.
- The `includePaths` match is decided with the kind of the path (file or directory) as found on disk.
- When there are no candidates and the path matches project `graph.includePaths`, the path is evaluated as project-global with identity `root:{projectRelativePath}` and a single evaluation with workspace `null`; that evaluation is reported even when a global exclusion, `.gitignore`, the size gate or another step excludes the path, so the top-level verdict is then `not-indexed` and the deciding rule is shown. When the path matches no `graph.includePaths`, the top-level verdict is `not-in-scope` and there are no candidates.
- The result SHALL include the `projectRelativePath`.
- For a candidate whose `codeRoot` is outside the project root, the result SHALL carry the diagnostic `CODE_ROOT_OUTSIDE_PROJECT`, noting that anchored project-relative patterns cannot match.

### Requirement: Same evaluation as the indexer

Every decisive step SHALL be computed by the same functions the indexer uses for discovery, size gating and categorization (the `discoverFiles` ignore predicate, the file size gate, `classifyFileCategory`, the effective-graph-config resolver), exposed in variants that return the winning rule in addition to the decision. `ExplainGraphPath` MUST NOT reimplement pattern matching, layering or precedence. For any path, each candidate's verdict SHALL equal what discovery plus the size gate plus categorization decide for that path in that workspace in an indexing run with the same configuration.

### Requirement: Ordered steps

Each candidate evaluation SHALL contain a `steps` array in the order the indexer applies them. Each step has a `stage`, an `outcome` (`matched`, `passed`, `not-applicable`), and, for `matched`, the deciding `rule`. Stages are:

1. `binary-extension` — the built-in filter for known binary extensions and for symbolic links, which discovery never reads; a match is reported with origin layer `builtin` and verdict `excluded`.
2. `gitignore` — evaluated only when the workspace's `respectGitignore` is `true`; the rule gives the `.gitignore` file (path relative to the project root, in the `../` form when the file lies outside the project, for example a repository-level `.gitignore` above a project nested in the repository), the line number of the deciding pattern (the first line whose text equals it), and the pattern. This holds however the paths are spelled (symlinked code roots or VCS roots included).
3. `global-exclude` — project `graph.excludePaths` (or the built-in defaults) and the synthetic spec-root exclusions as the global layer; a synthetic spec-root exclusion is reported with origin `spec-root`.
4. `workspace-exclude` — the workspace's `excludePaths`, evaluated after the global layer and unable to re-include a path the global layer excluded.
5. `allowed-paths` — the workspace's `allowedPaths`.
6. `size-limit` — the effective `maxFileBytes`, the file size, and whether a `largeFilePaths` pattern exempts it. The step is `matched` when the file exceeds the limit (carrying the limit and size, no rule, verdict `too-large`) or when an exemption applies (carrying the exempting rule and `exempt: true`); it is `passed` when the file is within the limit.
7. `category` — `ignored`, `test` or `source`, with the matching `ignorePaths` or `testPaths` rule (project or workspace level), or the absence of a match for `source`.
8. `adapter` — whether a language adapter supports the file (becomes a file node) or the file is textual without an adapter (becomes a document). A file without an adapter whose content is not textual is not indexed: the step is `matched` with the built-in rule `non-text-content` and the verdict is `excluded`, exactly as the indexer records `non-text-content` coverage.

Evaluation of a candidate stops at the first stage that excludes the path; later stages are reported as `not-applicable`.

A `rule` SHALL contain the `pattern` as written, whether it is a negation, and an `origin` with `layer` (`gitignore`, `global`, `spec-root`, `workspace`, `default`, `builtin`) and, when applicable, the workspace name, the configuration key, and the source file.

### Requirement: Verdicts and category

Each candidate evaluation SHALL contain exactly one `verdict`:

- `excluded` — a `binary-extension`, `gitignore`, `global-exclude` or `workspace-exclude` rule excluded the path.
- `not-allowed` — the workspace's `allowedPaths` does not match.
- `too-large` — the file exceeds the effective `maxFileBytes` and no `largeFilePaths` pattern exempts it.
- `indexable` — all stages pass; `category` and the node kind (`file` or `document`) are populated.

The result SHALL also contain a top-level `verdict`: `indexable` when `owners` is non-empty, `not-indexed` when there are candidates but none is an owner (the per-candidate verdicts give the reasons), and `not-in-scope` when there are no candidates and no `graph.includePaths` match.

When a candidate verdict is `indexable`, its `category` SHALL be `source`, `test` or `ignored`; otherwise `category` is `null`.

### Requirement: Observed graph state

The result SHALL include `inGraph` per candidate, a boolean stating whether the graph store currently holds a node for that candidate's identity, so that a user can compare the configured outcome with the indexed state. The lookup is read-only. When the store is unavailable, `inGraph` SHALL be `null` and the rule evaluation SHALL still be returned.

### Requirement: Diagnostics

The result SHALL contain a `diagnostics` array of `{ code, message }` entries. Codes:

- `PATH_NOT_FOUND` — the path does not exist on disk.
- `CODE_ROOT_OUTSIDE_PROJECT` — a candidate's `codeRoot` is outside the project root.
- `PATH_OUTSIDE_PROJECT` — the path resolves outside the project root and no workspace contains it.
- `MULTIPLE_OWNERS` — more than one candidate is an owner.

Diagnostics do not change the verdict.

## Constraints

- The use case is read-only: no graph writes, no file writes, no configuration changes.
- No pattern evaluation, layering or classification logic is duplicated outside the indexer's evaluation functions.
- The result uses `projectRelativePath` for every filesystem location it reports.
- The use case contains no CLI formatting.

## Spec Dependencies

- `core:config` — project-relative path semantics, graph keys and layering
- `code-graph:indexer` — evaluation functions and project-relative path evaluation shared with indexing
- `code-graph:workspace-integration` — identities, `projectRelativePath`, ownership decided by discovery rules
