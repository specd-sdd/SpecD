# Hotspots — Verification Scenarios

## Empty graph

WHEN `computeHotspots` is called on an empty graph
THEN it returns `{ entries: [], totalSymbols: 0 }`

## Ranking order

WHEN the graph contains symbols A (score 15), B (score 8), C (score 3)
THEN entries are ordered [A, B, C] by score descending

## Default filters exclude zero-score symbols

WHEN a symbol has no callers and its file has no importers
THEN it is excluded from the default result (score = 0 < minScore default of 1)

## Default filters exclude LOW risk

WHEN a symbol has score > 0 but risk level LOW
THEN it is excluded from the default result (minRisk default is MEDIUM)

## --all removes all default filters

WHEN `computeHotspots` is called with `minScore: 0, minRisk: 'LOW', limit: Infinity`
THEN all symbols are included regardless of score or risk

## --min-risk filter

WHEN `minRisk` is set to HIGH
THEN only symbols with risk HIGH or CRITICAL are returned

## Workspace filter

WHEN `workspace` is set to "packages/core"
THEN only symbols whose filePath starts with "packages/core/" are returned

## Kind filter

WHEN `kind` is set to "function"
THEN only symbols with kind "function" are returned

## Cross-workspace scoring

WHEN symbol X in workspace A is called by 2 symbols in workspace A and 1 symbol in workspace B
AND X's file has 3 importers
THEN X's score = (2 _ 3) + (1 _ 5) + 3 = 14
AND X's crossWorkspaceCallers = 1
AND X's directCallers = 2

## Limit

WHEN limit is 5 and there are 20 eligible symbols
THEN only the top 5 by score are returned

## File importer contribution

WHEN a symbol has 0 callers but its file has 5 importers
THEN score = 5 and the symbol is included (score > 0)

## totalSymbols reflects full graph

WHEN the graph has 100 symbols but only 10 pass filters
THEN `totalSymbols` is 100 and `entries` has length 10
