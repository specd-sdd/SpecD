# Proposal: 07-core-kernel-input-audit

## Motivation

Phase P1 refactors moved `SpecdConfig` and approval-gate settings into kernel construction time so `execute()` inputs carry only per-call, caller-specific data. P1d is the terminal audit: verify every kernel-exposed use case complies, document legitimate exceptions, and fix or spec any remaining violations before downstream host/SDK work proceeds.

## Current behaviour

`createKernel(config)` bakes `SpecdConfig` (and related construction-time options) into use case instances. Prior changes (P1a, P1c, P1e) removed `config` from `CompileContext` / `GetProjectContext` execute inputs and moved config mutation off the kernel. `GetConfig` exposes a readonly config snapshot for hosts.

Gaps remain unverified:

- **Approval flags in execute inputs** — `TransitionChangeInput`, `ApproveSpecInput`, and `ApproveSignoffInput` still accept `approvalsSpec` / `approvalsSignoff` per call. Change `09-core-approval-gates-baked` targets baking these at construction; this audit must confirm whether they are still violations or already resolved on the branch under test.
- **Runtime context overrides** — `CompileContextInput` and `GetProjectContextInput` accept optional `contextMode`, `llmOptimizedContext`, `followDeps`, etc. These are caller/runtime choices, not config re-reads; the audit must classify them as allowed exceptions with rationale.
- **Ghost spec metadata** — `core:record-skill-install` and `core:get-skills-manifest` had no `specs/` files and no kernel implementation; ghost `.specd/metadata/` entries deleted in P1d. Docs and transitive context deps may still reference them until `13-public-api-surface`.
- **No formal audit artifact** — compliance is implied by scattered prior changes but not recorded in `design.md` with a per-use-case matrix.

## Proposed solution

1. **Inventory** every use case wired into `Kernel` (per `core:kernel` entry-mapping table) and its `*Input` type.
2. **Apply the input rule** from the core-refactor doc: no field in `execute()` input may duplicate data available from construction-time `SpecdConfig`, `KernelOptions`, or other values baked at `createKernel` — unless explicitly documented as a runtime override exception.
3. **Classify each input field** as conformant, violation, or documented exception (with rationale).
4. **Fix code** only where violations remain after upstream changes are accounted for; otherwise record no-op outcome.
5. **Update specs** only when gaps are found — codify the input boundary on `core:kernel` and, if needed, clarify the hexagonal "config at composition boundary" rule on `default:_global/architecture`.
6. **Retire ghost skill use cases in kernel spec** — `core:record-skill-install` and `core:get-skills-manifest` are not kernel entries (plugin era obsolete). P1d adds explicit retirement requirements + verify scenarios on `core:kernel` (same pattern as `listPlugins` / config mutation), removes stale change deps, and scrubs `docs/core/` references. Ghost metadata already deleted.

Deliverable: audit matrix in `design.md`; spec/verify deltas only if the audit finds spec-worthy gaps.

## Specs affected

### New specs

(none)

### Modified specs

- `core:kernel`: Add or tighten requirements that kernel use case `execute()` inputs must not re-pass construction-time config (including approval gate flags once baked). Document allowed runtime-override fields. Add explicit retirement of `RecordSkillInstall` / `GetSkillsManifest` from kernel surface (requirements + verify scenarios, same pattern as `listPlugins`). Update entry-mapping notes if audit retires or reclassifies use cases.
  - Depends on (added): none
  - Depends on (removed): none

- `default:_global/architecture`: Clarify that delivery mechanisms obtain config via `createKernel` / `getConfig` and must not thread `SpecdConfig` fields through per-call use case inputs when those values are fixed at kernel construction.
  - Depends on (added): none
  - Depends on (removed): none

## Impact

- **Code (conditional):** `packages/core/src/application/use-cases/*` — only if audit finds violations (likely candidates: `transition-change.ts`, `approve-spec.ts`, `approve-signoff.ts` if `09-core-approval-gates-baked` is not yet merged).
- **Composition:** `packages/core/src/composition/kernel.ts` — constructor wiring if approval flags move to construction time.
- **Hosts (read-only during audit):** CLI/MCP callers that pass `approvalsSpec` / `approvalsSignoff` into transition/approve — flagged in design for follow-up if code changes are required.
- **Specs:** `specs/core/kernel/`, `specs/_global/architecture/` — deltas for input boundary + ghost use case retirement.
- **Docs:** `docs/core/overview.md`, `docs/core/use-cases.md` — remove `RecordSkillInstall` / `GetSkillsManifest` sections in P1d.
- **No new packages, APIs, or data models** unless violations force input-shape changes.

## Technical context

From exploration and graph/code inspection:

- Kernel groups: `changes`, `specs`, `project` — every exported use case under `application/use-cases/` (except `_shared/`) must appear in the entry-mapping table.
- Config mutation (`init`, `addPlugin`, `removePlugin`) already off kernel → `createConfigWriter()`.
- Plugin listing already off kernel → `kernel.project.getConfig().plugins`.
- `GetConfig.execute()` takes no input; returns construction-time `SpecdConfig` snapshot.
- `CompileContextInput` / `GetProjectContextInput`: no `config` field; optional runtime overrides for context compilation behaviour only.
- `TransitionChangeInput` still carries `approvalsSpec` / `approvalsSignoff` in current tree — depends on `09-core-approval-gates-baked` landing first or being fixed here.
- Sequencing: after `03-core-host-orchestration-context`, `05-core-config-list-plugins`, `06-core-config-editing-boundary`; ideally after `09-core-approval-gates-baked`.
- Ghost specs: `core:record-skill-install`, `core:get-skills-manifest` — retired in P1d via `core:kernel` delta + verify + doc scrub; ghost metadata deleted; stale change deps removed.

## Open questions

All resolved. Principle: work owned by a later change stays in that change — P1d audits and specs boundaries only; no duplicate fixes.

1. **Approval-gate baking** — **Resolved.** `approvalsSpec` / `approvalsSignoff` in execute inputs are a known violation until `09-core-approval-gates-baked` lands. This change records them in the audit matrix as out-of-scope for code fix; implementation tasks for approval inputs are gated on `09` archive.

2. **Runtime override whitelist** — **Resolved.** Add a general construction-time vs runtime-caller rule on `core:kernel`, plus a partial table for non-obvious cases (`CompileContext`, `GetProjectContext`, hook skip selectors on `TransitionChange`). Full enumeration of every optional field is not required.

3. **Ghost skill specs** — **Resolved.** Cleanup in P1d while touching `core:kernel`: explicit retirement requirement + verify scenarios, stale `specDependsOn` removed, `docs/core/` scrubbed, ghost metadata deleted. No separate `13` pass needed for these two.
