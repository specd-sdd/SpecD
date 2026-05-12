# Design: cli-entrypoint-ux

## Non-goals

- Changing the `project init` command's banner rendering behaviour (it will continue to show the banner via its own action handler after the preAction hook is removed).
- Modifying how `--format` works on any command.
- Adding new kernel use-cases or touching business logic in `@specd/core`.
- Changing the `--hide-banner` behaviour in `@specd/mcp` or plugins (it doesn't exist there).

## Affected areas

### `packages/core/src/application/ports/config-loader.ts`

- Add `resolvePath(): Promise<string | null>` to the `ConfigLoader` interface.

### `packages/core/src/infrastructure/fs/config-loader.ts`

- Implement `resolvePath()` on `FsConfigLoader`:
  - **Discovery mode** (`{ startDir }`): delegates to the existing module-level `findConfigFile(startDir)` helper. Returns its result directly (`string | null`). Never throws.
  - **Forced mode** (`{ configPath }`): returns `path.resolve(this._options.configPath)` without checking existence.

### `packages/core/src/composition/config-loader.ts`

- No signature change needed — `createConfigLoader` already returns `ConfigLoader`. Once the interface gains `resolvePath()`, callers can invoke it on the returned instance.

### `packages/cli/src/index.ts`

- Remove `.option('--hide-banner', ...)` from root `program`.
- Add `.option('--config <path>', 'path to specd.yaml (overrides config discovery)')` to root `program`.
- Add `program.addHelpText('before', renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n')` to prepend the banner to `specd --help` output only.
- Rewrite the `preAction` hook:
  - Remove `hideBanner` logic entirely.
  - Remove the banner rendering block.
  - Add root `--config` propagation: if `program.opts().config` is set and `actionCommand.opts().config` is undefined, call `actionCommand.setOptionValue('config', program.opts().config)`.
- Remove banner rendering from the `isInit` / `isOverview` check (both are deleted).
- Update import: `registerProjectOverview` → `registerProjectDashboard`.
- Update registration call: `registerProjectOverview(projectCmd)` → `registerProjectDashboard(projectCmd)`.
- Add no-subcommand dispatch logic (see Approach).

### `packages/cli/src/commands/project/overview.ts` → renamed to `dashboard.ts`

- Rename file: `overview.ts` → `dashboard.ts`.
- Rename exported function: `registerProjectOverview` → `registerProjectDashboard`.
- Change command name from `'overview'` to `'dashboard'` in `.command('dashboard')`.
- Add `renderBanner(...)` call directly inside the action handler, rendered to `process.stdout` before the boxen box (since the preAction hook no longer handles this).
- Add `Using config: <relative-path>` line printed to stdout before the banner.
- Increase `projectSection` inner width from `46` to `56` (current constant).
- Add project root wrap logic: if `config.projectRoot` is longer than the available width, split it across two lines indented to the value column.
- Update boxen title string from `'SpecD project overview'` to `'SpecD project dashboard'`.

### All command registration files (descriptions pass)

Every file under `packages/cli/src/commands/**/*.ts` that calls `.description(...)` needs its description string rewritten to be agent-readable: full sentence, names the specd concept, explains the purpose in context. Files:

- `commands/change/archive.ts`, `approve.ts`, `artifact-instruction.ts`, `artifacts.ts`, `context.ts`, `create.ts`, `deps.ts`, `discard.ts`, `draft.ts`, `edit.ts`, `hook-instruction.ts`, `list.ts`, `run-hooks.ts`, `skip-artifact.ts`, `status.ts`, `transition.ts`, `validate.ts`
- `commands/drafts/list.ts`, `restore.ts`, `show.ts`
- `commands/discarded/list.ts`, `show.ts`
- `commands/archive/list.ts`, `show.ts`
- `commands/spec/context.ts`, `generate-metadata.ts`, `invalidate-metadata.ts`, `list.ts`, `metadata.ts`, `resolve-path.ts`, `show.ts`, `validate.ts`, `write-metadata.ts`
- `commands/project/context.ts`, `init.ts`, `update.ts` (dashboard.ts handled above)
- `commands/config/show.ts`
- `commands/schema/extend.ts`, `fork.ts`, `show.ts`, `validate.ts`
- `commands/skills/install.ts`, `list.ts`, `show.ts`, `update.ts`
- Command group descriptions in `index.ts`: `change`, `drafts`, `discarded`, `archive`, `spec`, `project`, `config`, `schema`, `skills`.

### `packages/cli/src/commands/project/init.ts`

- Import `renderBanner` and `CLI_VERSION`, `CORE_VERSION`.
- Add `renderBanner(...)` call at the start of the action handler (in text mode only) so the banner still shows on `project init` after the preAction hook is removed.

### `docs/cli/cli-reference.md`

- Remove `--hide-banner` from the global options table and the usage line at the top.
- Add `--config <path>` to the global options table (it was previously only documented per-command).
- Rename `### project overview` section to `### project dashboard`.
- Update the command syntax line from `specd project overview` to `specd project dashboard`.
- Add a note about auto-dashboard on bare `specd` invocation.

## New constructs

No new files, classes, or exported types are introduced. All changes are modifications to existing constructs.

## Approach

### 1. Global `--config` and preAction propagation

In `index.ts`:

```ts
const program = new Command('specd')
  .description('...')
  .version(CLI_VERSION)
  .option('--config <path>', 'path to specd.yaml (overrides config discovery)')

program.hook('preAction', (_thisCommand, actionCommand) => {
  // Commander lifts --config to the root program regardless of where it appears
  // in the command line (before or after the subcommand name). Propagate it to
  // the action command so opts.config is visible inside action handlers.
  const rootConfig = program.opts().config as string | undefined
  if (rootConfig !== undefined) {
    actionCommand.setOptionValue('config', rootConfig)
  }
})
```

Commander's `setOptionValue(key, value)` injects a value into the parsed options of a command instance, making it visible to the action handler via `opts.config`. This works because `preAction` fires before the action callback runs.

**Commander option scoping with same-name options:** When the root program and a subcommand both declare `--config`, Commander parses any `--config <path>` occurrence as the root-level option regardless of position in the command line. This means:

- `specd --config p1 change list` → root.config = `p1`, action sees `p1` via propagation
- `specd change list --config p2` → root.config = `p2`, action sees `p2` via propagation
- `specd --config p1 change list --config p2` → last wins: root.config = `p2`, action sees `p2`

The double-config case silently resolves (last value wins), consistent with standard CLI option override semantics.

Covers spec requirements: "Config flag override" (global + local positions), "Auto-show dashboard" (bare invocation with `--config`).

### 2. Remove `--hide-banner` and add banner to help

Remove `.option('--hide-banner', ...)` from the root program. Remove the entire `hideBanner` / banner rendering block from `preAction`.

Add:

```ts
program.addHelpText(
  'before',
  renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n',
)
```

This prepends the banner only to `specd --help`, not to subcommand help pages, satisfying the "Banner in help" requirement. The banner for `project dashboard` and `project init` is now rendered inside those commands' own action handlers.

### 3. Auto-show dashboard on bare invocation

Set a default action on `program` via `program.action(async () => { ... })` — Commander fires this only when `specd` is invoked with no recognised subcommand.

The dispatch logic differs based on whether `--config` was provided:

- **`configPath` is defined** (user passed `--config <path>`): dispatch directly to `project dashboard` without any pre-check. The dashboard's `resolveCliContext` will load and validate the file exactly once; if it fails, the normal `error:` message is shown. Silencing that error would be wrong — the user explicitly provided a path and expects feedback.

- **`configPath` is undefined**: do a lightweight existence probe — walk up from `process.cwd()` looking for `specd.yaml` using `fs.stat`, **without parsing it**. This probe's sole purpose is deciding "help vs dashboard"; it does not load or validate YAML. If no file is found → show help. If found → dispatch to dashboard, which loads the config once.

```ts
program.action(async () => {
  const configPath = program.opts().config as string | undefined
  const dashboardArgs = ['node', 'specd', 'project', 'dashboard']
  if (configPath !== undefined) {
    // Explicit path — dispatch directly; dashboard handles any load error
    dashboardArgs.push('--config', configPath)
    await program.parseAsync(dashboardArgs, { from: 'user' })
    return
  }
  // No explicit path — probe for specd.yaml existence via ConfigLoader.resolvePath()
  // This reuses the exact same discovery logic as load() (git root, specd.local.yaml,
  // walk bounded by VCS root) without parsing YAML or throwing on not-found.
  const loader = createConfigLoader({ startDir: process.cwd() })
  const found = await loader.resolvePath()
  if (found === null) {
    program.help()
    return
  }
  await program.parseAsync(dashboardArgs, { from: 'user' })
})
```

`createConfigLoader` is already imported in `load-config.ts`; the CLI imports it from there. No new imports are needed beyond what already exists.

### 4. Rename project overview → dashboard

- Rename `overview.ts` → `dashboard.ts`.
- Rename `registerProjectOverview` → `registerProjectDashboard`.
- Change `.command('overview')` → `.command('dashboard')`.
- Move banner rendering into the action handler (before the boxen output, text mode only).
- Update `index.ts` import and registration.

### 5. Dashboard: "Using config:" line and wider layout

Before rendering the banner and box in `dashboard.ts`:

```ts
const configFilePath = opts.config ?? path.join(config.projectRoot, 'specd.yaml')
const relConfigPath = path.relative(process.cwd(), configFilePath)
process.stdout.write(`Using config: ${relConfigPath}\n`)
```

For the wider project box, change the inner width from `46` to `56`. Also add wrap logic for `root:`:

```ts
const ROOT_LABEL = 'root:    '
const ROOT_INDENT = ' '.repeat(ROOT_LABEL.length)
const VALUE_WIDTH = 56 - 1 - ROOT_LABEL.length // available chars for value
const rootValue = config.projectRoot
const rootLines = wrapText(rootValue, VALUE_WIDTH, ROOT_INDENT)
const rootLine = `${chalk.dim('root:')}    ${chalk.white(rootLines[0])}`
const rootContinuations = rootLines
  .slice(1)
  .map((l) => ' '.repeat(ROOT_LABEL.length) + chalk.white(l))
```

Where `wrapText(text, maxWidth, indent)` is a local helper that splits `text` into segments of at most `maxWidth` characters. This satisfies the project root wrap requirement.

### 6. Improve command descriptions

Rewrite every `.description(...)` call to follow this pattern:

- Capitalised full sentence.
- Names the specd concept (change, spec, artifact, etc.).
- States what the command does and what it returns or affects.
- Avoids filler like "Manage" or "Show" without context.

Example rewrites:

- `'Manage changes'` → `'Commands for creating, listing, and progressing changes through the specd lifecycle.'`
- `'Show the status of a change'` → `'Display the current state, artifact statuses, lifecycle transitions, and blockers for a named change.'`
- `'Show a visual dashboard of the project status'` → `'Display a project-level dashboard showing schema, workspaces, spec counts, and change activity. Runs automatically when specd is invoked with no subcommand.'`

All ~45 command files need updated descriptions. The exact wording will be decided during implementation.

## Key decisions

**Using `program.action()` for auto-dashboard instead of argument inspection** → Commander's `program.action()` is the intended hook for default behaviour, fires only when no subcommand matches, and requires no argument parsing. **Alternatives rejected**: inspecting `process.argv` manually is fragile against flag ordering; using `parseAsync` twice risks double-parsing state.

**`setOptionValue` for preAction propagation** → Commander exposes `setOptionValue()` on `Command` instances; it's the documented way to inject parsed option values. **Alternatives rejected**: env variables are a side channel and pollute the environment; reading `program.opts()` from inside each handler requires threading `program` through to 44 files.

**Rendering banner inside `dashboard.ts` action handler rather than preAction** → Removing the `isOverview` check from preAction and placing `renderBanner()` directly in the action handler keeps the command self-contained and removes the hidden coupling between `index.ts` and specific command names. **Alternatives rejected**: keeping a `preAction` banner path would require `--hide-banner` or some equivalent to remain.

**Increasing project box inner width to 56** → The current `46` causes overflow for typical project roots (~50 chars). 56 gives comfortable headroom while keeping the overall boxen box at a reasonable terminal width. The outer boxen box width is determined automatically by its content width.

## Trade-offs

- [~45 description rewrites are mechanical but high-volume] → Implement in a single focused pass during the descriptions task; changes are purely additive strings with no logic impact.
- [Auto-dashboard via `program.action()` re-parses argv] → The `loadConfig` call is cheap (file stat + YAML parse); the cost is negligible for a CLI tool.
- [Removing `--hide-banner` is a breaking change for any scripts that use it] → The flag was undocumented in most contexts and only suppressed the banner for `project init` and `project overview`; the risk is minimal.

## Migration / Rollback

No data model or storage changes. Rollback is a code revert. No migration steps.

## Testing

### Automated tests

No existing tests for `index.ts` entrypoint behaviour. The following new test files should be added:

- `packages/cli/test/commands/project/dashboard.spec.ts` — unit tests for the renamed command:
  - "Using config:" line appears before banner in text output.
  - Project root wraps when it exceeds inner box width.
  - JSON output contains no config line, banner, or box characters.
  - Command name is `dashboard` not `overview`.

- `packages/cli/test/entrypoint.spec.ts` (new):
  - `--config` at root position propagates to subcommand via `setOptionValue`.
  - `--config` at subcommand position still works.
  - When both root and subcommand `--config` are set, subcommand wins.
  - `specd --help` includes banner text before Commander output.
  - Subcommand `--help` does not include banner text.

### Manual / E2E verification

```bash
# Build first
pnpm -F @specd/cli build

# 1. Global --config before subcommand
node packages/cli/dist/index.js --config specd.yaml change list
# Expected: lists changes normally

# 2. specd --config path with no subcommand → shows dashboard
node packages/cli/dist/index.js --config specd.yaml
# Expected: dashboard output with "Using config: specd.yaml" at top

# 3. Bare specd in project dir → shows dashboard
node packages/cli/dist/index.js
# Expected: dashboard (config discovered from CWD)

# 4. specd --help includes banner
node packages/cli/dist/index.js --help
# Expected: ASCII art banner before "Usage: specd ..."

# 5. specd change --help does NOT include banner
node packages/cli/dist/index.js change --help
# Expected: no ASCII art, just Commander help

# 6. project dashboard shows "Using config:" and wider box
node packages/cli/dist/index.js project dashboard
# Expected: "Using config: specd.yaml" (or relative path), banner, wider box

# 7. --hide-banner is gone
node packages/cli/dist/index.js --hide-banner change list
# Expected: error: unknown option '--hide-banner'

# 8. project overview is gone
node packages/cli/dist/index.js project overview
# Expected: error: unknown command 'overview'
```

### Docs

`docs/cli/cli-reference.md` must be updated as described in Affected areas. The global options table and `project overview` section are the primary touchpoints.
