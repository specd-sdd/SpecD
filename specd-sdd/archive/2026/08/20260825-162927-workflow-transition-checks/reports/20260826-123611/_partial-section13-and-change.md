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
