# Proposal: suggest-implementation-and-spec-deps

## Motivation

Spec authors currently have to manually discover and correlate implementation files, symbols, and inter-spec `dependsOn` relationships when initializing or updating `spec-lock.json`. This manual process is error-prone, incomplete, and creates friction during codebase onboarding.

We need automated, static-analysis-driven suggestion use cases in `@specd/sdk` and corresponding CLI subcommands in `@specd/cli` to deduce implementation links and spec dependencies with 100% determinism, zero LLM token cost, and sub-second performance.

## Current behaviour

- Implementation links (`file` and `symbols`) can only be queried (`spec implementation list`) or manually added line-by-line (`spec implementation add`).
- Spec dependencies (`dependsOn`) must be manually entered or discovered through ad-hoc inspection (`spec deps add`).
- There is no automated capability to analyze code imports, symbol definitions, and AST code blocks to suggest or apply missing spec-lock relationships in bulk.

## Proposed solution

We will add two orchestration Use Cases in `@specd/sdk` following the `@specd/core` application pattern (`<UseCaseName>Input`, `<UseCaseName>Result`, `async execute(input): Promise<Result>`) and composition factory overloads (`create*` triples), exposing them via new CLI `suggest` subcommands:

1. **`SuggestImplementationLinks` (`@specd/sdk`)**:
   - Class `SuggestImplementationLinks` receives explicit `deps: SuggestImplementationLinksDeps` (pure DI, zero resolver dependency in class).
   - Composition helper `resolveSuggestImplementationLinksDeps(resolver: CompositionResolver)` resolves dependencies from `CompositionResolver`.
   - Accesses persisted workspace specifications strictly through `SpecRepository.list({ includeMeta: true })` and `GetPersistedSpecImplementation` ports, adhering to Hexagonal Architecture (never raw filesystem I/O).
   - Deduces suggested implementation files and symbols for target specs using AST code block parsing from `spec.md` artifacts, naming convention derivatives, and BM25 symbol search in `code-graph`.
   - Supports targeting **all specs in the project**, **all specs in a specific workspace** (`workspace?: string`), or **one/many specific specs** (`specIds?: string[]`).
   - Supports an additive `apply: true` mode that merges new files/symbols into `spec-lock.json` via `UpdatePersistedSpecImplementation` without deleting existing confirmed links.
   - Supports forcing cache invalidation and rebuild (`rebuildCache?: boolean`).

2. **`SuggestSpecDependencies` (`@specd/sdk`)**:
   - Class `SuggestSpecDependencies` receives explicit `deps: SuggestSpecDependenciesDeps` (pure DI, zero resolver dependency in class).
   - Composition helper `resolveSuggestSpecDependenciesDeps(resolver: CompositionResolver)` resolves dependencies from `CompositionResolver`.
   - Accesses persisted workspace specifications strictly through `SpecRepository.list({ includeMeta: true })` and `GetPersistedSpecDeps` ports.
   - **Full Cache Warm-up via Dry-Run Composition**: Executes `SuggestImplementationLinks.execute({ all: true, apply: false })` at the start of Pass 1 to build/warm the complete global implementation cache across all specs in the monorepo without mutating `spec-lock.json`.
   - Deduces `dependsOn` spec-to-spec relationships using the populated global file-to-spec map and upstream code impact analysis (`analyzeFileImpact` at `maxDepth = 2` for barrel re-exports).
   - Prioritizes confirmed `spec-lock.json` implementation files over heuristic suggestions when mapping imports.
   - Supports targeting **all specs**, **workspace-scoped specs**, or **specific specs**.
   - Supports an additive `apply: true` mode that unions new dependency IDs into `spec-lock.json` via `UpdatePersistedSpecDeps`.
   - **Post-Apply Schema Validation**: Executes `ValidateSpecs` (`kernel.specs.validate`) after mutating `dependsOn` locks. It reports exact schema validation `failures` (`artifactId` and `description`) without hardcoding file names or assuming specific schema layouts.
   - **Conditional Automated Alignment Change & `.specd-exploration.md` Creation (SDK & CLI)**:
     - When invalid specs are detected by `ValidateSpecs` after applying dependencies, the SDK supports `createAlignmentChange?: boolean`.
     - **Format Constraint & Interactive Discipline**: Interactive TTY prompts `[y/N]` to create an alignment change are **STRICTLY RESTRICTED to `--format text`**. Machine-readable formats (`json` and `toon`) are **strictly non-interactive** and will NEVER prompt or block stdin.
     - In `--format text`, if interactive TTY is detected, it prompts `[y/N]`. Passing `--create-change` automatically approves creation in any format.
     - When created, the SDK orchestrates the creation of a single alignment change gathering ALL failing specs, and populates its `.specd-exploration.md` context file using a standardized template capturing the exact `artifactId` and `description` validation failures reported by `ValidateSpecs`.

