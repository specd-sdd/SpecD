# Proposal: cli-init-alias

## Motivation

New users discovering specd for the first time naturally try `specd init` to bootstrap a project — this is the conventional command name across most CLI tools. Forcing `specd project init` adds friction at the most critical moment: first use.

## Current behaviour

The `init` command exists only as a subcommand of `project`: `specd project init`. There is no top-level `specd init` alias. Running `specd init` produces a Commander "unknown command" error.

## Proposed solution

Register `init` as a top-level command on the root Commander program, reusing the existing `registerProjectInit()` function. The function already accepts a `parent: Command` parameter, so calling it with the root `program` in addition to the existing `projectCmd` registration makes `specd init` available alongside `specd project init`. Both forms behave identically — same flags, same interactive wizard, same exit codes, same output.

## Specs affected

### New specs

None.

### Modified specs

- `cli:cli/project-init`: Add `specd init` as a documented alias in the "Command signature" requirement, so both invocation forms are part of the spec contract.
  - Depends on (added): none

- `cli:cli/entrypoint`: Document the top-level `init` command in the command tree description, so the entrypoint spec reflects the full set of top-level commands.
  - Depends on (added): none

## Impact

- **`packages/cli/src/index.ts`** — one additional line: `registerProjectInit(program)` after the project command group registration.
- No domain, application, or infrastructure layer changes.
- No breaking changes — `specd project init` continues to work unchanged.
- Low risk: impact analysis on `cli:cli/project-init` returned zero dependents.

## Technical context

- Commander.js allows registering the same `.command('init')` on multiple parent commands without conflict.
- `registerProjectInit(parent: Command)` in `packages/cli/src/commands/project/init.ts:40` is parameterised by parent — no code duplication needed.
- Commander's `.alias()` mechanism was rejected because it only works for alternative names at the same hierarchy level, not cross-hierarchy (top-level vs nested under `project`).

## Open questions

None.
