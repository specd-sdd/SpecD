---
status: draft-rfc
date: 2026-09-22
type: architecture-proposal
context: dev/scripts/spec-completeness-poc
---

# Architecture Proposal: Universal Spec Completeness & Behavioral Ontology in CodeGraph

## Context and Problem Statement

Spec-Driven Development (SDD) requires bidirectional alignment between specifications (`spec.md`, `verify.md`, `spec-lock.json`) and source code across heterogeneous languages (TypeScript, PHP, Python, Rust, Go).

Historically, spec auditing and compliance checks relied on:

1. **Ad-hoc regex matching** on markdown files (fragile, format-dependent).
2. **Language-specific compiler ASTs** (e.g. `typescript.createSourceFile` for TypeScript constructor and interface inspection), which broke portability when evaluating external repositories such as PHP CakePHP projects (`iccms`) or Python services.
3. **Disconnected validation silos**: checking dependencies in one tool, constructor signatures in another, and verify scenarios in isolation.

We introduced an 11-dimensional behavioral completeness analyzer in `dev/scripts/spec-completeness-poc.ts`. While highly effective, it currently relies on a hybrid pipeline: Tree-sitter CodeGraph for basic symbols and relations, with TypeScript AST fallback for constructor parameters, thrown errors, interface shapes, and catch blocks.

The fundamental architectural question is: **How can we make spec completeness auditing 100% language-agnostic, deterministic, and instant (<10ms) by elevating behavioral facts into the CodeGraph SQLite ontology?**

---

## Decision Drivers

- **Language Agnosticism**: A single audit engine must audit TypeScript, PHP, Python, Rust, and Go codebases identically without language-specific compiler dependencies.
- **Ultra-Low Latency (<10ms)**: Completeness checks must run synchronously during CLI transitions (`change transition`, `spec verify`) and IDE real-time feedback without re-parsing source trees.
- **Graph-Native Traceability**: Requirements in `spec.md` and Scenarios in `verify.md` must be first-class nodes in the CodeGraph, directly linked via graph relations (`REQUIRES`, `VERIFIES`) to code symbols.
- **Separation of Extraction vs Querying**: Tree-sitter adapters extract language syntax into normalized facts; the audit engine operates purely on relational graph queries over SQLite.

---

## Decision Outcome

We adopt the **Universal CodeGraph Behavioral Ontology**. Tree-sitter polyglot adapters will be extended to extract behavioral facts (parameters, visibility, thrown errors, fields, scenarios) during indexing. Spec completeness auditing will transition from AST inspection to **native relational SQL queries against `.specd/config/graph/code-graph.sqlite`**.

---

## 1. The 15-Dimensional Completeness Suite

The target model formalizes 15 orthogonal dimensions of completeness:

| #      | Dimension                                 | CodeGraph Question                                                                  | Behavioral Failure Detected                                                                   |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **1**  | **Error Topology Coverage**               | Does every `THROWS` relation have a matching `VERIFIES` scenario?                   | Unhandled/undocumented domain exceptions.                                                     |
| **2**  | **Enum & Union Branch Matrix**            | Does every variant in an enum/union have a scenario test?                           | Untested business branches or missing state transitions.                                      |
| **3**  | **I/O Interface Field Coverage**          | Are all declared fields of input/result types documented?                           | Undocumented contract properties or hidden payload parameters.                                |
| **4**  | **Boolean Toggle Symmetry**               | Do boolean flags have both `true` and `false/absent` scenarios?                     | Asymmetric verification (happy-path only).                                                    |
| **5**  | **Call Graph Alignment**                  | Are all cross-spec `CALLS`/`CONSTRUCTS` covered by `dependsOn`?                     | Undeclared architectural dependencies.                                                        |
| **6**  | **State Mutation & Side Effects**         | Do functions with `WRITES_STATE` have persistence assertions?                       | Silently missing side-effect verification.                                                    |
| **7**  | **Fallback & Degradation**                | Do catch/fallback blocks have resilience scenarios?                                 | Untested disaster recovery and fallback paths.                                                |
| **8**  | **Reverse Drift & Zombie References**     | Do all linked symbols, specs, and files in spec-lock exist?                         | Zombie references to deleted or renamed code/specs.                                           |
| **9**  | **Public API Member Coverage**            | Does every `public` method under `CONTAINS` have a requirement contract in `rules`? | Orphan public methods with no formal requirement contract (ghost code or uncontracted drift). |
| **10** | **Graph Topology & Layering**             | Are there cycles ($A \to B \to A$) or layer inversions?                             | Architectural debt, circularity, hexagonal layer breaches.                                    |
| **11** | **Async & Transaction Contracts**         | Do `AbortSignal` and DB transactions have rollback tests?                           | Unhandled race cancellations and missing rollback tests.                                      |
| **12** | **Blast Radius vs Verification Density**  | Is inward consumer count balanced against verification scenarios?                   | High-risk fragile hotspots with thin test coverage.                                           |
| **13** | **Dead Code & Graph Reachability**        | Do all spec-lock files and spec nodes have incoming callers?                        | Orphaned dead code files or obsolete ghost specs.                                             |
| **14** | **Event Emission & Dispatcher Contracts** | Does every `DISPATCHES` call have payload/isolation tests?                          | Unverified event contracts and brittle unisolated side-effects.                               |
| **15** | **Performance Anti-patterns & Loop I/O**  | Are I/O calls inside iterative loops governed by caching/SLA?                       | N+1 database/disk bottlenecks without caching contracts.                                      |