3. **CLI Subcommands (`@specd/cli`)**:
   - `specd spec implementation suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--confidence <HIGH|MED>] [--rebuild-cache] [--format text|json|toon]`
   - `specd spec deps suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--create-change] [--rebuild-cache] [--format text|json|toon]`

4. **Unified System Cache (`.specd/cache/`)**:
   - Persists BOTH confirmed `spec-lock.json` data (`files`, `symbols`, `dependsOn`) AND inferred suggestions in `.specd/cache/implementation-suggestions.json` with domain-specific cache metadata interfaces (`ImplementationSuggestionCacheHeader`, `ImplementationSuggestionSpecStamp`, `ImplementationSuggestionSpecEntry`).
   - Implements a 2-stage staleness check (`lastModified` fast-path -> `hash` deep-check) using `SpecRepository.list({ includeMeta: true })` and `SpecRepository.getSpecMeta(..., { includeHash: true })`.

## Specs affected

### New specs

- `sdk:suggest-implementation-links`: Defines the SDK orchestration use case for inferring spec implementation files and symbols from code AST, naming derivatives, and symbol search.
  - Depends on: `code-graph:symbol-model`, `code-graph:traversal`, `core:get-persisted-spec-implementation`, `core:update-persisted-spec-implementation`

- `sdk:suggest-spec-dependencies`: Defines the SDK orchestration use case for inferring spec-to-spec `dependsOn` relationships from production code import graphs.
  - Depends on: `sdk:suggest-implementation-links`, `code-graph:traversal`, `core:get-persisted-spec-deps`, `core:update-persisted-spec-deps`

### Modified specs

- `cli:spec-implementation`: Adds the `suggest` subcommand to inspect and optionally apply (`--apply`) suggested implementation links across all specs or specific specs.
  - Depends on (added): `sdk:suggest-implementation-links`
  - Depends on (removed): none

- `cli:spec-deps`: Adds the `suggest` subcommand to inspect and optionally apply (`--apply`) suggested spec dependencies across all specs or specific specs with post-apply validation diagnostics and `--create-change` alignment flag.
  - Depends on (added): `sdk:suggest-spec-dependencies`
  - Depends on (removed): none

## Impact

- **Packages**: `@specd/sdk` (orchestration use cases), `@specd/cli` (CLI subcommands).
- **Core Independence**: `@specd/core` remains strictly independent of `@specd/code-graph`. The new use cases reside exclusively in `@specd/sdk`.
- **System Storage**: Cache files are written to `.specd/cache/implementation-suggestions.json` (ignored in `.gitignore`).

## Technical context

### 1. Standard Core Use Case Signatures & Composition Layer Boundaries

The architecture maintains strict decoupling between the pure Use Case classes and the Composition Resolver:

- **Pure Use Case Classes (Zero Resolver Dependency):**
  The constructor receives explicit typed dependencies (`deps: SuggestImplementationLinksDeps`), ensuring pure DI and easy unit testing.
- **Composition Resolution Helpers (`CompositionResolver` integration):**
  The helper `resolveSuggestImplementationLinksDeps(resolver: CompositionResolver)` resolves ports and repositories from `CompositionResolver`.

