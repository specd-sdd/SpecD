# Design: lazy-context-loading

## Non-goals

- Changing pattern matching logic (`listMatchingSpecs`) — include/exclude patterns continue to determine which specs are in scope
- Modifying `dependsOn` traversal algorithm or cycle detection — step 5 logic is unchanged
- Adding CLI flags for `contextMode` — it is config-only, not per-invocation
- Per-workspace `contextMode` overrides

## Affected areas

### `packages/core/src/application/specd-config.ts`

Add `contextMode?: 'full' | 'lazy'` to `SpecdConfig`. This is the typed representation of the config field.

### `packages/core/src/application/use-cases/compile-context.ts`

The main change. Currently `execute()` returns `{ contextBlock: string, ... }` where `contextBlock` is assembled from 3 parts joined by `---`. Must be refactored to:

1. Return structured components (`projectContext`, `specs`, `availableSteps`) instead of a single string
2. Tag each collected spec with its `source` (how it was collected)
3. Apply tier classification based on `config.contextMode`
4. For tier 2 specs (`mode: 'summary'`), skip content rendering — only include `specId`, `title`, `description`

Key methods affected:

- `execute()` — result assembly (lines ~380–446)
- The spec rendering loop where metadata/extraction content is produced — needs to conditionally skip for summary-mode specs
- The `_resolveContextEntries()` helper — must return structured entries instead of text

### `packages/core/src/application/use-cases/compile-context.ts` — types

`CompileContextResult` changes from:

```typescript
interface CompileContextResult {
  stepAvailable: boolean
  blockingArtifacts: string[]
  contextBlock: string
  warnings: ContextWarning[]
}
```

to a structured result (see New constructs).

`CompileContextConfig` gains `contextMode?: 'full' | 'lazy'`.

### `packages/core/src/application/use-cases/get-project-context.ts`

Must adapt to the new `CompileContextResult` structure. Currently returns `GetProjectContextResult` with `contextEntries: string[]` and `specs: GetProjectContextSpecEntry[]` (with `workspace`, `path`, `content`).

The `specs` field changes to use `ContextSpecEntry[]` instead of the custom `GetProjectContextSpecEntry`. Since there's no change context, all specs are `mode: 'full'` and `source: 'includePattern'`.

### `packages/cli/src/commands/change/context.ts`

Currently prints `result.contextBlock` for text and includes it in JSON. Must now:

- Assemble text output from `result.projectContext`, `result.specs`, `result.availableSteps`
- In text mode: render full specs with content, render summary specs as a catalogue section
- In JSON mode: pass through the structured result directly

### `packages/cli/src/commands/project/context.ts`

Currently builds text from `result.contextEntries` and `result.specs[].content`. Must adapt to new `ContextSpecEntry` shape — field names change (`workspace`/`path` → `specId`, add `title`/`description`/`source`/`mode`).

### `packages/core/src/infrastructure/fs/config-loader.ts` (or equivalent validation)

Must validate `contextMode` at the infrastructure boundary: accept `'full'` or `'lazy'`, reject other values, reject if present inside workspace entries.

### `packages/core/test/application/use-cases/compile-context.spec.ts`

Existing tests assert `result.contextBlock` as a string. All must be updated to assert on the new structured fields.

### `packages/core/src/composition/use-cases/compile-context.ts`

Factory may need to propagate `contextMode` through config. No structural changes expected — the use case already receives config at execute time.

## New constructs

### `ProjectContextEntry` (type)

**Location:** `packages/core/src/application/use-cases/compile-context.ts` (co-located with result types)

```typescript
interface ProjectContextEntry {
  readonly source: 'instruction' | 'file'
  readonly path?: string // Only for file entries
  readonly content: string // Rendered text content
}
```

**Responsibility:** Represents one project context entry from `config.context`. Does not render — just carries data.

### `ContextSpecEntry` (type)

**Location:** `packages/core/src/application/use-cases/compile-context.ts`

```typescript
type ContextSpecSource = 'specIds' | 'specDependsOn' | 'includePattern' | 'dependsOnTraversal'

interface ContextSpecEntry {
  readonly specId: string // Fully-qualified: workspace:capPath
  readonly title: string // From metadata or heading extraction
  readonly description: string // From metadata (2-3 sentence summary)
  readonly source: ContextSpecSource
  readonly mode: 'full' | 'summary'
  readonly content?: string // Present only when mode === 'full'
}
```