---

## 2. CodeGraph SQLite Schema Extensions

To elevate CodeGraph into a complete behavioral database, `packages/code-graph/src/infrastructure/sqlite/schema.ts` will be extended with the following tables and columns:

```sql
-- 1. Symbol Parameters & Signatures (Replaces TypeScript AST constructor inspection)
CREATE TABLE IF NOT EXISTS symbol_parameters (
  symbol_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type_annotation TEXT,
  position INTEGER NOT NULL,
  is_optional INTEGER NOT NULL DEFAULT 0,
  has_default INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol_id, position),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- 2. Symbol Visibility & Modifiers
-- Added column to existing `symbols` table:
-- ALTER TABLE symbols ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'; -- 'public' | 'protected' | 'private' | 'internal'
-- ALTER TABLE symbols ADD COLUMN is_async INTEGER NOT NULL DEFAULT 0;

-- 3. Enum Variants & Struct/Interface Fields
CREATE TABLE IF NOT EXISTS symbol_fields (
  symbol_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_type TEXT,
  is_optional INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (symbol_id, field_name),
  FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
);

-- 4. Spec Subgraph: Requirements & Scenarios as First-Class Nodes
CREATE TABLE IF NOT EXISTS spec_requirements (
  id TEXT PRIMARY KEY,               -- e.g. 'core:change#requirement-1'
  spec_id TEXT NOT NULL,
  title TEXT NOT NULL,
  level INTEGER NOT NULL,
  FOREIGN KEY (spec_id) REFERENCES specs(spec_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS spec_scenarios (
  id TEXT PRIMARY KEY,               -- e.g. 'core:change#scenario-draft-to-active'
  spec_id TEXT NOT NULL,
  title TEXT NOT NULL,
  given_prose TEXT,
  when_prose TEXT,
  then_prose TEXT,
  FOREIGN KEY (spec_id) REFERENCES specs(spec_id) ON DELETE CASCADE
);

-- 5. Extended Relation Types in `relations`:
-- - 'THROWS':         (symbol_id -> error_symbol_id / error_name)
-- - 'WRITES_STATE':   (symbol_id -> resource_or_entity)
-- - 'VERIFIES':       (scenario_id -> symbol_id)
-- - 'REQUIRES':       (requirement_id -> symbol_id)
-- - 'DISPATCHES':     (symbol_id -> event_or_action_name) [Replaces proprietary hook concepts with universal Observer/Dispatcher pattern]
-- - 'PERFORMS_IO':    (symbol_id -> io_operation, e.g. 'fs:stat', 'db:query')
```

---

## 3. Polyglot Tree-sitter Ingestion Path

Tree-sitter already parses all supported languages with high-speed AST visitors. During the `IndexCodeGraph` phase:

1. **TypeScript Adapter (`tree-sitter-typescript`)**:
   - `constructor_signature` / `method_definition` $\to$ emits `symbol_parameters` rows.
   - `throw_statement` $\to$ emits `(symbol, error_name, 'THROWS')`.
   - `accessibility_modifier` $\to$ sets `symbols.visibility`.
   - `enum_declaration` / `interface_declaration` $\to$ emits `symbol_fields`.