```typescript
export interface SuggestImplementationLinksInput {
  readonly specId?: string
  readonly specIds?: readonly string[]
  readonly workspace?: string
  readonly all?: boolean
  readonly apply?: boolean
  readonly rebuildCache?: boolean
  readonly confidenceThreshold?: 'HIGH' | 'MEDIUM' | 'LOW'
}

export class SuggestImplementationLinks {
  constructor(private readonly deps: SuggestImplementationLinksDeps) {}
  async execute(input: SuggestImplementationLinksInput): Promise<SuggestImplementationLinksResult>
}

// Composition Factory & Resolver Integration
export function resolveSuggestImplementationLinksDeps(resolver: CompositionResolver): SuggestImplementationLinksDeps

export function createSuggestImplementationLinks(deps: SuggestImplementationLinksDeps): SuggestImplementationLinks
export function createSuggestImplementationLinks(config: SpecdConfig, options?: CompositionResolutionOptions): SuggestImplementationLinks
export function createSuggestImplementationLinks(
  depsOrConfig: SuggestImplementationLinksDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestImplementationLinks


export interface SuggestSpecDependenciesInput {
  readonly specId?: string
  readonly specIds?: readonly string[]
  readonly workspace?: string
  readonly all?: boolean
  readonly apply?: boolean
  readonly rebuildCache?: boolean
  readonly createAlignmentChange?: boolean
  readonly changeNamePrefix?: string
}

export class SuggestSpecDependencies {
  constructor(private readonly deps: SuggestSpecDependenciesDeps) {}
  async execute(input: SuggestSpecDependenciesInput): Promise<SuggestSpecDependenciesResult>
}

// Composition Factory & Resolver Integration
export function resolveSuggestSpecDependenciesDeps(resolver: CompositionResolver): SuggestSpecDependenciesDeps

export function createSuggestSpecDependencies(deps: SuggestSpecDependenciesDeps): SuggestSpecDependencies
export function createSuggestSpecDependencies(config: SpecdConfig, options?: CompositionResolutionOptions): SuggestSpecDependencies
export function createSuggestSpecDependencies(
  depsOrConfig: SuggestSpecDependenciesDeps | SpecdConfig,
  options?: CompositionResolutionOptions,
): SuggestSpecDependencies
```

---

### 2. Detailed Execution Flow & Analysis Algorithm

#### A. `SuggestImplementationLinks` Algorithm:
1. **Pass 1: AST Code Block & Naming Derivative Extraction via `SpecRepository`**:
   - Calls `SpecRepository.list({ includeMeta: true })` to load all target spec entries with their physical artifact stamps (`artifacts[].lastModified`) and sidecar stamps (`persistedStateMeta`).
   - Evaluates 2-stage cache staleness for each spec (`lastModified` -> `hash` fallback).
   - Reads spec artifacts (`spec.md`) loaded by the repository port for specs requiring calculation.
   - Parses code blocks to extract explicit symbol identifiers (e.g. `SuggestImplementationLinks`, `ValidateSpecs`).
   - Derives file path naming patterns from spec capability names (e.g. `cli:spec-deps` -> `packages/cli/src/commands/spec/deps.ts`).
2. **Pass 2: Code Graph Correlator & Confidence Scoring**:
   - Queries `code-graph` (BM25 symbol search and AST file matching).
   - Scores candidates (`HIGH` score > 150 for exact AST symbol match; `MEDIUM` score 80-149 for path derivatives; `LOW` for distant matches).
3. **Pass 3: Cache Update & Mutation (`--apply`)**:
   - Writes/updates `.specd/cache/implementation-suggestions.json`.
   - If `--apply` is passed, invokes `UpdatePersistedSpecImplementation` to perform set union merging discovered `files` and `symbols` into `spec-lock.json`.

#### B. `SuggestSpecDependencies` Algorithm:
1. **Pass 1: Cache Warm-up & Multi-Workspace Global File Map (`file -> specId`)**:
   - Executes `SuggestImplementationLinks.execute({ all: true, apply: false })` (dry-run mode) to ensure the global implementation cache (`.specd/cache/implementation-suggestions.json`) is 100% complete and warm for all specs in the monorepo.
   - Reads confirmed `spec-lock.json` files + high-confidence suggested files from the cache across all 267+ specs.
   - Builds a complete in-memory inverse index mapping every relative production source file to its owning `specId`.
