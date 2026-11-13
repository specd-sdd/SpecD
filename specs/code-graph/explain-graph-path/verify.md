# Verification: ExplainGraphPath

## Requirements

### Requirement: Use case contract

#### Scenario: Project-relative input

- **GIVEN** workspace `core` with `codeRoot` `packages/core`
- **WHEN** `execute` receives `packages/core/src/a.ts`
- **THEN** the result `projectRelativePath` is `packages/core/src/a.ts` and the candidate identity is `core:src/a.ts`

#### Scenario: Absolute input is converted

- **GIVEN** project root `/project`
- **WHEN** `execute` receives `/project/packages/core/src/a.ts`
- **THEN** the result is the same as for `packages/core/src/a.ts`

#### Scenario: Absolute input outside the project

- **WHEN** `execute` receives a non-drive absolute path outside the project root that no workspace contains
- **THEN** `projectRelativePath` starts with `../` and the result carries `PATH_OUTSIDE_PROJECT`

#### Scenario: Workspace-qualified input pins the candidate

- **GIVEN** workspaces `backend` (`app`) and `backoffice` (`app/webroot`)
- **WHEN** `execute` receives `backoffice:iccomp.php`
- **THEN** the only candidate is `backoffice` and `projectRelativePath` is `app/webroot/iccomp.php`

#### Scenario: Unknown workspace

- **WHEN** `execute` receives `nope:src/a.ts`
- **THEN** it fails with a `SpecdError` coded `UNKNOWN_WORKSPACE`

#### Scenario: Drive-letter path is not a workspace path

- **WHEN** `execute` receives `C:/project/src/a.ts`
- **THEN** it is treated as an absolute path and not as workspace `C`

#### Scenario: Backslash and drive-letter inputs on any host

- **WHEN** `execute` receives `app\src\a.ts` or `C:\other\a.ts`
- **THEN** the first is explained as `app/src/a.ts` and the second as an absolute path outside the project, on every host

#### Scenario: Drive-letter outside keeps portable absolute spelling on Windows same-volume projects

