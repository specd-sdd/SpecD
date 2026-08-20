# Proposal: fix-graph-cli-context-explicit-config

## Motivation

An explicit `--config` is a forced project entrypoint and must work for valid
projects outside VCS. Graph commands currently reject that supported use case
after their shared-context migration.

## Current behaviour

`graph stats --config <path>` delegates to `resolveGraphCliContext`, whose
configured branch resolves a repository root even though the configuration has
already established the project. A non-VCS project therefore fails before its
graph provider is opened. Bootstrap correctly needs repository discovery, but
configured mode does not.

## Proposed solution

Make configured graph context retain VCS information only when it is available,
while keeping a repository root mandatory for `--path` and no-config bootstrap.
All read-only graph commands, including stats, will retain their common
resolver/provider lifecycle.

## Specs affected

### New specs

None.

### Modified specs

- `cli:graph-cli-context`: distinguish forced-config context resolution from
  VCS-required bootstrap resolution.
  - Depends on (added): none.
  - Depends on (removed): none.
- `cli:graph-stats`: guarantee that stats accepts a valid explicit config
  outside VCS through the shared graph context.
  - Depends on (added): none.
  - Depends on (removed): none.

## Impact

The production change is localized to
`packages/cli/src/commands/graph/resolve-graph-cli-context.ts`, with regression
coverage in its graph-command consumers and `graph-stats` tests. The shared
resolver has broad downstream reach, so the fix must not alter bootstrap,
provider-lifecycle, or output behavior.

## Technical context

`core:config` already defines `--config` as an explicit file entrypoint and
separates it from VCS-bounded discovery. VCS-derived graph health may be
unknown when an explicitly configured project has no repository. The related
Ladybug deprecation routes stats through the shared resolver; this fix preserves
that architecture rather than restoring command-specific host bootstrap.

## Open questions

None. The existing configuration contract and bootstrap boundary determine the
scope of this fix.
