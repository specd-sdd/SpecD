# Proposal: enrich-project-summary

## Motivation

`project status` is the entry-skill bootstrap surface, but today it only returns
change-bucket counts. Agents still need separate `changes list` / `drafts list`
calls (and have no built-in path to per-change task progress or specs health).
Now that `CountTasks` and `GetSpecsHealth` exist, `GetProjectSummary` can expose
those enrichments behind opt-in flags without slowing the default count-only path.

## Current behaviour

`GetProjectSummary.execute()` returns only:

- `activeCount`, `draftCount`, `discardedCount`, `archivedCount`
- `specsByWorkspace`, `workspaceCount`

It must not materialize change entities or run validation. The SDK
`buildProjectStatusSnapshot` and CLI `project status` forward that lean summary
(plus optional graph health / context). Listing active/draft rows, task
pending/total, and specs health require extra commands outside this path.

## Proposed solution

Extend `GetProjectSummary` with optional input flags:

- `includeChanges` — when true, also return `active` and `drafts` arrays; each
  entry has `name`, `state`, and `tasks: { incomplete, total }` from `CountTasks`
- `includeSpecsHealth` — when true, also return `specsHealth` from `GetSpecsHealth`

With no flags (or both false), behaviour and result shape stay count-only as
today. Discarded and archived remain counts only (no listings).

`buildProjectStatusSnapshot` forwards the enrichment options so non-CLI hosts
can choose. The CLI `project status` command **always** requests both
enrichments and always presents active/draft listings (with tasks) and specs
health — no opt-out CLI flags — because that full picture is what agents need
from the entry bootstrap.

## Specs affected

### New specs

None.

### Modified specs

- `core:get-project-summary`: optional input flags and extended result fields;
  compose list + `CountTasks` + `GetSpecsHealth` only when flags request them;
  preserve count-only default.
  - Depends on (added): `core:get-specs-health`, `core:count-tasks` (list-changes /
    list-drafts already declared)
  - Depends on (removed): none

- `sdk:build-project-status-snapshot`: forward enrichment options into
  `getProjectSummary.execute(...)` and expose enriched fields on the snapshot
  result (still no direct repository bootstrap).
  - Depends on (added): none
  - Depends on (removed): none

- `cli:project-status`: always request and present change listings (with tasks)
  and specs health in text/json/toon output (no CLI opt-in flags for these).
  - Depends on (added): none
  - Depends on (removed): none

- `cli:project-dashboard`: when rendering the visual dashboard, always request
  the same enrichments; show specs health aggregates in the Specs box header
  next to the total count, and one extra line in the Changes box for project
  task progress (`done/total` over active changes). Do not list every
  active/draft row in the dashboard (that remains `project status`).
  - Depends on (added): none (already depends on snapshot / summary path)
  - Depends on (removed): none

## Impact

- Core: `GetProjectSummary` input/result types, constructor/composition deps,
  unit tests; kernel wiring if new dependencies are injected
- SDK: `BuildProjectStatusSnapshotOptions` / `Result`, orchestration tests
- CLI: `project status` presenter always shows enrichments; `project dashboard`
  Specs header + Changes tasks line (option C)
- Overlap: `sdk:build-project-status-snapshot` is also in
  `deprecate-ladybug-store` (designing) — archive may need coordination

## Technical context

- User corrected the target from a non-existent `GetProjectStatus` to
  `GetProjectSummary`.
- Chose evolving Summary with flags over keeping Summary lean and enriching only
  at the SDK layer.
- Use-case enrichment stays opt-in (`includeChanges` / `includeSpecsHealth`) so
  programmatic callers can keep the cheap count-only path; CLI always opts in.
- Tasks shape agreed: `{ incomplete, total }` (pending = incomplete), not the
  full `byArtifact` map.
- Creation waited on archived `refactor-task-completion` so `core:count-tasks`
  is available on mainline.
- Spec overlap on the SDK snapshot with `deprecate-ladybug-store` was accepted
  for this change.
- **CLI decision (user):** even though the use case admits options, `project
status` always shows listings + specs health — useful for the agent; no CLI
  flags to toggle those enrichments.
- **Result shape when flags off (user):** enriched keys are **absent** (TypeScript
  optional / omitted), not `null`. Empty arrays are only used when a flag is on
  and there are zero matching changes.
- **Dashboard (user, option C):** Specs box header next to total shows health
  aggregates (e.g. `246 total · 240✓ 4✗ 2w`); Changes box adds one line for
  task progress over active changes (e.g. `tasks 12/48 done`). No per-change
  listing in the dashboard.
- **`project status` text labels (user):** health counters use words
  `ok` / `failed` / `warning` for agents; dashboard may keep compact glyphs.

## Open questions

None — remaining product questions for this proposal are settled.