2. **Pass 2: AST Import Analysis & Impact Traversal (`maxDepth = 2`)**:
   - For each target spec, takes its implementation files (confirmed or suggested).
   - Evaluates all `import` statements in those source files.
   - Runs `analyzeFileImpact` (`maxDepth = 2`) to trace imports through barrel re-export files (e.g., `@specd/sdk` barrel exports resolving to `packages/core/src/application/use-cases/...`).
   - Looks up imported target files in the global inverse map `file -> specId`.
   - Deduces inter-spec dependency: if Spec A's code imports a file owned by Spec B, then `Spec A dependsOn Spec B`.
3. **Pass 3: Mutation & Post-Apply Schema Validation**:
   - If `--apply` is passed, invokes `UpdatePersistedSpecDeps` to union new dependency spec IDs into `spec-lock.json`.
   - Runs `ValidateSpecs` (`kernel.specs.validate`).
   - If validation failures exist (`status: "invalid-specs-detected"`):
     - Extracts `failures` (`artifactId` and `description`).
     - **Conditional Creation**: If `--create-change` (or `createAlignmentChange: true` or TTY response "y") is enabled, creates a single alignment change for the failing specs and writes `.specd-exploration.md`.
   - If all specs are valid (`status: "all-valid"`):
     - No change is created, regardless of whether `--create-change` was supplied.

---

### 3. 2-Stage Cache Staleness Evaluation Strategy (`lastModified` -> `hash`)

The Use Cases determine staleness using a 2-stage evaluation via `SpecRepository` ports without redundant I/O:

```
[SpecRepository.list({ includeMeta: true })]
                     │
                     ▼
       ┌───────────────────────────┐
       │ Compare lastModified Stamp│
       └─────────────┬─────────────┘
                     │
         Equal? ─────┼───── Changed?
           │               │
           ▼               ▼
      [Cache HIT]  ┌───────────────────────────────┐
      (Instant)    │ Compare Content Hash (via Port)│
                   └───────────────┬───────────────┘
                                   │
                       Equal? ─────┼───── Changed?
                         │               │
                         ▼               ▼
                 [Update timestamp] [Cache MISS]
                 [Preserve Cache ] (Recalculate)
```

1. **Stage 1: Fast-Path `lastModified` Check**:
   - The Use Case calls `SpecRepository.list({ includeMeta: true })` to retrieve `artifacts` (`lastModified`) and `persistedStateMeta` (`lastModified`).
   - It compares `lastModified` against `cachedSpec.specStamp.lastModified`.
   - **If `lastModified` matches:** ⚡ **Fast Cache HIT** (0 hash calculations, sub-millisecond execution).

2. **Stage 2: Deep `hash` Check (Fallback when `lastModified` changes)**:
   - If `lastModified` has changed (e.g. `touch` command, git checkout, or mtime shift), the Use Case retrieves artifact content hashes via `SpecRepository.getSpecMeta(specPath, { includeHash: true })` or `persistedStateMeta.hash`.
   - It compares `newHash` against `cachedSpec.specStamp.hash`:
     - **If Hash Matches:** The content has NOT changed. The Use Case **updates `lastModified` in `.specd/cache/implementation-suggestions.json`** to match the new timestamp and preserves the Cache HIT.
     - **If Hash Differs:** Content has changed. ❌ **Cache MISS**: The Use Case recalculates Pass 1 & Pass 2 analysis for that spec and updates the cache with new suggestions and hashes.

3. **Global Code-Graph Staleness (via `code-graph` Port)**:
   - The Use Case queries `GetGraphHealth` or `IndexProjectGraph` port to retrieve `lastIndexedAt` and `graphFingerprint`.
   - If `lastIndexedAt` or `graphFingerprint` in `.specd/cache/implementation-suggestions.json` differs from the port, all cached suggestions are invalidated globally.

4. **Explicit User Override (`rebuildCache: true` / `--rebuild-cache`)**:
   - Passing `--rebuild-cache` (or `--force-rebuild`) bypasses cache comparisons, re-executes Pass 1 & Pass 2, and updates `.specd/cache/implementation-suggestions.json`.

