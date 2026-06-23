# Spec compliance — change `specd-studio`

**Date:** 2026-05-25  
**Scope:** UI-heavy areas + inspector/artifacts (148 specs total; this report focuses on gaps found in active Studio work).

---

## Summary

| Status                              | Count (UI-focused audit) |
| ----------------------------------- | ------------------------ |
| Aligned                             | 12 areas                 |
| Implementation gap                  | 9                        |
| Stub / deferred (spec expects more) | 6                        |
| Design mock ≠ spec (informational)  | 2                        |

**Change state:** `implementing`, tasks 74/74 marked done — compliance drift is expected until verify pass.

---

## Aligned (code matches change specs)

| Spec area                               | Evidence                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ui:shell-layout`                       | Sidebar, tabs, inspector, bottom panel; `useProjectPoll` 2500ms; pauses on `blur`                          |
| `ui:inspector-*` (core flows)           | Raw/Edit, Preview (merged via `spec-preview`), Diff (base vs merged), Save + 409, canonical spec read-only |
| `ui:hooks-inspector-save`               | Wired in `ShellLayout`                                                                                     |
| `ui:change-tab-artifacts`               | Accordion via `useChangeArtifactList` + `/artifacts` endpoint                                              |
| `ui:artifact-editor`                    | `getChangeArtifact`, Monaco, save hook, read-only for spec artifacts                                       |
| `client:specd-data-port` boundary       | No `@specd/core` in `packages/ui`                                                                          |
| `api:dto-preview-result` / preview hook | `files[].merged` / `base`; `deltas/.../spec.md.delta.yaml` specId derivation                               |
| Polling stability                       | `use-async-resource` keeps data on poll; per-hook generation; status `unchanged` preserved                 |
| `ui:bottom-panel-problems` (partial)    | Blockers auto-filled from change status; validate output routed to Problems                                |

---

## Implementation gaps (code likely wrong vs spec)

### 1. Inspector `metadata/schema` mode — **HIGH**

**Spec:** All `ui:inspector-*` require modes: preview, delta edit, full diff, **metadata/schema**, canonical read-only.

**Code:** Modes are `raw | preview | diff | info`. `info` shows filename/hash only — not metadata editor or schema view.

**Fix options:** Add inspector modes `Metadata` / `Schema` (or combined) using spec metadata hooks; or narrow specs if `Info` was intended as v1 stand-in.

---

### 2. Tab-scoped polling — **HIGH**

| Spec                                | Requirement                                              | Code                                                                       |
| ----------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ui:change-tab-artifacts`           | Poll only while Artifacts tab **visible**                | `useChangeArtifactList` runs whenever change is open (`refreshKey` global) |
| `ui:spec-tab-overview` (+ siblings) | Metadata poll only while spec tab **visible**            | `useSpecRead` always loads detail/artifact/context on global poll          |
| `ui:change-tab-tasks`               | Status + `tasks.md` when tab visible + `ifModifiedSince` | Placeholder panel only                                                     |

**Fix:** Gate `refreshKey` / `enabled` on active `changeView` / `specView`; implement Tasks tab loader + conditional refetch on `updatedAt`.

---

### 3. Change tabs Tasks / Events / Impact — **MEDIUM**

**Spec:** Each `ui:change-tab-*` defines real data + tab-scoped poll.

**Code:** `PlaceholderPanel` for Tasks, Events, Impact; Context says "coming soon".

---

### 4. Spec tabs Metadata / Dependencies / Schema / Graph — **MEDIUM**

**Spec:** Dedicated tab behaviour per `ui:spec-tab-*`.

**Code:** `SpecPlaceholder` for Metadata, Dependencies, Schema, Graph.

**Note:** Overview + Artifacts + Context + Linked Changes have real UI.

---

### 5. `ui:artifact-editor` — Validate scope — **LOW–MEDIUM**

**Spec:** Validate for current file / artifact type / whole change per context.

**Code:** Inspector Validate always calls `validateChange(target)` (whole change).

**Note:** API exposes `POST /changes/:name/validate` only — per-file validate may need spec clarification or new route.

---

### 6. `ui:artifact-editor` — Find/replace — **LOW**

**Spec:** Monaco find/replace in-editor.

**Code:** No explicit `find` widget options; default Monaco keybindings may suffice — **verify manually**.

---

### 7. Linked Changes tab semantics — **LOW**

**Spec:** `ui:spec-tab-overview` / linked changes (verify scenarios).

**Code:** `LinkedChangesPanel` lists **all** active + drafts, not changes linked to the open spec.

---

### 8. Command palette / New Change — **LOW**

**Code:** "coming soon" stubs in `ShellLayout` — check `ui:command-palette` spec for required actions.

---

## Design mock vs spec catalog (informational)

| Topic                         | Mock / earlier notes  | Change spec                                               |
| ----------------------------- | --------------------- | --------------------------------------------------------- |
| Spec tab **History**          | Shown in design image | Not in `SPEC_VIEWS` — **spec wins** unless delta added    |
| Spec tab label **Code Graph** | Mock                  | Spec uses `Graph` — aligned with `ui:spec-tab-graph` stub |

---

## Recommended fix order

1. Tab-scoped polling (artifacts + spec detail) — small, reduces load; matches multiple verify scenarios.
2. Inspector metadata/schema (or spec amendment if Info is enough for v1).
3. Change tab **Tasks** (highest user value among placeholders).
4. Spec tabs Metadata / Dependencies / Schema / Graph (incremental).
5. Linked Changes filtering + validate scope (after API contract check).

---

## Spec updates (2026-05-25)

Change artifacts under `specd-sdd/changes/20260525-072534-specd-studio/specs/` were updated to match the implementation batch (archived flow, graph `specs[]` DTO, tab-scoped polling, inspector Metadata/Schema, filled change/spec tabs). **No new spec IDs** were added; Linked Changes is documented under `ui:spec-tab-overview`.

## Next step

- Run `specd-verify` on `specd-studio` when ready to confirm scenarios against the running app.
