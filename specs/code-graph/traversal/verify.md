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

#### Scenario: affectedSymbols include depth

- **GIVEN** a call chain: D calls C, C calls B, B calls target
- **WHEN** `analyzeImpact(store, target.id, 'upstream')` is called
- **THEN** `affectedSymbols` contains B with `depth: 1`, C with `depth: 2`, D with `depth: 3`

#### Scenario: custom maxDepth limits traversal

- **GIVEN** a call chain of depth 5
- **WHEN** `analyzeImpact(store, target.id, 'upstream', 5)` is called
- **THEN** symbols up to depth 5 are included in `affectedSymbols`
- **AND** `transitiveDependents` counts depths 3 through 5

#### Scenario: default maxDepth is 3

- **GIVEN** a call chain of depth 5
- **WHEN** `analyzeImpact(store, target.id, 'upstream')` is called without maxDepth
- **THEN** only symbols up to depth 3 are included

#### Scenario: maxDepth 1 returns only direct dependents

- **GIVEN** a symbol with direct and indirect callers
- **WHEN** `analyzeImpact(store, target.id, 'upstream', 1)` is called
- **THEN** only depth-1 symbols are returned
- **AND** `indirectDependents` and `transitiveDependents` are 0

#### Scenario: Base type change affects inheritors and implementors

- **GIVEN** a type symbol with persisted `EXTENDS` and `IMPLEMENTS` dependents
- **WHEN** `analyzeImpact(store, target.id, 'upstream')` is called
- **THEN** those hierarchy-dependent symbols are included in `affectedSymbols`
- **AND** their files contribute to `affectedFiles`

#### Scenario: Base method change affects overriding methods

- **GIVEN** a method symbol with persisted `OVERRIDES` dependents
- **WHEN** `analyzeImpact(store, target.id, 'upstream')` is called
- **THEN** overriding methods are included in `affectedSymbols`

### Requirement: File impact

#### Scenario: Aggregate risk is maximum across symbols

- **GIVEN** file `src/auth.ts` contains symbols X (LOW risk) and Y (HIGH risk)
- **WHEN** `analyzeFileImpact(store, 'src/auth.ts', 'upstream')` is called
- **THEN** `riskLevel` is `HIGH` (the maximum)

#### Scenario: Affected symbols deduplicated across file symbols

- **GIVEN** symbols X and Y in the file share a common upstream dependent Z
- **WHEN** `analyzeFileImpact` is called
- **THEN** Z appears once in the aggregate result with the shallowest depth

#### Scenario: maxDepth passed through to per-symbol analysis

- **GIVEN** file `src/auth.ts` with symbols that have deep call chains
- **WHEN** `analyzeFileImpact(store, 'src/auth.ts', 'upstream', 5)` is called
- **THEN** each per-symbol `analyzeImpact` call uses `maxDepth: 5`
- **AND** the file-level IMPORTS BFS also uses depth limit 5

#### Scenario: Hierarchy-derived impact is aggregated at file level

- **GIVEN** a file defines a base type or base method with hierarchy dependents
- **WHEN** `analyzeFileImpact(store, filePath, 'upstream')` is called
- **THEN** those hierarchy-derived affected symbols are included in the aggregate result

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
