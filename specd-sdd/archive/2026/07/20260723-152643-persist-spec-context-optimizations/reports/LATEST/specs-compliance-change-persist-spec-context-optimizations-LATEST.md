# Specs Compliance Report — persist-spec-context-optimizations

**Mode:** change (section 15 / 2026-07-25 focus + section 14 spot-check)  
**Change:** `persist-spec-context-optimizations`  
**Change path:** `specd-sdd/changes/20260723-152643-persist-spec-context-optimizations`  
**State:** verifying  
**Timestamp:** 2026-07-25T13:34:52  
**Auditor:** specs-compliance (read-only)

---

## Verdict: PASS WITH NOTES

Section 15 follow-up items are implemented and covered by tests. The prior section-14 note on `InitProjectResult.metadataCachePath` verify shape is closed. Remaining notes are minor test-depth gaps on `cli:spec-metadata` JSON scenarios (implementation looks compliant; thickened tests emphasize text + diagnostics).

---

## Priority specs audited

| Spec ID                                    | Status           | Gap? | Evidence summary                                                                                              |
| ------------------------------------------ | ---------------- | ---- | ------------------------------------------------------------------------------------------------------------- |
| `core:get-project-context`                 | Compliant        | —    | List mode classifies first; skips `GetSpecMetadata`; unit test asserts no call                                |
| `core:config-writer-port`                  | Compliant        | —    | `InitProjectResult.metadataCachePath` in port + verify shape scenario                                         |
| `cli:spec-generate-metadata`               | Compliant        | —    | `--force` passthrough + batch JSON totals covered                                                             |
| `cli:spec-metadata`                        | Compliant        | Note | Full text contract covered; JSON diagnostics covered; full arrays / no-`fresh` not asserted in thickened test |
| `cli:project-init`                         | Compliant        | —    | Text `metadata cache:` line + JSON `metadataCachePath`                                                        |
| `core:update-persisted-spec-optimizations` | Compliant (spot) | —    | Clear no-op + persisted schema on set                                                                         |
| `core:get-persisted-spec-optimizations`    | Compliant (spot) | —    | Missing field freshness `missing`                                                                             |
| `core:compile-context`                     | Compliant (spot) | —    | List mode short-circuits before materialization                                                               |

---

## Section 15 findings (2026-07-25)

### 1. `core:get-project-context` — list mode MUST NOT call `GetSpecMetadata`

**Spec/verify:** After display-mode classification, list entries must not materialize (`Only rendered specs are materialized`).

**Implementation — Compliant**

```275:279:packages/core/src/application/use-cases/get-project-context.ts
      // Classify display mode before materializing — list entries never call GetSpecMetadata.
      if (resolvedMode === 'list') {
        specs.push({ specId, source, mode: 'list' })
        continue
      }
```

Mode is resolved at lines 248–254 before the per-spec loop; materialization (`materializeContextSpecMetadata` → `GetSpecMetadata`) only runs after the list short-circuit (281–283).

`checkProjectMetadataFreshness` is still invoked earlier (155–161) but early-returns without calling `getMetadata` when `llmOptimizedContext` is unset/false (`project-metadata-freshness.ts:43-45`), so list-mode default path does not materialize.

**Test — Compliant**

```843:881:packages/core/test/application/use-cases/get-project-context.spec.ts
  it('list mode does not call GetSpecMetadata for included specs', async () => {
    ...
    expect(result.specs[0]?.mode).toBe('list')
    expect(result.specs[0]?.title).toBeUndefined()
    expect(result.specs[0]?.description).toBeUndefined()
    expect(result.specs[0]?.content).toBeUndefined()
    expect(getMetadata.execute).not.toHaveBeenCalled()
  })
```

### 2. `core:config-writer-port` — `InitProjectResult.metadataCachePath`

**Spec/verify:** `InitProjectResult` required fields include `metadataCachePath: string`.

**Implementation — Compliant**

```16:25:packages/core/src/application/ports/config-writer.ts
export interface InitProjectResult {
  readonly configPath: string
  readonly schemaRef: string
  readonly workspaces: readonly string[]
  /** Project-relative path to the metadata cache directory. */
  readonly metadataCachePath: string
}
```

**Verify alignment — Compliant (closes prior note)**  
Previewed verify scenario `InitProjectResult contains required fields` now lists `metadataCachePath: string` alongside `configPath`, `schemaRef`, `workspaces`.

**Infra test:** `packages/core/test/infrastructure/fs/config-writer.spec.ts:46` asserts `result.metadataCachePath === '.specd/metadata'`.

### 3. CLI contract tests thickened