**Responsibility:** Represents one spec in the result. The `source` field tracks provenance; `mode` determines whether full content was rendered.

### `AvailableStep` (type)

**Location:** `packages/core/src/application/use-cases/compile-context.ts`

```typescript
interface AvailableStep {
  readonly step: string
  readonly available: boolean
  readonly blockingArtifacts: readonly string[]
}
```

**Responsibility:** Represents one workflow step's availability status.

### Updated `CompileContextResult`

```typescript
interface CompileContextResult {
  readonly stepAvailable: boolean
  readonly blockingArtifacts: readonly string[]
  readonly projectContext: readonly ProjectContextEntry[]
  readonly specs: readonly ContextSpecEntry[]
  readonly availableSteps: readonly AvailableStep[]
  readonly warnings: readonly ContextWarning[]
}
```

### Updated `CompileContextConfig`

```typescript
interface CompileContextConfig {
  context?: ContextEntry[]
  contextIncludeSpecs?: string[]
  contextExcludeSpecs?: string[]
  contextMode?: 'full' | 'lazy' // NEW
  workspaces?: Record<string, WorkspaceContextConfig>
}
```

## Approach

### Phase 1: Config (`core/config`)

1. Add `contextMode?: 'full' | 'lazy'` to `SpecdConfig`
2. Add validation in config loader — reject invalid values and workspace-level declarations
3. Default to `'lazy'` when omitted (resolved at use case level)

### Phase 2: Structured result (`core/compile-context`)

This is the core refactor. The approach is:

1. **Track source during collection.** Currently the 5-step pipeline collects specs into a `Map<string, ResolvedSpec>`. Extend `ResolvedSpec` (or add a parallel map) to track how each spec was collected:
   - Specs starting in `change.specIds` → `source: 'specIds'`
   - Specs found as values in `change.specDependsOn` → `source: 'specDependsOn'`
   - Specs from steps 1-4 pattern matching → `source: 'includePattern'`
   - Specs from step 5 traversal → `source: 'dependsOnTraversal'`
   - When a spec appears through multiple sources, keep the highest-priority source

2. **Classify tiers after collection.** After the full pipeline completes:
   - If `contextMode === 'lazy'`: tier 1 = specs with source `specIds` or `specDependsOn`; tier 2 = everything else
   - If `contextMode === 'full'`: all specs are tier 1
   - Default is `'lazy'` when `contextMode` is omitted

3. **Render conditionally.** During the spec rendering loop:
   - Tier 1 (`mode: 'full'`): render content as before (metadata or extraction fallback), include `content` field
   - Tier 2 (`mode: 'summary'`): load only `title` and `description` from metadata (no full content rendering). If metadata is absent, extract title from heading and use empty description with a staleness warning.

4. **Structure project context entries.** Instead of rendering context entries into a string, produce `ProjectContextEntry[]` with `source`, `path`, and `content`.

5. **Structure available steps.** Instead of rendering a text list, produce `AvailableStep[]`.

6. **Remove `contextBlock`.** The result no longer includes a pre-assembled string.

### Phase 3: GetProjectContext adaptation

Update to use `ContextSpecEntry[]` instead of `GetProjectContextSpecEntry[]`. All specs are `mode: 'full'`, `source: 'includePattern'`. The `contextEntries` field remains `string[]` (it already returns rendered text per entry).

### Phase 4: CLI formatting

Both CLI commands now own text assembly:

**`change context` text mode:**

```
{projectContext entries, each with source label, separated by ---}

## Spec content

### Spec: core:core/compile-context

{full content}

---

### Spec: core:core/config

{full content}

## Available context specs

Use `specd spec show <spec-id>` to load the full content of any spec you need.

| Spec ID | Title | Description |
|---------|-------|-------------|
| default:_global/architecture | Architecture | Defines the hexagonal... |
| default:_global/conventions | Coding Conventions | Without consistent... |

### Via dependencies

| Spec ID | Title | Description |
|---------|-------|-------------|
| core:core/spec-metadata | Spec Metadata | .specd-metadata.yaml format... |

## Available steps

{step list with availability}
```