2. **PHP Adapter (`tree-sitter-php`)**:
   - `method_declaration` / `constructor_promotion` $\to$ emits `symbol_parameters`.
   - `throw_expression` $\to$ emits `(symbol, error_name, 'THROWS')`.
   - `visibility_modifier` $\to$ sets `symbols.visibility`.
   - `enum_case` $\to$ emits `symbol_fields`.
3. **Python Adapter (`tree-sitter-python`)**:
   - `parameters` $\to$ emits `symbol_parameters`.
   - `raise_statement` $\to$ emits `(symbol, error_name, 'THROWS')`.
   - Identifier naming (`_name`) $\to$ sets `symbols.visibility = 'private'`.

Because indexing is performed once into SQLite, the audit engine never needs language parsers.

---

## 4. Native SQL Equivalents for Audit Dimensions

Once these facts are in CodeGraph, the entire 11-dimensional audit executes via pure SQL:

### Dimension 8: Reverse Drift & Zombie References

```sql
-- Detect zombie symbols linked in spec-lock that no longer exist
SELECT r.target AS zombie_symbol
FROM relations r
WHERE r.source = :specId
  AND r.type = 'COVERS_SYMBOL'
  AND r.target NOT IN (SELECT id FROM symbols);

-- Detect dangling spec dependencies
SELECT json_each.value AS dangling_spec
FROM specs s, json_each(s.depends_on_json)
WHERE s.spec_id = :specId
  AND json_each.value NOT LIKE 'default:_global/%'
  AND json_each.value NOT IN (SELECT spec_id FROM specs);
```

### Dimension 9: Public Member Coverage

```sql
-- 1. Uncontracted / Orphan public methods: missing from requirements (rules)
-- In SDD, a method MUST be defined in requirements to be valid. Having only scenarios without requirements is contract drift.
SELECT m.name AS uncontracted_method
FROM symbols m
WHERE m.parent_id IN (
  SELECT s.id FROM symbols s
  JOIN relations r ON r.target = s.id AND r.type = 'COVERS_SYMBOL'
  WHERE r.source = :specId AND s.kind = 'class'
)
AND m.kind = 'method'
AND m.visibility = 'public'
AND m.name NOT IN ('constructor', '__init__')
AND m.id NOT IN (
  SELECT target FROM relations WHERE source = :specId AND type = 'REQUIRES'
);

-- 2. Unverified requirements: in requirements but lacking verify scenarios
SELECT m.name AS unverified_method
FROM symbols m
WHERE m.id IN (
  SELECT target FROM relations WHERE source = :specId AND type = 'REQUIRES'
)
AND m.id NOT IN (
  SELECT target FROM relations WHERE source = :specId AND type = 'VERIFIES'
);
```

### Dimension 10: Graph Topology & Layering Rules

```sql
-- Recursive cycle detection in SQLite
WITH RECURSIVE dep_path(from_spec, to_spec, path, is_cycle) AS (
  SELECT
    s.spec_id,
    json_each.value,
    s.spec_id || ' -> ' || json_each.value,
    s.spec_id = json_each.value
  FROM specs s, json_each(s.depends_on_json)
  WHERE s.spec_id = :specId

  UNION ALL

  SELECT
    dp.from_spec,
    json_each.value,
    dp.path || ' -> ' || json_each.value,
    instr(dp.path, json_each.value) > 0
  FROM dep_path dp
  JOIN specs s ON s.spec_id = dp.to_spec
  CROSS JOIN json_each(s.depends_on_json)
  WHERE NOT dp.is_cycle AND dp.path NOT LIKE '%default:_global/%'
)
SELECT path FROM dep_path WHERE is_cycle = 1 LIMIT 1;
```

### Dimension 1: Error Topology Coverage

```sql
-- Thrown exceptions without corresponding verify.md assertions
SELECT r.target AS unhandled_error
FROM relations r
JOIN symbols s ON s.id = r.source
JOIN relations cov ON cov.target = s.id AND cov.type = 'COVERS_SYMBOL'
WHERE cov.source = :specId
  AND r.type = 'THROWS'
  AND r.target NOT IN (
    SELECT target FROM relations WHERE source = :specId AND type = 'VERIFIES'
  );
```

### Dimension 12: Blast Radius vs Verification Density

