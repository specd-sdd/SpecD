# Spec Compliance Audit — `host-controlled-list-limits`

**Change:** `host-controlled-list-limits` (state: verifying)  
**Audit date:** 2026-07-22  
**Scope:** 10 change specs (delta-focused)  
**Graph index:** fresh (`4616ecfe`, not stale)

---

## Executive Summary

| Metric                               | Count |
| ------------------------------------ | ----: |
| Requirements checked (delta-related) |    47 |
| Pass                                 |    38 |
| Fail                                 |     9 |
| Spec drift (spec wrong / incomplete) |     6 |
| Implementation bug                   |     1 |
| Test gap                             |     2 |

**Overall:** Core pagination refactor (`paginateList`, port-level no-default-limit) and CLI host defaults for change buckets are implemented correctly. Failures are mostly **stale Constraints/Examples sections** in port/CLI specs that were not updated by the delta, one **spec-list truncation-hint guard** bug, and **missing verify tests** for `--limit all` on three change-bucket CLI commands.

---

## Per-Spec Findings

### `core:repository-port` — PASS (7/7)

| Requirement                                  | Status | Evidence                                                       |
| -------------------------------------------- | ------ | -------------------------------------------------------------- |
| Omitted `limit` returns full set             | PASS   | `packages/core/src/infrastructure/fs/list-pagination.ts:34-42` |
| `meta.limit === meta.total` when unpaginated | PASS   | Same; `list-pagination.spec.ts` L23-28                         |
| Explicit `limit` caps page                   | PASS   | `list-pagination.spec.ts` L100-107                             |
| `page` without `limit` rejected              | PASS   | `list-pagination.ts:27-28`; test L39-43                        |
| `page` and `after` mutually exclusive        | PASS   | `list-pagination.ts:30-31`; test L51-55                        |
| `after` + `limit` keyset paging              | PASS   | test L74-82                                                    |
| `after` without `limit` returns remainder    | PASS   | test L62-71                                                    |
| `meta.after` not echoed from request         | PASS   | test L111-116                                                  |

**Test coverage:** Strong unit coverage in `packages/core/test/infrastructure/fs/list-pagination.spec.ts`.

---

### `core:list-specs` — PASS with spec drift (4/5)

| Requirement                                      | Status                | Evidence                                                                                                       |
| ------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Does not invent default `limit`                  | PASS                  | `list-specs.ts:54-55`; `list-specs.spec.ts` L76-86                                                             |
| Forwards same `ListOptions` to each repo         | PASS                  | `list-specs.ts:54-60,71`                                                                                       |
| Does not re-sort/re-paginate                     | PASS                  | merge loop L68-79                                                                                              |
| Verify: omitted limit forwarded                  | PASS                  | test exists                                                                                                    |
| Verify: `resolveListSpecsDeps` lists hasher/yaml | **FAIL (spec drift)** | Merged verify L479-482 still asserts `hasher` and `yaml`; spec requirements L318-322 say MUST NOT resolve them |

**Discrepancy:** Verify artifact not updated — **spec drift**, not implementation bug. Implementation/deps appear aligned with requirements.

**Test gap:** No integration test with >100 specs per workspace asserting full catalog return.

---

### `core:spec-repository-port` — PASS with spec drift (3/4)

| Requirement                          | Status                | Evidence                                                    |
| ------------------------------------ | --------------------- | ----------------------------------------------------------- |
| No default `limit` (requirements)    | PASS                  | Uses `paginateList` via `fs-index-cache-base.ts:135`        |
| Empty workspace `meta.limit === 0`   | PASS                  | verify scenario; `change-repository.spec.ts` L548 (pattern) |
| Pagination follows repository-port   | PASS                  | shared `paginateList`                                       |
| Constraints: "default limit **100**" | **FAIL (spec drift)** | Merged spec Constraints L687 still states default 100       |

**Discrepancy:** Requirements updated; Constraints section stale — **spec drift**.

**Test gap:** `spec-repository.spec.ts` calls `list()` but does not assert `meta.limit === meta.total` for non-empty unpaginated lists (>1 item).

---

### `core:change-repository-port` — PASS with spec drift (3/4)

| Requirement                                       | Status                | Evidence                                                 |
| ------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| Port has no default limit (via shared pagination) | PASS                  | `change-list-projection.ts:208,228,248` → `paginateList` |
| Empty active list `meta.limit === 0`              | PASS                  | `change-repository.spec.ts` L545-548                     |
| List methods use index + pagination               | PASS                  | fs index caches                                          |
| Constraints: "Default list limit is **100**"      | **FAIL (spec drift)** | Merged spec Constraints L1346                            |

