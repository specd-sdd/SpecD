# Tasks: cli-entrypoint-ux

## 1. Add `resolvePath()` to `ConfigLoader` (core)

- [x] 1.1 Add `resolvePath()` to the `ConfigLoader` port interface
      `packages/core/src/application/ports/config-loader.ts`: `ConfigLoader` interface — add `resolvePath(): Promise<string | null>` with JSDoc explaining the two modes and never-throws contract
      Approach: append the method signature after `load()`; update the interface JSDoc to describe both methods
      (Req: Path probe)

- [x] 1.2 Implement `resolvePath()` on `FsConfigLoader`
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader` class — add public `async resolvePath(): Promise<string | null>` method
      Approach: discovery mode (`'startDir' in this._options`) → call `findConfigFile(this._options.startDir)` and return the result (already `string | null`, never throws); forced mode → return `path.resolve(this._options.configPath)` without existence check
      (Req: Path probe)

- [x] 1.3 Add tests for `resolvePath()`
      `packages/core/test/infrastructure/fs/config-loader.spec.ts` (existing file) — add describe block `resolvePath()`
      Approach: discovery found → returns path; discovery not found → returns null, no throw; local file preferred over main; forced mode → returns resolved path even when file absent, no throw

## 2. Global `--config` and preAction propagation

- [x] 2.1 Add `--config` global option to root program
      `packages/cli/src/index.ts`: `program` — add `.option('--config <path>', 'path to specd.yaml (overrides config discovery)')` in the program declaration
      Approach: chain after the version option (where `--hide-banner` was); the option is parsed at root level by Commander before subcommands dispatch
      (Req: Config flag override)

- [x] 2.2 Propagate root `--config` to subcommands via preAction
      `packages/cli/src/index.ts`: `program.hook('preAction', ...)` — read `program.opts().config` as `string | undefined`; if defined → call `actionCommand.setOptionValue('config', rootConfig)`. Commander lifts any `--config` occurrence to root regardless of position in the command line, so `actionCommand.opts().config` is always `undefined` before propagation. When two `--config` values are given, Commander's last-value-wins semantics apply.
      Approach: use `as string | undefined` cast; `setOptionValue` is a Commander `Command` method; fires before the action callback runs
      (Req: Config flag override)

## 3. Remove `--hide-banner` and update banner rendering

- [x] 3.1 Remove `--hide-banner` from root program and preAction
      `packages/cli/src/index.ts`: `program` + `preAction` hook — remove `.option('--hide-banner', ...)` from the chain; remove `hideBanner`, `isInit`, `isOverview`, `showBanner` variables and the `process.stdout.write(renderBanner(...))` block from `preAction`
      Approach: after removal, `preAction` only contains the `--config` propagation from task 2.2

- [x] 3.2 Add banner to `specd --help` via `addHelpText`
      `packages/cli/src/index.ts`: `program` — call `program.addHelpText('before', renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n')` after the program is declared
      Approach: `addHelpText('before', text)` prepends only to root `--help`, not subcommand help pages
      (Req: Banner in help)

- [x] 3.3 Add banner rendering inside `project init` action handler
      `packages/cli/src/commands/project/init.ts`: action handler — import `renderBanner` from `../../banner.js` and `CLI_VERSION`, `CORE_VERSION` from `../../version.js`; at the start of the action in text mode, write `process.stdout.write(renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n')`
      Approach: guard with `(opts.format ?? 'text') === 'text'`; preserves existing banner-on-init behaviour independently of the removed preAction hook

## 4. Rename `project overview` → `project dashboard`

- [x] 4.1 Rename overview.ts to dashboard.ts
      `packages/cli/src/commands/project/overview.ts` → `packages/cli/src/commands/project/dashboard.ts`
      Approach: `git mv packages/cli/src/commands/project/overview.ts packages/cli/src/commands/project/dashboard.ts`

- [x] 4.2 Rename register function and command name inside dashboard.ts
      `packages/cli/src/commands/project/dashboard.ts`: `registerProjectOverview` → `registerProjectDashboard`; `.command('overview')` → `.command('dashboard')`
      Approach: rename exported function and Commander command string; leave other logic intact for now

- [x] 4.3 Update index.ts import and registration
      `packages/cli/src/index.ts`: change import from `./commands/project/overview.js` → `./commands/project/dashboard.js`; change `registerProjectOverview(projectCmd)` → `registerProjectDashboard(projectCmd)`

## 5. Auto-show dashboard on bare invocation

- [x] 5.1 Add default action to root program for no-subcommand dispatch
      `packages/cli/src/index.ts`: after all subcommands are registered, before `program.parseAsync(...)` — add `program.action(async () => { ... })`
      Approach: (a) if `configPath` is defined → push `--config configPath` to dashboardArgs, call `program.parseAsync(dashboardArgs, { from: 'user' })` directly (dashboard handles any load error, do NOT pre-check); (b) if `configPath` is undefined → call `createConfigLoader({ startDir: process.cwd() }).resolvePath()`; if `null` → `program.help()`; else → `program.parseAsync(dashboardArgs, { from: 'user' })`. Import `createConfigLoader` from `@specd/core`.
      (Req: Auto-show dashboard)

## 6. Dashboard: "Using config:" line, banner, and wider layout

- [x] 6.1 Add "Using config:" header line
      `packages/cli/src/commands/project/dashboard.ts`: text-mode action handler, before banner — compute `const configFilePath = opts.config ?? path.join(config.projectRoot, 'specd.yaml')` and `const relConfigPath = path.relative(process.cwd(), configFilePath)`; write `process.stdout.write('Using config: ' + relConfigPath + '\n')`
      Approach: guard with `fmt === 'text'`; add `import path from 'node:path'` if not present
      (Req: Text dashboard — config line)

- [x] 6.2 Move banner rendering into dashboard action handler
      `packages/cli/src/commands/project/dashboard.ts`: text-mode action handler, after "Using config:" line — add `process.stdout.write(renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n')`
      Approach: import `renderBanner` from `../../banner.js` and `CLI_VERSION`, `CORE_VERSION` from `../../version.js`; text mode only
      (Req: Text dashboard — banner)

- [x] 6.3 Increase project box inner width and add project root wrap
      `packages/cli/src/commands/project/dashboard.ts`: `projectSection` construction — change inner width from `46` to `56`; wrap `config.projectRoot` when it exceeds available value width
      Approach: `ROOT_LABEL_WIDTH = 'root:    '.length` (9 chars); available = `56 - 1 - ROOT_LABEL_WIDTH`; if root value longer, split: first chunk on label row, remainder on next line padded with `' '.repeat(ROOT_LABEL_WIDTH)`; push both to `projectLines`
      (Req: Text dashboard — wider box, project root wrap)

- [x] 6.4 Update boxen title to "project dashboard"
      `packages/cli/src/commands/project/dashboard.ts`: `boxen(body, { title: ... })` — change `chalk.dim(' project overview')` to `chalk.dim(' project dashboard')`

## 7. Improve command descriptions

- [x] 7.1 Rewrite root command group descriptions
      `packages/cli/src/index.ts`: `.description(...)` on `changeCmd`, `draftsCmd`, `discardedCmd`, `archiveCmd`, `specCmd`, `projectCmd`, `configCmd`, `schemaCmd`, `skillsCmd`
      Approach: full sentence, names the specd concept, explains purpose in workflow context

- [x] 7.2 Rewrite `change` subcommand descriptions
      Files: `commands/change/archive.ts`, `approve.ts`, `artifact-instruction.ts`, `artifacts.ts`, `context.ts`, `create.ts`, `deps.ts`, `discard.ts`, `draft.ts`, `edit.ts`, `hook-instruction.ts`, `list.ts`, `run-hooks.ts`, `skip-artifact.ts`, `status.ts`, `transition.ts`, `validate.ts`
      Approach: capitalised full sentence naming the change lifecycle concept

- [x] 7.3 Rewrite `drafts`, `discarded`, `archive` subcommand descriptions
      Files: `commands/drafts/list.ts`, `restore.ts`, `show.ts`, `commands/discarded/list.ts`, `show.ts`, `commands/archive/list.ts`, `show.ts`

- [x] 7.4 Rewrite `spec` subcommand descriptions
      Files: `commands/spec/context.ts`, `generate-metadata.ts`, `invalidate-metadata.ts`, `list.ts`, `metadata.ts`, `resolve-path.ts`, `show.ts`, `validate.ts`, `write-metadata.ts`

- [x] 7.5 Rewrite `project`, `config`, `schema`, `skills` subcommand descriptions
      Files: `commands/project/context.ts`, `init.ts`, `update.ts`, `commands/config/show.ts`, `commands/schema/extend.ts`, `fork.ts`, `show.ts`, `validate.ts`, `commands/skills/install.ts`, `list.ts`, `show.ts`, `update.ts`

- [x] 7.6 Rewrite `project dashboard` description
      `packages/cli/src/commands/project/dashboard.ts`: `.description(...)` — "Display a project-level dashboard showing schema, workspaces, spec counts, and change activity. Runs automatically when specd is invoked with no subcommand and a config is present."
      (Req: Command signature)

## 8. Documentation

- [x] 8.1 Update `docs/cli/cli-reference.md`
      `docs/cli/cli-reference.md`: global options table, usage line, `### project overview` section
      Approach: (a) remove `--hide-banner` from global options table and usage line; (b) add `--config <path>` to global options; (c) rename section to `### project dashboard`; (d) update command syntax; (e) note auto-dashboard behaviour

## 9. Tests

- [x] 9.1 Add unit tests for `project dashboard` command
      `packages/cli/test/commands/project/dashboard.spec.ts` (new file)
      Approach: text output starts with `Using config:` line; project root wraps when longer than available width; JSON output has no config line, no box characters, no ANSI codes; command name is `dashboard`

- [x] 9.2 Add entrypoint tests
      `packages/cli/test/entrypoint.spec.ts` (new file)
      Approach: `--config` at root propagates via preAction; `--config` at subcommand still works; specifying `--config` in both positions exits 1 with "specified twice" message; `specd --help` contains banner; subcommand `--help` does not