- **GIVEN** a project root under a Windows temp path on the same volume as `C:\`
- **WHEN** `execute` receives `C:\other\a.ts`
- **THEN** `projectRelativePath` is `C:/other/a.ts`
- **AND** the result carries `PATH_OUTSIDE_PROJECT`
- **AND** `projectRelativePath` MUST NOT be a deep `../` walk such as `../../../../other/a.ts`

#### Scenario: Path does not exist

- **WHEN** `execute` receives a path that is not on disk
- **THEN** the result carries `PATH_NOT_FOUND`, rule steps are still evaluated, and `size-limit` and `adapter` are `not-applicable`

#### Scenario: Empty or escaping input

- **WHEN** `execute` receives an empty path, or `backend:../x.ts` whose path escapes the `codeRoot`
- **THEN** it fails with `INVALID_GRAPH_WHY_PATH`

#### Scenario: Path equal to a code root

- **WHEN** `execute` receives the path of a `codeRoot`
- **THEN** it returns an evaluation without pattern stages instead of failing

#### Scenario: Provider without configuration

- **GIVEN** a provider created without a project configuration
- **WHEN** it is asked to explain a path
- **THEN** it fails with `GRAPH_WHY_REQUIRES_CONFIG`

#### Scenario: No side effects

- **WHEN** `execute` runs
- **THEN** no graph write, file write or configuration change occurs

### Requirement: Candidates and owners

#### Scenario: Single owner

- **GIVEN** a file inside one workspace that passes discovery
- **WHEN** `execute` runs
- **THEN** `owners` has one workspace and the top-level verdict is `indexable`

#### Scenario: Two owners, no preference

- **GIVEN** `backend` (`app`) and `backoffice` (`app/webroot`) and a file passing discovery in both
- **WHEN** `execute` runs
- **THEN** `candidates` has both evaluations, `owners` lists both, and `MULTIPLE_OWNERS` is reported
- **AND** neither is marked primary

#### Scenario: Shared code root partitioned by excludes

- **GIVEN** two workspaces with the same `codeRoot`, each excluding the other's files
- **WHEN** `execute` runs for a file of the first
- **THEN** both are candidates, only the first is an owner, and no `MULTIPLE_OWNERS` is reported

#### Scenario: Candidate excluded everywhere

- **GIVEN** a file under two `codeRoot` values excluded in both
- **WHEN** `execute` runs
- **THEN** `owners` is empty and the top-level verdict is `not-indexed`
- **AND** each candidate gives its own reason

#### Scenario: Project-global path

- **GIVEN** a path in no `codeRoot` that matches `graph.includePaths`
- **WHEN** `execute` runs
- **THEN** a single evaluation with workspace `null` and identity `root:<path>` is returned

#### Scenario: Project-global path excluded

- **GIVEN** a path in no `codeRoot` that matches `graph.includePaths` but is excluded by a global exclusion
- **WHEN** `execute` runs
- **THEN** the single `root:<path>` evaluation is reported with the excluding rule and the top-level verdict is `not-indexed`

#### Scenario: Out of scope

- **GIVEN** a path in no `codeRoot` and matching no `graph.includePaths`
- **WHEN** `execute` runs
- **THEN** the top-level verdict is `not-in-scope` and there are no candidates

#### Scenario: Code root outside the project root

- **GIVEN** a candidate whose `codeRoot` is outside the project root
- **WHEN** `execute` runs
- **THEN** `CODE_ROOT_OUTSIDE_PROJECT` is reported

### Requirement: Same evaluation as the indexer

#### Scenario: Verdict equals indexing

- **GIVEN** a fixture project with exclusions, `allowedPaths`, size limits and categories
- **WHEN** every fixture path is explained and the project is indexed
- **THEN** each path is `indexable` exactly when it is indexed in that workspace, with the same category

#### Scenario: Global negation conflict matches the indexer

- **GIVEN** a global exclusion and a workspace negation for the same path
- **WHEN** it is explained
- **THEN** the verdict is `excluded` by the global layer, as in indexing

### Requirement: Ordered steps

#### Scenario: Stages in indexer order

- **WHEN** an indexable path is explained
- **THEN** `steps` list `binary-extension`, `gitignore`, `global-exclude`, `workspace-exclude`, `allowed-paths`, `size-limit`, `category`, `adapter` in that order, each `passed` or `not-applicable`

#### Scenario: Stops at the first exclusion

- **GIVEN** a path excluded at `global-exclude`
- **WHEN** it is explained
- **THEN** later stages are `not-applicable`

#### Scenario: gitignore rule origin

- **GIVEN** `respectGitignore: true` and a nested `.gitignore` line ignoring the path
- **WHEN** it is explained
- **THEN** the matched rule names the `.gitignore` file (project-relative), the line number and the pattern

#### Scenario: gitignore not evaluated when disabled

- **GIVEN** `respectGitignore: false`
- **WHEN** it is explained
- **THEN** the `gitignore` stage is `not-applicable`

#### Scenario: Spec-root exclusion origin

- **GIVEN** a path under a filesystem-backed spec root
- **WHEN** it is explained
- **THEN** the matched rule origin layer is `spec-root`

#### Scenario: Default exclusion origin

- **GIVEN** no configured `excludePaths` and `packages/core/node_modules/x.js`
- **WHEN** it is explained
- **THEN** the rule origin layer is `default`

#### Scenario: Workspace negation blocked

- **GIVEN** a global exclusion and a workspace `!` negation
- **WHEN** it is explained
- **THEN** the matched rule is the global one, and the workspace-exclude stage does not re-include the path

#### Scenario: Negation rule reported

- **GIVEN** a workspace list `['gen/**', '!gen/keep.ts']`
- **WHEN** `gen/keep.ts` is explained
- **THEN** the deciding rule is the negation `!gen/keep.ts`, flagged as negation

#### Scenario: Size gate

- **GIVEN** a file over `maxFileBytes`
- **WHEN** it is explained
- **THEN** the `size-limit` step shows the limit, the size and no exemption, and the verdict is `too-large`

#### Scenario: Size exemption

- **GIVEN** an oversized file matched by `largeFilePaths`
- **WHEN** it is explained
- **THEN** the `size-limit` step is `matched` with the exempting rule and `exempt: true`, and the verdict stays `indexable`

#### Scenario: Category rule

- **GIVEN** a path matching `testPaths`
- **WHEN** it is explained
- **THEN** the `category` step names the pattern and its level (project or workspace)

#### Scenario: Binary extension and symlink

- **GIVEN** a `.png` file and a symbolic link
- **WHEN** each is explained
- **THEN** the `binary-extension` step is `matched` with origin layer `builtin` and the verdict is `excluded`

#### Scenario: Binary content without adapter

- **GIVEN** a file with no language adapter whose content is not textual
- **WHEN** it is explained
- **THEN** the `adapter` step is `matched` with the `non-text-content` rule and the verdict is `excluded`, as in indexing

#### Scenario: Intermediate .gitignore origin

- **GIVEN** a `.gitignore` in a directory between the VCS root and the `codeRoot` that ignores the path, and a `codeRoot` reached through a symlink
- **WHEN** it is explained
- **THEN** the `gitignore` rule names that file relative to the project root and the line of the pattern

#### Scenario: Document without adapter

- **GIVEN** a textual file with no language adapter
- **WHEN** it is explained
- **THEN** the node kind is `document`

### Requirement: Verdicts and category

#### Scenario: Not allowed

- **GIVEN** `allowedPaths` that do not match the path
- **WHEN** it is explained
- **THEN** the candidate verdict is `not-allowed` and category is `null`

#### Scenario: Excluded

- **GIVEN** a workspace exclusion matching the path
- **WHEN** it is explained
- **THEN** the candidate verdict is `excluded` and category is `null`

#### Scenario: Top-level verdicts

- **WHEN** results have an owner, candidates without owners, or no candidates
- **THEN** the top-level verdict is respectively `indexable`, `not-indexed`, `not-in-scope`

### Requirement: Observed graph state

#### Scenario: Present in the store

- **GIVEN** the graph holds a node for the candidate identity
- **WHEN** it is explained
- **THEN** that candidate `inGraph` is `true`

#### Scenario: Configured but not indexed

- **GIVEN** an `indexable` path not yet in the store
- **WHEN** it is explained
- **THEN** `inGraph` is `false`

#### Scenario: Store unavailable

- **GIVEN** the store cannot be read
- **WHEN** it is explained
- **THEN** `inGraph` is `null` and rules are still returned

### Requirement: Diagnostics

#### Scenario: Diagnostics do not change the verdict

- **GIVEN** a path with `MULTIPLE_OWNERS`
- **WHEN** it is explained
- **THEN** the verdict is determined by the owners and not by the diagnostic

## Spec Dependencies

- `core:config`
- `code-graph:indexer`
- `code-graph:workspace-integration`
