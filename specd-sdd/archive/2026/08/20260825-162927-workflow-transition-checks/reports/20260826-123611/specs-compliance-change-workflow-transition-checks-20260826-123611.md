# Specs Compliance Report — change `workflow-transition-checks`

- **Timestamp:** 20260826-123611
- **Mode:** Specific Change (`--change workflow-transition-checks`)
- **Change path:** `specd-sdd/changes/20260825-162927-workflow-transition-checks`
- **Change state:** verifying
- **Graph:** re-indexed before audit (`CONTENT_KNOWN_STALE` cleared)
- **Read-only:** yes — no code or spec edits

## 1. Overall verdict

**Issues found** (2 findings: 1 high, 1 medium). Section 13 implementation items (13.1–13.3) largely match intent; verify merge for text `review:` is inconsistent, and blocker UX over-advertises skip for open-file `IMPLEMENTATION_STATE`.

## 2. Findings

| #   | Severity   | Spec                                         | Summary                                                                                                                                                                                                                                                                                                                         |
| --- | ---------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **high**   | `cli:change-status`                          | Merged verify still requires a text `review:` section with file paths (`Text output shows review section when review is required`) while the new requirement/scenarios require omitting that header/lists. Code and tests follow the **new** rule. Delta added scenarios but did not remove/rewrite the obsolete base scenario. |
| 2   | **medium** | `core:transition-checks` / `core:get-status` | Spec: only `impl.linksInScope` is skippable via `--allow-out-of-scope`. Code check bodies match, but `LifecycleEngine` / `GetStatus` mark **all** `IMPLEMENTATION_STATE` fails (including open tracked files from `impl.filesResolved`) as skippable with that bypassFlag — misleading status/repair guidance.                  |

Empty if clean: N/A (issues present).

## 3. Specs audited

Change specs (15):

1. `core:lifecycle-engine`
2. `core:get-status`
3. `core:transition-change`
4. `core:workflow-model`
5. `core:archive-change`
6. `cli:change-status`
7. `cli:change-transition`
8. `core:transition-checks`
9. `core:change`
10. `skills:skill-templates-source`
11. `core:hook-execution-model`
12. `core:approve-spec`
13. `core:approve-signoff`
14. `cli:change-approve`
15. `core:config`

Also considered: project context + depth-1 deps called out by change status (e.g. `default:_global/architecture`) for consistency; no extra global contradictions on the section-13 surface.

## 4. Section 13 scenario coverage (brief)

| Task                                            | Requirement                                                               | Impl                                   | Tests                               | Notes                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- | ------------------------------------------ |
| **13.1** impl.\* `along=forward`                | Registry: `from=implementing`, `to=*`, `along=forward`; no redesign match | Pass (`check-bindings` / registry)     | Pass (matcher + redesign non-match) | Archive bindings unchanged                 |
| **13.2** Compact `IMPLEMENTATION_STATE` message | Count + ≤3 paths; `examples` when truncated; full `details.files`         | Pass (`formatOpenTrackedFilesMessage`) | Pass                                | DEPS/READ_ONLY not compacted               |
| **13.3** Text omits duplicated `review:`        | No review header/file lists; overlap peers stay; JSON full `review`       | Pass (CLI text path)                   | Pass                                | **Verify merge contradiction** → Finding 1 |

## Detailed findings (partial verbatim)

<!-- BEGIN _partial-section13-and-change.md -->

# Partial: workflow-transition-checks compliance (inline)

**Mode:** Specific Change `--change workflow-transition-checks`  
**Focus:** Section 13 (impl `along=forward`, compact `IMPLEMENTATION_STATE`, text omits duplicated `review:`) + change-wide spot check  
**Read-only:** yes

## Specs in change (15)

- `core:lifecycle-engine`
- `core:get-status`
- `core:transition-change`
- `core:workflow-model`
- `core:archive-change`
- `cli:change-status`
- `cli:change-transition`
- `core:transition-checks`
- `core:change`
- `skills:skill-templates-source`
- `core:hook-execution-model`
- `core:approve-spec`
- `core:approve-signoff`
- `cli:change-approve`
- `core:config`

## Project-wide / depth-1 deps noted

- `default:_global/architecture` (via several change specs)
- Other deps (e.g. `core:schema-format`, `cli:entrypoint`) treated as context; no contradictions found in section-13 surface

---

## Section 13 coverage notes

### 13.1 Bind impl.\* to `along = forward` only