```typescript
export interface ImplementationSuggestionCacheHeader {
  readonly updatedAt: string
  readonly projectDir: string
  readonly cacheVersion: string
  readonly graphLastIndexedAt: string
  readonly graphFingerprint: string
}

export interface ImplementationSuggestionSpecStamp {
  readonly lastModified: string
  readonly hash: string
  readonly artifacts: readonly {
    readonly filename: string
    readonly lastModified: string
    readonly hash?: string
  }[]
  readonly persistedStateHash?: string
  readonly persistedStateLastModified?: string
}

export interface ImplementationSuggestionSpecEntry {
  readonly specId: string
  readonly title: string
  readonly specStamp: ImplementationSuggestionSpecStamp
  readonly existing: ExistingSpecLockData
  readonly suggestions: readonly ImplementationSuggestionEntry[]
}
```

---

### 4. Output Format Constraints & Interactivity Rules

| Format | Interactive Prompt (`[y/N]`) | Auto-Creation via `--create-change` | Output Behavior |
| :--- | :---: | :---: | :--- |
| **`text`** | ✅ Supported (if TTY & invalid specs exist) | ✅ Supported (only if invalid specs exist) | Renders human-readable clean text. Prompts in TTY if invalid specs exist. |
| **`json`** | ❌ **DISABLED** (Never prompts) | ✅ Supported (only if invalid specs exist) | Returns pure JSON object schema. No interactive input read. |
| **`toon`** | ❌ **DISABLED** (Never prompts) | ✅ Supported (only if invalid specs exist) | Returns high-density TOON format. No interactive input read. |

- In `json` and `toon` formats, if post-apply validation detects invalid specs and `createAlignmentChange` was `false` (no `--create-change` flag), the result payload includes `postApplyValidation` with `invalidSpecs` and `suggestedAlignmentCommand`, but **does NOT pause or read stdin**.
- If `createAlignmentChange` was `true` (or `--create-change` flag passed) AND invalid specs exist, the change is created silently and details are returned in `createdChange` within the JSON payload.
- If all specs are valid (`status: "all-valid"`), no change is created under any circumstances.

---

### 5. DTO Definitions, TOON & JSON Output Schemas (`@specd/sdk` / `@specd/cli`)

```typescript
export interface ExistingSpecLockData {
  readonly files: readonly string[]
  readonly symbols: readonly string[]
  readonly dependsOn: readonly string[]
}

export interface ImplementationSuggestionEntry {
  readonly file: string
  readonly symbols: readonly string[]
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  readonly reasons: readonly string[]
  readonly score: number
}

export interface SpecImplementationSuggestion {
  readonly specId: string
  readonly title: string
  readonly existing: ExistingSpecLockData
  readonly suggestions: readonly ImplementationSuggestionEntry[]
}

export interface SuggestImplementationLinksResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string
  readonly specs: readonly SpecImplementationSuggestion[]
  readonly appliedMutations?: {
    readonly updatedSpecsCount: number
    readonly filesAddedCount: number
    readonly symbolsAddedCount: number
  }
}

export interface SuggestedSpecDependency {
  readonly specId: string
  readonly title: string
  readonly reason: string
}

export interface SpecDependencySuggestion {
  readonly specId: string
  readonly title: string
  readonly existingDependsOn: readonly string[]
  readonly suggestedDependsOn: readonly SuggestedSpecDependency[]
}

export interface CreatedAlignmentChangeInfo {
  readonly name: string
  readonly changePath: string
  readonly explorationFilePath: string
  readonly specIds: readonly string[]
}

export interface PostApplyValidationDiagnostic {
  readonly status: 'all-valid' | 'invalid-specs-detected'
  readonly invalidSpecs: readonly {
    readonly specId: string
    readonly failures: readonly {
      readonly artifactId: string
      readonly description: string
    }[]
  }[]
  readonly suggestedAlignmentCommand?: string
  readonly createdChange?: CreatedAlignmentChangeInfo
}

export interface SuggestSpecDependenciesResult {
  readonly result: 'ok'
  readonly targetWorkspace?: string
  readonly specs: readonly SpecDependencySuggestion[]
  readonly appliedMutations?: {
    readonly updatedSpecsCount: number
    readonly depsAddedCount: number
  }
  readonly postApplyValidation?: PostApplyValidationDiagnostic
}
```