**`change context` JSON mode:** Pass through structured result directly.

**`project context`:** Same adaptation but all specs are always full — no catalogue section.

## Key decisions

**Decision:** `ContextSpecEntry` defined in `compile-context.ts`, shared by both use cases.
**Rationale:** Both `CompileContext` and `GetProjectContext` produce spec entries with the same shape. Defining it once avoids divergence.
**Alternative rejected:** Separate types per use case — creates maintenance burden with no benefit.

**Decision:** Source tracking via a parallel map during collection, not by modifying `ResolvedSpec`.
**Rationale:** `ResolvedSpec` is shared with pattern matching utilities. Adding source tracking to it would leak change-specific concerns into a general utility.
**Alternative rejected:** Extending `ResolvedSpec` with `source` — couples pattern matching to change context.

**Decision:** `GetProjectContext` always returns `mode: 'full'`.
**Rationale:** Without a change, there's no `specIds`/`specDependsOn` to define tier 1. Making everything full is the only sensible default.
**Alternative rejected:** Adding a `specIds` input to `GetProjectContext` — defeats its purpose as the change-independent path.

## Trade-offs

**[Risk]** Summary-mode specs with absent metadata have no title/description available.
**Mitigation:** Extract title from the spec file heading. Use an empty description with a staleness warning. The agent can still load the full spec via CLI.

**[Risk]** Existing tests assert on `contextBlock` string content.
**Mitigation:** Update all tests to assert on structured fields. The text format is now CLI's responsibility — test CLI formatting separately.

## Testing

### Automated tests

**`packages/core/test/application/use-cases/compile-context.spec.ts`:**

- Update all existing tests to assert on `result.specs`, `result.projectContext`, `result.availableSteps` instead of `result.contextBlock`
- Add `describe('tier classification')`:
  - `it('classifies specIds specs as tier 1 full')` — verify `mode: 'full'`, `source: 'specIds'`
  - `it('classifies specDependsOn specs as tier 1 full')` — verify `mode: 'full'`, `source: 'specDependsOn'`
  - `it('classifies includePattern specs as tier 2 summary in lazy mode')` — verify `mode: 'summary'`, no `content`
  - `it('classifies dependsOnTraversal specs as tier 2 summary in lazy mode')` — verify `mode: 'summary'`
  - `it('classifies all specs as full when contextMode is full')`
  - `it('defaults to lazy when contextMode is omitted')` — default is lazy
  - `it('uses highest-priority source when spec matches multiple sources')` — specIds > specDependsOn > dependsOnTraversal > includePattern
- Add `describe('structured result')`:
  - `it('returns projectContext as structured entries')` — verify `source`, `path`, `content`
  - `it('returns availableSteps with availability')` — verify step objects
  - `it('does not include contextBlock in result')` — verify field absent

**`packages/core/test/application/use-cases/get-project-context.spec.ts`:**

- Update spec assertions to use `ContextSpecEntry` shape
- Verify all specs have `mode: 'full'` and `source: 'includePattern'`

**`packages/core/test/infrastructure/fs/config-loader.spec.ts`** (or equivalent):

- `it('accepts contextMode full')` — valid
- `it('accepts contextMode lazy')` — valid
- `it('defaults contextMode to lazy when omitted')` — default is lazy
- `it('rejects invalid contextMode value')` — `ConfigValidationError`
- `it('rejects contextMode inside workspace entry')` — `ConfigValidationError`

**`packages/cli/test/commands/change/context.spec.ts`** (if exists):

- Test text output assembly with full and summary specs
- Test JSON output passes through structured result
- Test catalogue section with `## Available context specs` heading

### Manual / E2E verification

1. Set `contextMode: lazy` in a project's `specd.yaml`
2. Create a change with 2-3 specIds
3. Run `specd change context <name> designing --format text`
   - Verify specIds specs appear with full content
   - Verify other specs appear in catalogue table
4. Run `specd change context <name> designing --format json`
   - Verify JSON has `specs` array with `mode` and `source` fields
   - Verify summary specs have no `content`
5. Run `specd project context --format json`
   - Verify all specs have `mode: 'full'`
6. Remove `contextMode` from config, re-run — verify behaviour matches `contextMode: full`
7. Set `contextMode: invalid` — verify startup fails with validation error