| Aspect                                                   | Status                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Spec (`core:transition-checks` registry bindings)        | `from=implementing`, `to=*`, `along=forward`; must not match redesign                                                                 |
| Code (`check-bindings.ts`, `workflow-check-registry.ts`) | Matches                                                                                                                               |
| Archive bindings                                         | Unchanged (`scope: archive`) — matches                                                                                                |
| Tests                                                    | `transition-checks.spec.ts`: implementing→designing does not match; ready→verifying does not match; exit-implementing forward matches |
| Verdict                                                  | **Compliant**                                                                                                                         |

### 13.2 Compact `IMPLEMENTATION_STATE` fail message

| Aspect                                                          | Status                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Spec                                                            | Count + ≤3 paths; label `examples` when truncated; full list in `details.files`; do not compact DEPS/READ_ONLY |
| Code (`impl-files-resolved.ts` `formatOpenTrackedFilesMessage`) | Matches (`examples:` when count > 3)                                                                           |
| Tests                                                           | Compact + non-examples paths covered in `transition-checks.spec.ts`                                            |
| Verdict                                                         | **Compliant**                                                                                                  |

### 13.3 Omit duplicated `review:` from status text

| Aspect                             | Status                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Spec requirement (delta + preview) | No `review:` header / file lists; overlap peers still print; JSON/TOON full `review`              |
| Code (`cli/.../status.ts`)         | No `review:` text block; prints `overlap:` for overlap peers only                                 |
| Tests                              | `change.spec.ts` / `change-status.spec.ts` assert `not.toContain('review:')`; overlap peers print |
| Verify.md                          | **Contradiction** — see Finding 1                                                                 |
| Verdict                            | **Impl + new verify scenarios compliant; merged verify inconsistent**                             |

---

## Discrepancies

### Finding 1 — HIGH — verify contradiction on text `review:`

- **Spec:** Merged `cli:change-status` verify still has base scenario  
  `Text output shows review section when review is required` → MUST include `review:` with route/reason/absolute paths.  
  New requirement `Text status omits duplicated review file lists` + scenarios require the opposite (no `review:` file list / header for artifact-review / drift).
- **Code:** Follows the **new** requirement (no `review:` header).
- **Tests:** Follow the **new** requirement; no remaining test for the old scenario.
- **Interpretation:** Incomplete delta — added new scenarios without modifying/removing the obsolete base scenario. Prefer treating new requirement as intent; fix verify by removing or rewriting the old scenario.
- **Evidence:** `specs/cli/change-status/verify.md` line ~51; delta only `op: added` for new requirement; `packages/cli/src/commands/change/status.ts` overlap-only text path.

### Finding 2 — MEDIUM — `IMPLEMENTATION_STATE` blockers always advertise `--allow-out-of-scope`

- **Spec (`core:transition-checks`):** Only `impl.linksInScope` is skippable with `--allow-out-of-scope`. `impl.filesResolved` (open tracked files) shares code `IMPLEMENTATION_STATE` but is not described as skippable that way.
- **Code:** Check body is correct — `impl.linksInScope` skips on `allowOutOfScope`; `impl.filesResolved` does not.  
  But `LifecycleEngine._blockersFromFailedChecks` and `GetStatus` merge mark **every** `IMPLEMENTATION_STATE` fail as `isSkippable` with `bypassFlag: '--allow-out-of-scope'`.
- **Impact:** Status/repair UX can tell agents open files are bypassable; re-running with the flag still fails on open files.
- **Evidence:** `lifecycle-engine.ts` ~777–783; `get-status.ts` ~644–646; `impl-links-in-scope.ts` vs `impl-files-resolved.ts`.

---

## Other change specs (spot check)

No additional critical/high discrepancies found in section-13-adjacent surfaces:

- `hook.post` / transition post: `along=forward` in bindings and `matching-effects` redesign test
- `approval.spec` / `approval.signoff` bindings match registry table (`ready→implementing|verifying`, `done→archivable`)
- Compact message not applied to `DEPS_INCONSISTENT` / `READ_ONLY_WORKSPACE` (separate check modules)

---

## Summary counts

| Metric                   | Count                                           |
| ------------------------ | ----------------------------------------------- |
| Specs audited (change)   | 15                                              |
| Findings                 | 2                                               |
| Critical                 | 0                                               |
| High                     | 1                                               |
| Medium                   | 1                                               |
| Low                      | 0                                               |
| Section 13 impl coverage | 13.1–13.2 clean; 13.3 impl clean / verify dirty |

<!-- END _partial-section13-and-change.md -->

## Suggested next steps (informational; not executed)

1. Add a `modified`/`removed` verify delta for obsolete `Text output shows review section when review is required`.
2. Scope `isSkippable` / `bypassFlag` to `impl.linksInScope` failures only (or distinct codes), so open-file `IMPLEMENTATION_STATE` is not advertised as bypassable.
