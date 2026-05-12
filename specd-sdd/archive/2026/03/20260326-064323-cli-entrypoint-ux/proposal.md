# Proposal: cli-entrypoint-ux

## Motivation

The CLI entrypoint has accumulated inconsistencies that hurt both human and LLM consumers: `--config` is not recognised at the root level, `--hide-banner` clutters every command despite only affecting one, command descriptions are terse and agent-unfriendly, and the `project overview` command is buried rather than surfaced as the natural landing page for a project. This change addresses all of these in one cohesive UX pass.

## Current behaviour

- `specd --config /path/to/specd.yaml change list` fails with "unknown option '--config'" because `--config` is defined per-subcommand but not on the root program. Running `specd` or `specd --config /path` without a subcommand also rejects the flag.
- `--hide-banner` is defined on the root program and accepted everywhere, but the banner only renders for `project overview` — the flag is misleading and pollutes every command's help output.
- Running `specd` with no subcommand (and a valid config present) shows generic help rather than a useful project dashboard.
- `project overview` is named as a subcommand of `project` but acts more like a top-level dashboard; its name doesn't communicate that intent.
- Every command description is written for humans only — terse, lowercase, no context about what the command does in the specd workflow. LLMs parsing `--help` get little signal.
- The project dashboard box is too narrow: the `Project root` field overflows.

## Proposed solution

1. **Global `--config`**: add `--config <path>` to the root `program` in `index.ts`. Use Commander's `preAction` hook to propagate the root value to subcommands that don't supply their own, so both `specd --config path change list` and `specd change list --config path` work.
2. **Remove `--hide-banner`**: delete it from the root program and all help text. The banner is rendered only inside `project dashboard`; no flag is needed.
3. **Banner in help**: render the specd ASCII banner as part of the root `--help` output using Commander's `addHelpText('before', ...)`.
4. **Improve all descriptions**: rewrite every command and subgroup description to be agent-readable — full sentence, explains purpose, names the specd concept it operates on.
5. **Rename `project overview` → `project dashboard`**: rename the CLI command, the register function, the spec file path (new spec location `cli/project-dashboard`), and all references.
6. **Auto-show dashboard**: when `specd` is invoked with no subcommand (or with only `--config <path>`), attempt config discovery. If a config is found, run the dashboard directly instead of showing generic help.
7. **Dashboard header line**: render `Using config: <relative-path-to-specd.yaml>` above the dashboard box.
8. **Wider dashboard**: increase minimum box width by 10 characters; wrap `Project root` value to a second line (indented to the value column) when it would overflow.

## Specs affected

### New specs

_(none — all changes fall within existing spec boundaries)_

### Modified specs

- `cli:cli/entrypoint`: add requirement for global `--config` flag on root program propagated via `preAction`; add requirement for banner in help output; remove `--hide-banner` requirement; add requirement for auto-dashboard on bare invocation when config is present.
- `cli:cli/project-overview`: rename spec to `cli/project-dashboard`; add `Using config:` header requirement; add wider layout and `Project root` wrap requirement; update command name throughout.

## Impact

- `packages/cli/src/index.ts` — add `--config` option to root program, add `preAction` propagation, remove `--hide-banner`, add `addHelpText` for banner, add no-subcommand detection and dashboard dispatch.
- `packages/cli/src/commands/project/overview.ts` → renamed to `dashboard.ts`; update command name, register function, and rendering logic.
- `packages/cli/src/index.ts` — update import and registration call for the renamed command.
- All `register*` command files — rewrite `.description(...)` strings for agent readability.
- `specs/cli/project-overview/` → `specs/cli/project-dashboard/` (spec rename via delta mechanism in this change).
- `docs/cli/cli-reference.md` — update command name and flag documentation.

## Open questions

_(none — scope is fully defined)_