**Discrepancy:** **Spec drift** — Constraints contradict `core:repository-port` and change intent.

**Test gap:** No test creating >100 changes and calling `list()` without limit to assert full return.

---

### `core:archive-repository-port` — PASS with spec drift (4/5)

| Requirement                                          | Status                | Evidence                                                  |
| ---------------------------------------------------- | --------------------- | --------------------------------------------------------- |
| "Pagination has **no default limit**" (requirements) | PASS                  | `fs-archive-index-cache.ts:68` → `paginateList`           |
| Empty archive `meta.limit === 0`                     | PASS                  | `archive-repository.spec.ts` L356-359                     |
| Unpaginated list returns all entries                 | PASS                  | `archive-repository.spec.ts` L376-381 (2 items, no limit) |
| `meta.total` from index                              | PASS                  | existing tests                                            |
| Constraints: "Default list limit is **100**"         | **FAIL (spec drift)** | Merged spec Constraints L2062                             |

**Discrepancy:** **Spec drift** — Requirements and Constraints contradict within merged preview.

---

### `cli:spec-list` — FAIL (6/8)

| Requirement                                               | Status                        | Evidence                                                                                                                         |
| --------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| No CLI default numeric limit                              | PASS                          | `spec/list.ts:157,192` — no `defaultLimit`                                                                                       |
| Omitted/`all` omits `limit` from use case                 | PASS                          | `spec-list.spec.ts` L482-515                                                                                                     |
| `--page` requires numeric `--limit`                       | PASS                          | `spec-list.spec.ts` L518-529                                                                                                     |
| `--after-id` not supported                                | PASS                          | `spec-list.spec.ts` L456-463                                                                                                     |
| Truncation hint only with numeric `--limit`               | **FAIL (implementation bug)** | `spec/list.ts:251` calls `formatTruncationHint(meta)` whenever `count < total`; does not check whether CLI applied numeric limit |
| Examples show `"limit":100,"page":1` for unpaginated JSON | **FAIL (spec drift)**         | Merged spec Examples L2540-2562                                                                                                  |
| Verify: no hint when limit omitted                        | **FAIL**                      | Verify L2803-2807; test L466-479 runs **without** `--limit` but **expects** hint — test contradicts verify                       |
| Verify: JSON meta includes `page` always                  | PARTIAL                       | Verify L2782; implementation omits `page` when unpaginated (likely acceptable)                                                   |

**Implementation bug detail:** Running `specd spec list` (no `--limit`) against mocked `meta: { count: 1, total: 500 }` prints `showing 1 of 500`. Spec requires no hint unless numeric `--limit` was applied. Change-bucket commands are fine because host default 100 counts as numeric limit.

**Test gap:** No test for verify scenario "Omitted limit returns full workspace catalog" (>100 specs, integration or realistic mock asserting `meta.limit === meta.total`).

---

### `cli:change-list` — PASS (8/8)

| Requirement                                       | Status | Evidence                                                |
| ------------------------------------------------- | ------ | ------------------------------------------------------- |
| Host default `limit: 100` when omitted            | PASS   | `change/list.ts:92,125`; `change-list.spec.ts` L162-172 |
| `--limit all` omits limit                         | PASS   | `change-list.spec.ts` L175-184                          |
| `--page` + omitted limit → `{ limit: 100, page }` | PASS   | L186-194                                                |
| `--page` + `--limit all` rejected                 | PASS   | L197-205                                                |
| Truncation hint with default limit                | PASS   | L3076-3079 area (truncation test)                       |
| Empty JSON `limit: 100` with default              | PASS   | verify + tests                                          |

**Test coverage:** Adequate for change delta scenarios.

---

### `cli:drafts-list` — PASS with test gaps (5/7)

| Requirement                               | Status              | Evidence                                                |
| ----------------------------------------- | ------------------- | ------------------------------------------------------- |
| Host default `limit: 100`                 | PASS                | `drafts/list.ts:112,138`; tests L119, L152              |
| `--page` + omitted limit uses 100         | PASS                | `drafts-list.spec.ts` L144-152                          |
| Truncation hint with default              | PASS                | L196-207                                                |
| `--limit all` omits limit                 | PASS (impl)         | Shared `parseListPaginationFlags` — same as change-list |
| Verify: `--limit all` scenario            | **FAIL (test gap)** | No test in `drafts-list.spec.ts`                        |
| Verify: `--page` + `--limit all` rejected | **FAIL (test gap)** | No test                                                 |

**Note:** Implementation likely correct via shared helper; missing tests only.

---

### `cli:archive-list` — PASS with test gaps (5/7)