#### JSON Output Example (`specd spec deps suggest --apply --format json`):

```json
{
  "result": "ok",
  "targetWorkspace": "cli",
  "specs": [
    {
      "specId": "cli:change-implementation",
      "title": "Change Implementation",
      "existingDependsOn": [
        "core:change",
        "code-graph:symbol-model"
      ],
      "suggestedDependsOn": [
        {
          "specId": "core:update-implementation-tracking",
          "title": "update-implementation-tracking Specification",
          "reason": "Production file 'src/commands/change/implementation.ts' imports 'packages/core/src/application/use-cases/update-implementation-tracking.ts'"
        }
      ]
    }
  ],
  "appliedMutations": {
    "updatedSpecsCount": 1,
    "depsAddedCount": 1
  },
  "postApplyValidation": {
    "status": "invalid-specs-detected",
    "invalidSpecs": [
      {
        "specId": "cli:change-implementation",
        "failures": [
          {
            "artifactId": "spec",
            "description": "dependOn \"core:update-implementation-tracking\" is not referenced in spec requirements"
          }
        ]
      }
    ],
    "suggestedAlignmentCommand": "specd changes create align-spec-deps-20260816-154400 --spec cli:change-implementation --description \"Align spec requirements with newly added dependsOn lock dependencies\""
  }
}
```

#### TOON Output Example (`specd spec deps suggest --apply --format toon`):

```toon
result: ok
targetWorkspace: cli
specs[1]{specId,title}:
  "cli:change-implementation",Change Implementation
  existingDependsOn[2]:
    "core:change"
    "code-graph:symbol-model"
  suggestedDependsOn[1]{specId,title,reason}:
    "core:update-implementation-tracking",update-implementation-tracking Specification,"Production file imports update-implementation-tracking.ts"
appliedMutations:
  updatedSpecsCount: 1
  depsAddedCount: 1
postApplyValidation:
  status: invalid-specs-detected
  invalidSpecs[1]{specId}:
    "cli:change-implementation"
    failures[1]{artifactId,description}:
      spec,"dependOn \"core:update-implementation-tracking\" is not referenced in spec requirements"
  suggestedAlignmentCommand: "specd changes create align-spec-deps-20260816-154400 --spec cli:change-implementation --description \"Align spec requirements with newly added dependsOn lock dependencies\""
```

---

### 6. Schema-Agnostic Post-Apply Validation via `ValidateSpecs`

After applying `dependsOn` updates, `SuggestSpecDependencies` invokes `ValidateSpecs` (`kernel.specs.validate`). It consumes the exact `SpecValidationEntry` structure returned by core:

- It extracts `failures: Array<{ artifactId: string, description: string }>`.
- It avoids hardcoding `spec.md` or assuming specific schema artifacts.
- It passes the exact schema failure descriptions to the diagnostic report and `.specd-exploration.md` context file.

---

### 7. Template for Auto-Generated `.specd-exploration.md`

When `createAlignmentChange` is triggered (via SDK option or CLI prompt/`--create-change` flag), the SDK creates a single change gathering all failing specs, and writes the context file at `<changePath>/.specd-exploration.md`:

```markdown
# Exploration Context: align-spec-deps-requirements

Generated: 2026-08-16

## Problem Statement
The following specifications failed schema validation after updating lock dependencies in spec-lock.json via 'specd spec deps suggest --apply'. Their schema artifacts must be updated to align with the newly added lock dependencies.

## Affected Specs & Validation Failures
- cli:change-implementation
  - [Artifact: spec] dependOn "core:update-implementation-tracking" is not referenced in spec requirements
  - [Artifact: spec] dependOn "core:get-implementation-review" is not referenced in spec requirements
- cli:spec-deps
  - [Artifact: spec] dependOn "sdk:suggest-spec-dependencies" missing in requirements section

## Action Required
1. Run '/specd-design' on this change.
2. Update the failing schema artifacts (or write deltas) for each spec to resolve the validation failures described above.
```

