# Verification: Traversal

## Requirements

### Requirement: Upstream traversal

#### Scenario: Direct callers returned at depth 1

- **GIVEN** symbol C is called by symbols A and B
- **WHEN** `getUpstream(store, C.id)` is called
- **THEN** `levels.get(1)` contains A and B

#### Scenario: Transitive callers at correct depth

- **GIVEN** D calls C, C calls B, B calls A
- **WHEN** `getUpstream(store, A.id, { maxDepth: 3 })` is called
- **THEN** B is at depth 1, C is at depth 2, D is at depth 3

#### Scenario: Cycle broken at shallowest depth

- **GIVEN** A calls B, B calls C, C calls A (cycle)
- **WHEN** `getUpstream(store, A.id)` is called
- **THEN** A is not revisited and the traversal terminates

#### Scenario: maxDepth limits traversal

- **GIVEN** a call chain of depth 5
- **WHEN** `getUpstream(store, target.id, { maxDepth: 2 })` is called
- **THEN** only depths 1 and 2 are returned and `truncated` is true

### Requirement: Downstream traversal

#### Scenario: Direct callees at depth 1

- **GIVEN** symbol A calls B and C
- **WHEN** `getDownstream(store, A.id)` is called
- **THEN** `levels.get(1)` contains B and C

#### Scenario: Downstream with includeFiles

- **GIVEN** file X imports file Y and symbol A in X calls symbol B in Y
- **WHEN** `getDownstream(store, A.id, { includeFiles: true })` is called
- **THEN** both the `CALLS` relation to B and the `IMPORTS` relation to Y are reflected in the result

### Requirement: Impact analysis

#### Scenario: LOW risk — no dependents

- **GIVEN** a symbol with 0 callers
- **WHEN** `analyzeImpact(store, symbol.id, 'upstream')` is called
- **THEN** `riskLevel` is `LOW` and `directDependents` is 0

#### Scenario: MEDIUM risk — few direct dependents

- **GIVEN** a symbol with 4 direct callers and 0 indirect
- **WHEN** `analyzeImpact(store, symbol.id, 'upstream')` is called
- **THEN** `riskLevel` is `MEDIUM`

#### Scenario: HIGH risk — many direct dependents

- **GIVEN** a symbol with 8 direct callers
- **WHEN** `analyzeImpact(store, symbol.id, 'upstream')` is called
- **THEN** `riskLevel` is `HIGH`

#### Scenario: CRITICAL risk — widely used symbol

- **GIVEN** a symbol with 25 total dependents across all depths
- **WHEN** `analyzeImpact(store, symbol.id, 'upstream')` is called
- **THEN** `riskLevel` is `CRITICAL`

#### Scenario: affectedFiles deduplication

- **GIVEN** symbols A and B are both in `src/utils.ts` and both are callers of target
- **WHEN** `analyzeImpact` is called
- **THEN** `affectedFiles` contains `src/utils.ts` only once

### Requirement: File impact

#### Scenario: Aggregate risk is maximum across symbols

- **GIVEN** file `src/auth.ts` contains symbols X (LOW risk) and Y (HIGH risk)
- **WHEN** `analyzeFileImpact(store, 'src/auth.ts', 'upstream')` is called
- **THEN** `riskLevel` is `HIGH` (the maximum)

#### Scenario: Affected symbols deduplicated across file symbols

- **GIVEN** symbols X and Y in the file share a common upstream dependent Z
- **WHEN** `analyzeFileImpact` is called
- **THEN** Z appears once in the aggregate result, not twice

### Requirement: Change detection

#### Scenario: Single changed file impact

- **GIVEN** `src/utils.ts` was modified and contains symbol `hash` with 3 callers
- **WHEN** `detectChanges(store, ['src/utils.ts'])` is called
- **THEN** `changedSymbols` includes `hash` and `affectedSymbols` includes its 3 callers

#### Scenario: Multiple changed files aggregated

- **GIVEN** two files were modified, each with different sets of upstream dependents
- **WHEN** `detectChanges(store, [file1, file2])` is called
- **THEN** `affectedSymbols` is the union of both files' upstream dependents

#### Scenario: Summary is human-readable

- **WHEN** `detectChanges` completes
- **THEN** `summary` contains the number of changed files, affected symbols, and risk level in readable form

### Requirement: Pure functions

#### Scenario: Traversal does not mutate store

- **GIVEN** a store with known state
- **WHEN** `getUpstream`, `getDownstream`, or `analyzeImpact` is called
- **THEN** `getStatistics()` returns the same counts before and after the call
