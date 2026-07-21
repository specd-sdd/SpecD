# Design: fix-project-dashboard-snapshot

## Context & Goal

`specd project dashboard` currently computes spec and change metrics using individual kernel calls (`kernel.specs.list`, `kernel.changes.list`, `kernel.changes.listDrafts`, `kernel.changes.listDiscarded`), leading to metric drift compared to `specd project status` (which uses `buildProjectStatusSnapshot`). Additionally, projects with many workspaces overflow the inner and outer `boxen` boundaries in text mode.

This change refactors `specd project dashboard` to consume `buildProjectStatusSnapshot(host, { includeGraph: true })`, delegates non-text formats (`json`/`toon`) directly to `project status`, and updates TUI rendering for multi-line workspace wrapping and full-width layout.

## Affected Areas

- `packages/cli/src/commands/project/dashboard.ts`
- `packages/cli/test/commands/project-dashboard.spec.ts`
- `docs/cli/cli-reference.md`

## Architecture & Data Flow

```
[specd project dashboard]
       │
       ├─── fmt !== 'text' ──► Redirection to [specd project status --format <fmt>]
       │
       └─── fmt === 'text' ──► openSpecdHost + buildProjectStatusSnapshot
                                      │
                                      ▼
                               Render ASCII TUI
                               (Project full-width, Specs, Changes with archived, Graph)
```

## Detailed Design & Changes

### 1. Non-Text Redirection in `dashboard.ts`

When `opts.format !== 'text'`, `registerProjectDashboard` delegates execution to `project status`:

```ts
if (opts.format !== 'text') {
  // Delegate directly to Commander's status command handler or parent execution
  await parent.parseAsync(
    ['status', '--format', opts.format, ...(opts.config ? ['--config', opts.config] : [])],
    { from: 'user' },
  )
  return
}
```

### 2. Data Fetching in `dashboard.ts` (Text Mode)

Fetch snapshot via host and SDK:

```ts
const host = await openSpecdHost({
  ...(opts.config !== undefined ? { configPath: opts.config } : {}),
  options: {
    kernel: buildCliKernelOptions(),
  },
})
const { config } = host
const snapshot = await buildProjectStatusSnapshot(host, { includeGraph: true })
const { summary, graphHealth } = snapshot
```

### 3. Multi-line Workspaces & Path Wrapping

Use `wrapText` for `workspaces:` and `root:` in the `Project` box to wrap cleanly on word/comma boundaries without splitting workspace names mid-word:

```ts
const wsNames = config.workspaces.map((w) => w.name).join(', ')
const wsLabel = 'workspaces: '
const wsIndent = ' '.repeat(wsLabel.length)
const wsValueWidth = PROJECT_BOX_WIDTH - 4 - wsLabel.length
const wsLines = wrapText(wsNames, wsValueWidth)
const wsFirstLine = `${chalk.dim('workspaces:')} ${chalk.white(wsLines[0] ?? '')}`
const wsContinuations = wsLines.slice(1).map((line) => `${wsIndent}${chalk.white(line)}`)
```

### 4. TUI Box Assembly & Layout Alignment

- Calculate `PROJECT_BOX_WIDTH = Math.max(minContentWidth, termCols - 6)` fitting full TTY viewport width.
- Divide side-by-side row into `LEFT_COL_WIDTH` (Specs) and `RIGHT_COL_WIDTH` (Changes) with a 2-space gap.
- Format `Specs` and `Changes` table rows so line lengths match `innerWidth` exactly (`COL_WIDTH - 4`), avoiding 1-character row length overflows that distort vertical borders.
- Equalize content heights between `Specs` and `Changes` using `minLines` padding in `innerBox` so bottom borders align on the exact same row.
- Render `Graph` box showing freshness, `docs:` count (`graphHealth.documentCount`), `files:`, and `symbols:`.
- Assemble all sections in a `boxen` container spanning the full terminal width.

## Testing Strategy

- `packages/cli/test/commands/project-dashboard.spec.ts`:
  - Verify `specd project dashboard --format json` delegates to `status --format json` output.
  - Verify text mode outputs correct total specs (matching `buildProjectStatusSnapshot`).
  - Verify `changes.archived` is included in text mode.
  - Verify `workspaces:` word-boundary wrapping when total workspace length exceeds inner box width.
  - Verify `graph` health information (freshness, docs, files, symbols) is displayed when graph is present.
  - Verify sub-box border alignment and uniform visual character width across all TUI rows.

## Documentation Updates

- Update `docs/cli/cli-reference.md` section for `specd project dashboard` to reflect non-text redirection to `project status` and updated ASCII layout.

## Open Questions

- None