```sql
-- 1. Count inward consumers (downstream specs + external calling symbols)
WITH downstream_consumers AS (
  SELECT source AS consumer_id FROM relations WHERE type = 'DEPENDS_ON' AND target = :specId
  UNION
  SELECT r.source AS consumer_id FROM relations r
  JOIN relations cov ON cov.target = r.target AND cov.type IN ('COVERS_SYMBOL', 'COVERS_FILE')
  WHERE cov.source = :specId
    AND r.type IN ('CALLS', 'CONSTRUCTS', 'IMPORTS', 'USES_TYPE')
    AND r.source NOT LIKE '%test%'
)
SELECT
  (SELECT COUNT(*) FROM downstream_consumers) AS inward_consumers_count,
  (SELECT COUNT(*) FROM spec_scenarios WHERE spec_id = :specId) AS scenario_count;
```

### Dimension 13: Dead Code & Graph Reachability

```sql
-- Detect spec-lock implementation files with 0 incoming relations (orphaned dead code)
SELECT cov.target AS orphaned_file
FROM relations cov
WHERE cov.source = :specId AND cov.type = 'COVERS_FILE'
  AND cov.target NOT LIKE '%test%'
  AND cov.target NOT LIKE '%/index.ts'
  AND cov.target NOT IN (
    SELECT DISTINCT target FROM relations
    WHERE type IN ('CALLS', 'CONSTRUCTS', 'IMPORTS', 'USES_TYPE')
      AND source != cov.target
  );

-- Detect island/ghost specs (0 inward spec dependencies and 0 external callers)
SELECT s.spec_id AS ghost_spec
FROM specs s
WHERE s.spec_id = :specId
  AND s.spec_id NOT IN (SELECT target FROM relations WHERE type = 'DEPENDS_ON')
  AND s.spec_id NOT IN (
    SELECT cov.source FROM relations cov
    JOIN relations r ON r.target = cov.target
    WHERE cov.type IN ('COVERS_SYMBOL', 'COVERS_FILE')
      AND r.type IN ('CALLS', 'CONSTRUCTS', 'IMPORTS')
      AND r.source NOT LIKE '%test%'
  );
```

### Dimension 14: Event Emission & Dispatcher Lifecycle Contracts

```sql
-- Dispatched events / actions without verifying scenarios
SELECT r.target AS unverified_event
FROM relations r
JOIN relations cov ON cov.target = r.source AND cov.type = 'COVERS_SYMBOL'
WHERE cov.source = :specId
  AND r.type = 'DISPATCHES'
  AND r.target NOT IN (
    SELECT target FROM relations WHERE source = :specId AND type = 'VERIFIES'
  );
```

### Dimension 15: Performance Anti-patterns & Loop I/O

```sql
-- I/O operations executed inside iterative loops without caching/batching contracts
SELECT s.name AS method_name, r.target AS io_call
FROM relations r
JOIN symbols s ON s.id = r.source
JOIN relations cov ON cov.target = s.id AND cov.type = 'COVERS_SYMBOL'
WHERE cov.source = :specId
  AND r.type = 'PERFORMS_IO'
  AND r.context = 'loop'
  AND :specId NOT IN (
    SELECT spec_id FROM spec_requirements
    WHERE title LIKE '%cache%' OR title LIKE '%batch%' OR title LIKE '%sla%'
  );
```

---

## 6. Format-Agnostic Metadata & Two-Sided Verification Matrix

### 6.1 Format-Agnostic Metadata Ingestion

As a core architectural rule, the completeness auditor **never directly reads spec artifact files** (`spec.md`, `verify.md`, JSON, YAML, or TOON artifacts). Instead, it consumes the normalized, format-agnostic metadata extracted by the kernel use case:

```typescript
const metaRes = await host.kernel.specs.getMetadata.execute({ specId })
const { rules, scenarios, dependsOn } = metaRes.metadata
```

- **Rules (`metadata.rules`)**: Array of `{ requirement: string, rules: string[] }` representing formal requirements contracts.
- **Scenarios (`metadata.scenarios`)**: Array of `{ requirement: string, name: string, given?: string[], when?: string[], then?: string[] }` representing verification behavior.
- **Dependencies (`metadata.dependsOn`)**: Formally declared spec dependency references.

This architecture completely decouples the audit engine from underlying document representation or serialization formats (Markdown AST, JSON Schema, TOON, YAML).