---

### 8. Unified Cache Format (`.specd/cache/implementation-suggestions.json`)

The system cache stores BOTH confirmed `spec-lock.json` entries (`existing`) and calculated suggestions (`suggestions`):

```json
{
  "header": {
    "updatedAt": "2026-08-16T15:32:00.000Z",
    "projectDir": "/Users/monki/Documents/Proyectos/specd",
    "cacheVersion": "1.0",
    "graphLastIndexedAt": "2026-08-16T07:49:40.365Z",
    "graphFingerprint": "{\"cli\":\"ac825...\", \"core\":\"e8129...\"}"
  },
  "specs": {
    "cli:change-implementation": {
      "specId": "cli:change-implementation",
      "title": "Change Implementation",
      "specStamp": {
        "lastModified": "2026-08-16T10:00:00.000Z",
        "hash": "sha256:0cc69855806077bffdc5273029210e75868912d6159162d85fe8b3d59ce95022",
        "artifacts": [
          { "filename": "spec.md", "lastModified": "2026-08-16T10:00:00.000Z", "hash": "sha256:abc..." }
        ],
        "persistedStateHash": "sha256:0cc69855...",
        "persistedStateLastModified": "2026-08-16T10:00:00.000Z"
      },
      "existing": {
        "files": [
          "packages/cli/src/commands/change/_implementation-tracking.ts",
          "packages/cli/src/commands/change/implementation.ts"
        ],
        "symbols": [
          "enrichImplementationTracking",
          "registerChangeImplementation"
        ],
        "dependsOn": [
          "core:change",
          "code-graph:symbol-model"
        ]
      },
      "suggestions": [
        {
          "file": "packages/cli/src/commands/change/implementation.ts",
          "symbols": ["registerChangeImplementation", "executeChangeImplementation"],
          "confidence": "HIGH",
          "reasons": ["Explicit code block symbols match TS AST"],
          "score": 180
        }
      ]
    }
  }
}
```

---

### 9. CLI Interfaces & Sample Clean Text Outputs (`@specd/cli`)

#### A. Target Specific Spec (`specd spec implementation suggest <specPath>`):

```bash
specd spec implementation suggest cli:change-implementation --format text
```

#### B. Target All Specs in Project (`specd spec implementation suggest` or `--all`):

```bash
specd spec implementation suggest --all --format text
```

#### C. Target Specs in Workspace (`specd spec deps suggest --workspace cli`):

```bash
specd spec deps suggest --workspace cli --format text
```

#### D. Suggest Spec Dependencies Output with `--apply` and `--create-change` Flag:

```bash
specd spec deps suggest --spec cli:change-implementation --spec cli:spec-deps --apply --create-change --format text
```

**Clean Text Output:**
```text
project root: /Users/monki/Documents/Proyectos/specd
applied 4 spec dependency updates (union) to spec-lock.json

spec: "Change Implementation" (cli:change-implementation)
  updated spec-lock dependsOn:
    [ "core:change", "code-graph:symbol-model", "core:update-implementation-tracking", "core:get-implementation-review", "core:refresh-implementation-tracking" ]

spec: "cli:spec-deps" (cli:spec-deps)
  updated spec-lock dependsOn:
    [ "core:get-persisted-spec-deps", "core:update-persisted-spec-deps", "cli:entrypoint", "sdk:suggest-spec-dependencies" ]

warning: 2 specs failed schema validation after updating dependencies:
  - cli:change-implementation
    [artifact: spec] dependOn "core:update-implementation-tracking" is not referenced in spec requirements
  - cli:spec-deps
    [artifact: spec] dependOn "sdk:suggest-spec-dependencies" missing in requirements section

automatically created alignment change: align-spec-deps-20260816-153700
  path: /Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260816-153700-align-spec-deps
  exploration context written: .specd-exploration.md

suggested action:
  run /specd-design align-spec-deps-20260816-153700 to design spec requirement updates
```

---

## Open questions

- None.
