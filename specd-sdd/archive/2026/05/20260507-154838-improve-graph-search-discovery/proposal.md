# Proposal: improve-graph-search-discovery

## Motivation

The `graph search` command in the SpecD CLI is currently too restrictive when multiple search terms are provided, returning zero results if the terms do not co-exist within a single symbol or specification. This prevents users and agents from discovering related concepts across the codebase using keyword combinations.

## Current behaviour

The `sanitizeFtsQuery` function joins multiple search tokens using the `AND` operator for the SQLite FTS5 `MATCH` clause. For example, a search for "effectiveStatus findBlockingParent" is translated to `"effectiveStatus" AND "findBlockingParent"`. Since these terms typically belong to different symbols, the search fails to return any results even though both concepts are highly relevant to the same domain area.

## Proposed solution

Modify the query sanitization logic to implement a two-step discovery and precision model:

1.  **Discovery via OR logic**: Change the search token joining from `AND` to `OR`. This ensures a higher "recall", bringing in any symbol or specification that mentions at least one of the search terms, even if they are spread across different records.
2.  **Precision via BM25 Ranking**: Rely on the existing BM25 relevance scoring to provide "precision". Results that match more of the search terms, or match rare terms, will naturally receive a higher score and appear at the top of the results, providing a "Google-like" discovery experience.

## Specs affected

### New specs

- none

### Modified specs

- `code-graph:sqlite-graph-store`: Change the FTS query sanitization requirement from `AND` to `OR` logic to improve discovery while maintaining relevance ranking.
  - Depends on (added): none
- `code-graph:ladybug-graph-store`: Ensure parity with the SQLite implementation by updating its FTS query logic to use `OR` for multi-token searches.
  - Depends on (added): none

## Impact

This change affects the infrastructure layer of `@specd/code-graph`. It improves the output of the `specd graph search` CLI command and any internal agents using the code graph for discovery. No changes to the abstract `GraphStore` port or the public API are required.

## Technical context

- **Search Logic Parity**: Both SQLite (FTS5) and Ladybug will be updated to use this `OR` based approach to ensure consistent search behavior across backends.
- **Sanitization**: The `sanitizeFtsQuery` function will continue to wrap tokens in double quotes to prevent FTS5 syntax errors, but the join operator will change from `AND` to `OR`.
- **Ranking Dynamics**: Under `OR` logic, BM25 becomes the primary driver for result quality. A result containing all terms will significantly outscore results containing only one, preserving the utility of specific multi-term searches while enabling broader discovery.

## Open questions

- none
