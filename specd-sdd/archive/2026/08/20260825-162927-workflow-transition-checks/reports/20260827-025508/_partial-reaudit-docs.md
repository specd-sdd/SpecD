# Re-audit: docs / tests (read-only) — 20260827-025508

Question: are previous findings still true after docs/test fixes? No code modified.

CLI used: `node packages/cli/dist/index.js`

---

## 1. MAJOR DOC-1 — archive section omitted `stream: change-archive` / NDJSON complete

**CLOSED**

`docs/cli/cli-reference.md` ### change archive now documents the check-progress bus and NDJSON terminal event.

Evidence:

> When archive checks and hooks run, `change archive` uses the generic check-progress bus (`stream: "change-archive"`), not the `run-hooks` `hook-progress` stream and not `change-transition`:

> In `json` and `toon`, all machine-readable output is emitted on `stdout` as a newline-delimited stream of structured records with `stream: "change-archive"` (`check-start` / `check-progress` / `check-done`, then a terminal `complete` event whose `result` includes `result: "ok"`, `name`, `archivePath`, and `invalidatedChanges`).

Grep `docs/cli/cli-reference.md` for `change-archive`: hits at the archive section and the run-hooks contrast (`change archive` (`change-archive`)).

Tests (`packages/cli/test/commands/change-archive.spec.ts`): NDJSON/`check-start` present.

- `expect(parsed.stream).toBe('change-archive')`
- `it('JSON output streams check-progress then complete on change-archive'…)` with `onProgress?.({ type: 'check-start', …})` and `expect(lines.map((row) => row.event.type)).toEqual(['check-start', 'check-done', 'complete'])`

---

## 2. MINOR — `drafted` / `isDrafted` missing from cli-reference and Commander help

**PARTIAL — docs CLOSED; running Commander help still OPEN (MINOR)**

cli-reference **matches**. `### change status` documents drafted text and `isDrafted`.

Evidence:

> Drafted changes are read-only. Text mode marks the state as `(drafted)` and prints `transitions: (none — change is drafted)`. JSON/TOON include `isDrafted: true`, empty `availableTransitions`, and `nextAction.command: null`.

Grep `docs/cli/cli-reference.md` for `isDrafted`: one hit (line above).

Commander help from **dist** (`node packages/cli/dist/index.js changes status --help`) still omits `isDrafted` / drafted. The printed JSON schema starts:

> `{ name: string; state: string; specIds: string[] … }`

No `isDrafted` field. Grep of `packages/cli/dist` for `isDrafted`: no matches.

Source already has the field (`packages/cli/src/commands/change/status.ts` help text: `isDrafted?: boolean`). Dist is stale relative to source. Finding remains true for the CLI the audit was told to run.

---

## 3. MINOR — `docs/guide/workflow.md` Hooks JSON on stderr

**CLOSED**

Current Hooks section: JSON/TOON progress is **stdout** NDJSON; **stderr** is text-mode / diagnostics only.

Evidence:

> In `json` and `toon`, in-flight check/hook progress is emitted on **stdout** as NDJSON (`stream: "change-transition"` for `change transition`, `stream: "change-archive"` for `change archive`, `stream: "hook-progress"` for `change run-hooks`).

> `stderr` is reserved for text-mode progress, the transition Repair Guide, and non-structured diagnostics.

---

## 4. MINOR — run-hooks “shares the same live hook-progress presentation” / colliding stream names

**CLOSED**

`### change run-hooks` now states distinct public JSON streams.

Evidence:

> `change run-hooks` keeps a **distinct** public JSON stream (`hook-progress` / terminal `run-hooks`). It does not share a stream name with `change transition` (`change-transition`) or `change archive` (`change-archive`).

> Hook progress uses `stream: "hook-progress"`, and the final result is emitted as a terminal `stream: "run-hooks"` record with `event.type: "complete"`.

---

## 5. MAJOR — workspace `specs/core/config` Approvals pending hops vs merged change

**STILL OPEN** — MAJOR (expected until archive; preview is the source of truth for this change)

Command: `node packages/cli/dist/index.js changes spec-preview workflow-transition-checks core:config --format text`

Merged preview **in-place gates** (no pending hops for new work):

> **`spec`** — when `true`, a change in `ready` cannot take any **forward** leave of `ready` (`approval.spec` is `from=ready`, `to=*`, `along=forward`) until `ApproveSpec` records consent. The change stays in `ready`. … New work MUST NOT enter `pending-spec-approval` via `change transition`.

> **`signoff`** — … The change stays in `done`. … New work MUST NOT enter `pending-signoff` via `change transition`.

Preview also links: `approvals.spec` / `approvals.signoff` are in-place checks, not pending hops.

Workspace file `specs/core/config/spec.md` **still pending hops**:

> **`spec`** — when `true`, a change in `ready` state cannot transition directly to `implementing`. It must first enter `pending-spec-approval` and receive an explicit approval … before transitioning to `spec-approved` and then to `implementing`.

> **`signoff`** — … It must enter `pending-signoff`, receive explicit sign-off, and transition through `signed-off → archivable`.

Confirm: merged preview matches in-place gates; workspace file lags until archive.

---

**Re-audit majors remaining: 1**

1. Workspace `specs/core/config` Approvals still describe pending hops; merged `spec-preview` for `workflow-transition-checks` / `core:config` describes in-place gates (lags until archive).