#### `cli:spec-generate-metadata`

**Verify:** `--force` → `RegenerateSpecMetadata` with `force: true`; `--all --format json` emits `total` / `succeeded` / `failed`.

**Handler — Compliant:** `packages/cli/src/commands/spec/generate-metadata.ts:52-65` (`force`), `:87-107` (batch JSON totals).

**Tests — Compliant**

| Scenario                        | File:line                                                                 |
| ------------------------------- | ------------------------------------------------------------------------- |
| `--force` → `force: true`       | `packages/cli/test/commands/spec-generate-metadata.spec.ts:93-125`        |
| Omitting force → `force: false` | `:68-71`                                                                  |
| Batch JSON totals               | `:128-159` (`result: 'partial'`, `total: 2`, `succeeded: 1`, `failed: 1`) |

#### `cli:spec-metadata`

**Verify:** Text shows counts + optional sections; JSON includes diagnostics + full arrays; no top-level `fresh` / `contentHashes`.

**Handler — Compliant:** `packages/cli/src/commands/spec/metadata.ts:29-60` (text sections), `:119-122` (JSON diagnostics + metadata object passthrough).

**Tests — Compliant with note**

| Scenario                                                                                                   | File:line                                                | Status                                            |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Full text (source, regenerated, fingerprint, title, description, generatedBy, counts, dependsOn, warnings) | `packages/cli/test/commands/spec-metadata.spec.ts:42-82` | Covered                                           |
| JSON diagnostics (`source`, `regenerated`, `warnings`, fingerprint)                                        | `:85-116`                                                | Covered                                           |
| JSON full `rules`/`constraints`/`scenarios` arrays                                                         | —                                                        | Not asserted in thickened test (impl passthrough) |
| JSON absence of `fresh` / `contentHashes`                                                                  | —                                                        | Not asserted                                      |

#### `cli:project-init`

**Verify:** Text contains `metadata cache: <path> (ignored in .gitignore)`; JSON includes `metadataCachePath`.

**Handler — Compliant:** `packages/cli/src/commands/project/init.ts:104`, `:117` (and alias path `:247`, `:260`).

**Tests — Compliant**

| Scenario                 | File:line                                             |
| ------------------------ | ----------------------------------------------------- |
| JSON `metadataCachePath` | `packages/cli/test/commands/project-init.spec.ts:200` |
| Text metadata cache line | `:203-218`                                            |

---

## Section 14 spot-check

### `core:update-persisted-spec-optimizations` — clear / schema

| Behaviour                                             | Code                                             | Test                                                 |
| ----------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Clear on uninitialized state is no-op (no write)      | `update-persisted-spec-optimizations.ts:105-109` | `update-persisted-spec-optimizations.spec.ts:36-58`  |
| Recorded schema uses existing persisted schema on set | `update-persisted-spec-optimizations.ts:150-156` | `update-persisted-spec-optimizations.spec.ts:61-102` |

### `core:get-persisted-spec-optimizations` — missing freshness

| Behaviour                                                              | Code                                          | Test                                             |
| ---------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ |
| Filtered absent field → `freshness: 'missing'`, `reasons: ['missing']` | `get-persisted-spec-optimizations.ts:129-132` | `get-persisted-spec-optimizations.spec.ts:37-66` |
| Uninitialized → `initialized: false`, `fresh: false`                   | `:71`                                         | `:24-35`                                         |

### `core:compile-context` — list skip

| Behaviour                                       | Code                         | Test                                                                   |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| List mode short-circuits before materialization | `compile-context.ts:561-564` | `compile-context.spec.ts:2430-2474` (`getMetadata.execute` not called) |

---

## Remaining notes

1. **`cli:spec-metadata` JSON depth (low):** Thickened tests cover text thoroughly and JSON diagnostics, but do not yet assert verify scenarios for full `rules`/`constraints`/`scenarios` arrays or absence of top-level `fresh` / `contentHashes`. Handler passes through `result.metadata` and diagnostics — no implementation defect observed.
2. **`cli:spec-generate-metadata` batch success path (low):** Batch JSON test covers the `partial` path; all-ok (`result: "ok"`, `failed: 0`) is implied by the same total math but not separately asserted.

No blocking gaps for section 15 acceptance.

---

## Audit method

- `node packages/cli/dist/index.js changes status persist-spec-context-optimizations --format toon`
- `node packages/cli/dist/index.js changes spec-preview persist-spec-context-optimizations <specId> --artifact verify --format text` for priority specs
- Direct read of implementation + test files listed above
- No code or spec files modified (report-only write)
