---
status: accepted
date: 2026-10-28
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0031: Project-Relative Graph Paths and Non-Overridable Global Excludes

## Context and Problem Statement

Paths and patterns in `specd.yaml` were interpreted against different roots depending on the key and on where a list was evaluated. Global `graph.excludePaths` was project-relative in project-global discovery but `codeRoot`-relative in workspace discovery. Workspace lists were `codeRoot`-relative, and global `testPaths` and `ignorePaths` were matched on the `codeRoot`-relative path. A user could not tell from the YAML which file a pattern referred to, which broke nested workspaces such as `app` and `app/webroot`.

The effective graph configuration also concatenated global, synthetic and workspace-local excludes into one gitignore-style list where the last match wins. A workspace-local `!pattern` could therefore re-include a path excluded globally, contradicting `core:config`.

Finally, explaining why a path is missing from the graph required reading configuration, `.gitignore`, defaults and size limits by hand.

## Decision Drivers

- A pattern must mean the same file wherever it is evaluated.
- Global exclusions must be authoritative.
- An explanation of a path must not drift from real indexing.

## Considered Options

1. Keep per-key roots and document them. Rejected: the burden stays on the user and nested workspaces remain ambiguous.
2. Make every path and pattern in every graph key and level project-root-relative, evaluate global excludes separately from workspace-local ones, and add an explain command that reuses the indexer's evaluation functions. Chosen.

## Decision Outcome

Every path and pattern under graph keys, global and workspace level, is interpreted relative to the project root. Workspace-local excludes are evaluated apart from global ones and cannot re-include a globally excluded path. `graph why` (cli -> sdk `runGraphWhy` -> code-graph `ExplainGraphPath`) returns the decisive rule at each step by running the same evaluation functions as the indexer.

## Consequences

- Good: one root for all graph paths; nested workspaces behave predictably.
- Good: global exclusions cannot be overridden.
- Good: `graph why` cannot disagree with indexing.
- Bad: breaking change for configurations that used `codeRoot`-relative workspace patterns; accepted in alpha.

## Decision Outcome Confirmation

Confirmed by the code-graph, sdk and cli test suites covering project-relative resolution, non-overridable global excludes and `graph why` output.

## More Information

- Spec: `core:config`
- Spec: `code-graph:indexer`
- Spec: `code-graph:workspace-integration`
- Spec: `code-graph:explain-graph-path`
- Spec: `sdk:run-graph-why`
- Spec: `cli:graph-why`