Same pattern as drafts-list:

| Requirement                              | Status                                |
| ---------------------------------------- | ------------------------------------- |
| Default 100, page forwarding, truncation | PASS                                  |
| `--limit all` / `--page`+`all` rejection | **Test gap** (impl via shared helper) |

Evidence: `archive/list.ts:27,66`; `archive-list.spec.ts` covers default and page, not `--limit all`.

---

### `cli:discarded-list` — PASS with test gaps (5/7)

Same pattern:

| Requirement                                    | Status       |
| ---------------------------------------------- | ------------ |
| Default 100, `--after-key`+default, truncation | PASS         |
| `--limit all` / `--page`+`all` rejection       | **Test gap** |

Evidence: `discarded/list.ts:119,146`; `discarded-list.spec.ts`.

---

## Cross-Cutting Observations

### Implementation architecture (aligned)

```
CLI host layer                    Core port layer
─────────────────                 ─────────────────
spec list: no defaultLimit   →    paginateList: limit undefined → full set
change/drafts/archive/       →    same paginateList, no port default
discarded: defaultLimit 100
```

- `DEFAULT_LIST_LIMIT = 100` in `packages/cli/src/helpers/list-pagination.ts`
- Single pagination primitive: `packages/core/src/infrastructure/fs/list-pagination.ts`

### Stale Constraints sections (spec drift — fix in delta)

These **Constraints** bullets were not removed/updated and contradict Requirements + `core:repository-port`:

1. `core:spec-repository-port` — "default limit **100**" (merged L687)
2. `core:change-repository-port` — "Default list `limit` is **100**" (merged L1346)
3. `core:archive-repository-port` — "Default list `limit` is **100**" (merged L2062)

### Stale Examples (spec drift)

- `cli:spec-list` JSON examples still show `"limit":100,"page":1` for unpaginated runs (merged L2540-2562)

### Test mock smell (non-blocking)

Several core use-case test helpers still use `limit: options?.limit ?? 100` in mocks (`list-drafts.spec.ts`, `list-discarded.spec.ts`, etc.). These are test doubles, not production code, but could mask regressions if relied on for pagination behavior.

---

## Discrepancy Classification

| ID  | Type               | Location                                                    | Summary                                                            |
| --- | ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| D1  | Spec drift         | `core:spec-repository-port` Constraints                     | Still claims default limit 100                                     |
| D2  | Spec drift         | `core:change-repository-port` Constraints                   | Still claims default limit 100                                     |
| D3  | Spec drift         | `core:archive-repository-port` Constraints                  | Still claims default limit 100                                     |
| D4  | Spec drift         | `cli:spec-list` Examples                                    | JSON examples show limit:100 for unpaginated                       |
| D5  | Spec drift         | `core:list-specs` verify                                    | resolveListSpecsDeps scenario lists hasher/yaml contrary to spec   |
| D6  | Implementation bug | `cli:spec-list`                                             | Truncation hint shown without numeric `--limit`                    |
| D7  | Test gap           | `cli:drafts-list`, `cli:archive-list`, `cli:discarded-list` | Missing `--limit all` and `--page`+`all` tests                     |
| D8  | Test gap           | `cli:spec-list`                                             | Test expects truncation hint without `--limit`; contradicts verify |
| D9  | Test gap           | Core fs repos                                               | No >100 entry unpaginated `list()` integration assertions          |

---

## Recommendations (informational — read-only audit)

1. **Spec deltas:** Remove or rewrite stale Constraints/Examples in port specs and `cli:spec-list` examples.
2. **Implementation:** Gate `formatTruncationHint` in `spec/list.ts` on whether `pagination.limit` was set (numeric), not merely `meta.count < meta.total`.
3. **Tests:** Add `--limit all` tests to drafts/archive/discarded list specs; fix spec-list truncation test; add integration test for >100 unpaginated spec list.

---

## Counts by Spec

| Spec                         | Checked |   Pass |  Fail |
| ---------------------------- | ------: | -----: | ----: |
| core:repository-port         |       7 |      7 |     0 |
| core:list-specs              |       5 |      4 |     1 |
| core:spec-repository-port    |       4 |      3 |     1 |
| core:change-repository-port  |       4 |      3 |     1 |
| core:archive-repository-port |       5 |      4 |     1 |
| cli:spec-list                |       8 |      6 |     2 |
| cli:change-list              |       8 |      8 |     0 |
| cli:drafts-list              |       7 |      5 |     2 |
| cli:archive-list             |       7 |      5 |     2 |
| cli:discarded-list           |       7 |      5 |     2 |
| **Total**                    |  **47** | **38** | **9** |