### 6.2 The Two-Sided Contract Verification Matrix (2x2)

Every inspected element (class symbol, public method, thrown error, I/O interface field, boolean toggle, event emission, transaction rollback, performance mitigation) is evaluated against both sides of the contract:

| Badge                | Requirements (`rules`) | Verification (`scenarios`) | Architectural Diagnosis & Validity Rule                                                                                                                |
| -------------------- | :--------------------: | :------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[Req: ✔ \| Ver: ✔]` |        **Yes**         |          **Yes**           | **Fully Fortified Contract**: Formally defined requirement backed by active verification scenarios. **(Valid Check: PASS)**                            |
| `[Req: ✔ \| Ver: ✖]` |        **Yes**         |           **No**           | **Unverified Requirement**: Formal requirement exists, but verification test scenarios are missing (specification debt). **(Valid Check: CONTRACTED)** |
| `[Req: ✖ \| Ver: ✔]` |         **No**         |          **Yes**           | **Uncontracted Verification Drift**: Scenario tests the behavior in code, but lacks formal requirement definition. **(Invalid Check: FAIL/DRIFT)**     |
| `[Req: ✖ \| Ver: ✖]` |         **No**         |           **No**           | **Ghost Code**: Code artifact exists in implementation but is completely untracked by the spec ecosystem. **(Invalid Check: FAIL/GHOST)**              |

> **Mandatory Rule for Methods & Functions**:
> In Spec-Driven Development, specs are the source of truth; code follows specs. A method or function existing in implementation and being tested in verification is **NOT** a valid check unless it is explicitly specified in the requirements (`rules`). Verification without requirement represents _contract drift_ (`[Req: ✖ | Ver: ✔]`) and MUST NOT be counted as covered. Only elements with `[Req: ✔]` are valid contracts.

### 6.3 Change Merged Metadata Extraction & Schema-Driven Fallback

When auditing active changes (`specd change audit <changeName>` or `--change <changeName>`):

1. **Primary Path (Merged Preview Metadata)**:
   The audit engine materializes merged preview artifacts using `host.kernel.changes.preview.execute({ name: changeName, specId })` and runs `extractMetadata(extraction, astsByArtifact, renderers, transforms, transformContexts)` against the effective schema (`schema.metadataExtraction()`). This produces the **merged metadata** (`metadata.rules`, `metadata.scenarios`, `metadata.dependsOn`) representing the speculative post-merge state of the change.
2. **Schema-Driven Fallback (Zero Hardcoded Filenames)**:
   If metadata extraction fails or encounters an unparseable syntax error, the engine transitions to a schema-directed fallback. It queries `schema.artifacts().filter(a => a.scope === 'spec')` to locate the declared requirement and verification artifacts dynamically (by artifact ID and output definition, never hardcoding `spec.md`, `verify.md`, or format-specific paths).

### 6.4 Universal Language Dispatch Conventions & `specd.yaml` Configuration

Hooks and event listeners are not programming language syntax primitives; they represent instances of the **Observer / Dispatcher pattern**. Rather than hardcoding framework-specific function names into the core analyzer, specd employs a two-tier strategy:

#### 1. Standard Polyglot Conventions

Built-in AST adapters recognize standard language libraries and idiomatic framework dispatcher conventions:

- **TypeScript / Node.js**: `EventEmitter` (`.emit()`), DOM `EventTarget` (`.dispatchEvent()`), Redux / NgRx (`.dispatch()`).
- **PHP**: PSR-14 `EventDispatcherInterface` (`->dispatch()`), Symfony, CakePHP (`->dispatchEvent()`), Laravel (`event(...)`), WordPress hooks (`do_action(...)`, `apply_filters(...)`).
- **Python**: Django Signals / Blinker (`.send()`, `.send_robust()`), Celery (`.delay()`, `.apply_async()`), asyncio events (`.notify()`, `.dispatch()`).
- **Go**: Channel brokers (`.Publish()`, `.Dispatch()`, `.Emit()`).
- **Ruby**: ActiveSupport::Notifications (`instrument(...)`), Wisper (`broadcast(...)`, `publish(...)`).
- **Workflow & Hook Runners**: Call expressions matching `run*Hook*` patterns (such as `_runStepHooks.execute(...)`, `runExternalHook(...)`, `hookRunner.run(...)`) are recognized by convention as dispatchers, capturing the target hook/step identifier into `DISPATCHES`.

#### 2. Declarative Extensibility via `specd.yaml`

Projects can configure custom dispatcher methods, regex/glob patterns, runners, or framework helper functions directly in `specd.yaml` under the project `graph:` section:

```yaml
# specd.yaml
graph:
  includePaths:
    - 'docs/**'
  conventions:
    dispatchers:
      methods:
        - 'emit'
        - 'dispatch'
        - 'dispatchEvent'
        - 'publish'
        - 'trigger'
        - 'run*Hook*' # Glob/regex pattern for hook runners (e.g. runStepHooks)
      functions:
        - 'event'
        - 'do_action'
        - 'apply_filters'
```

#### 3. Core & CodeGraph Schema Integration

To support this configuration declaratively:

1. **In `@specd/core` (`packages/core/src/application/ports/config-schema.ts`)**:
   Extend `ProjectGraphZodSchema` to validate the `conventions` block:

   ```typescript
   export const GraphConventionsZodSchema = z
     .object({
       dispatchers: z
         .object({
           methods: z.array(z.string()).optional(),
           functions: z.array(z.string()).optional(),
         })
         .optional(),
     })
     .strict()

   export const ProjectGraphZodSchema = z
     .object({
       includePaths: z.array(z.string()).optional(),
       excludePaths: z.array(z.string()).optional(),
       conventions: GraphConventionsZodSchema.optional(),
     })
     .strict()
   ```

2. **In `@specd/code-graph` (`packages/code-graph/src/domain/value-objects/index-options.ts`)**:
   Add `conventions` to `ProjectGraphConfig`:

   ```typescript
   export interface GraphDispatchConventions {
     readonly methods?: readonly string[]
     readonly functions?: readonly string[]
   }

   export interface ProjectGraphConfig {
     readonly includePaths?: readonly string[]
     readonly excludePaths?: readonly string[]
     readonly conventions?: {
       readonly dispatchers?: GraphDispatchConventions
     }
     readonly workspaces?: ReadonlyMap<string, WorkspaceGraphConfig>
   }
   ```

Tree-sitter adapters and graph indexers read `config.conventions.dispatchers`, merging project overrides with built-in ecosystem conventions to emit `DISPATCHES` relations cleanly into SQLite.

---

## 7. Migration Roadmap

1. **Phase 1 (Completed)**:
   - Unified 15-dimensional audit engine implemented in `dev/scripts/spec-completeness-poc.ts` across Part A (Constructors/Ownership), Part B (Architectural Suite), and Part C (Graph Ecosystem Intelligence).
   - Multi-tier symbol ownership resolution (Symbol-first $\to$ File fallback $\to$ Shared utility co-ownership).
   - Format-agnostic metadata ingestion via `host.kernel.specs.getMetadata` (no artifact file reads).
   - Two-sided 2x2 Contract Verification Matrix (`[Req: ✔ | Ver: ✔]` badges) across all 15 dimensions.
   - CodeGraph SQLite integration for symbols, relations, parent-child hierarchies, cross-spec call graphs, blast radius, reachability, universal `DISPATCHES` contracts, and N+1 loop I/O.
   - Change mode merged preview metadata extraction with schema-driven fallback.

2. **Phase 2 (CodeGraph Schema & Adapter Evolution)**:
   - Add `symbol_parameters` table and `symbols.visibility` to SQLite schema (`schema.ts`).
   - Update Tree-sitter TS, PHP, and Python language adapters to emit parameter facts, `THROWS`, `DISPATCHES`, and `PERFORMS_IO` relations during indexing.
   - Add `CREATE INDEX IF NOT EXISTS idx_symbols_parent_id ON symbols(parent_id)`.

3. **Phase 3 (Spec Subgraph Ingestion)**:
   - Extend Markdown parser in `@specd/code-graph` to ingest `spec_requirements` and `spec_scenarios` tables.
   - Replace heuristic prose matching with explicit `VERIFIES` relation queries.

4. **Phase 4 (CLI & SDK First-Class Command)**:
   - Expose `specd spec audit <specId>` and `specd change audit <changeName>` as core CLI commands backed by the CodeGraph domain services.
   - Wire audit into transition gates (`specd change transition --gate completeness`).
