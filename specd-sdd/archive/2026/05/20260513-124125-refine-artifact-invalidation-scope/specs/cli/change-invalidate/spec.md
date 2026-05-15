# Change Invalidate

## Purpose

Users need an explicit CLI command to reopen a change for semantic review without pretending that every invalidation is physical drift. The command must make the lifecycle consequence obvious, validate targeting and policy combinations before mutating anything, and clearly report the final affected artifact/file set.

This spec defines `specd changes invalidate <name>` as the manual invalidation surface. It covers command arguments, policy-dependent targeting rules, approval guards, and reporting.

## Requirements

### Requirement: Command signature

The canonical command is:

```text
specd changes invalidate <name> --reason <text> [--policy <policy>] [--target <target> ...] [--force]
```

Where:

- `<name>` is the required change name
- `--reason <text>` is mandatory
- `--policy <policy>` is optional and overrides the change's persisted `invalidationPolicy` for this execution only
- `--target <target>` is optional or required depending on the effective policy and MAY be repeated
- `--force` confirms invalidation when active approval or signoff would be removed

### Requirement: Effective policy resolution

The command MUST first resolve the effective invalidation policy:

- explicit `--policy`, when present
- otherwise the change's persisted `invalidationPolicy`

The command MUST use that effective policy for all later validation and execution behavior.

### Requirement: Target syntax

`--target` is the only targeting surface.

Supported forms:

- `<artifactId>`
- `<artifactId>@<specId>`

Semantics:

- `<artifactId>` targets the whole artifact
- for `scope: spec` artifacts, `<artifactId>` means all files for that artifact across specs in the change
- `<artifactId>@<specId>` targets a single file of a `scope: spec` artifact
- `<artifactId>@<specId>` against a `scope: change` artifact is invalid

### Requirement: Policy-dependent target requirements

After resolving the effective policy:

- `surgical` and `downstream` REQUIRE at least one `--target`
- `none` and `global` MUST reject any `--target`

The command MUST validate these rules before any mutation or approval confirmation.

### Requirement: Target normalization and validation

When targets are permitted, the command MUST:

1. Normalize all requested targets
2. Validate all of them against artifact scope and change membership
3. Deduplicate the normalized target set
4. Fail atomically if any target is invalid

Validation errors MUST accumulate across the full requested set and report every invalid target combination found.

### Requirement: Approval guard

If the change currently has an active spec approval or signoff, the command MUST stop by default and require `--force`.

Without `--force`, no mutation occurs.

The warning MUST state that:

- the change will return to `designing`
- the active approval/signoff will be invalidated

This guard applies even when the effective policy is `none`.

### Requirement: Change-level invalidation

Once validation and approval guards pass, the command always invalidates the change and returns it to `designing`.

The effective invalidation policy controls only artifact/file-state consequences, not whether the change itself is invalidated.

### Requirement: `none` semantics

When the effective policy is `none`, the command invalidates the change but performs no artifact/file-state invalidation.

The command output MUST say explicitly that:

- the change was invalidated and returned to `designing`
- no artifacts were invalidated because the effective policy is `none`

### Requirement: Reporting

The command MUST report:

- the effective invalidation policy
- the final affected artifact/file set after normalization, deduplication, and policy expansion

The final affected set MUST:

- list each artifact/file at most once
- be grouped by artifact
- be emitted in linear DAG-forest traversal order:
  - exhaust one root branch first
  - then continue with the next remaining root
  - never re-list entries already shown through a previous branch

When an entry appears because of downstream/global expansion rather than direct targeting, the output MUST label that fact clearly.

### Requirement: Error handling

The command exits with code `1` for invalid user/domain input, including:

- missing required `--reason`
- missing `--target` for effective `surgical` or `downstream`
- forbidden `--target` for effective `none` or `global`
- malformed or scope-incompatible targets
- missing `--force` when approvals/signoff are active

## Constraints

- The command MUST NOT expose `artifact-drift` as a manual cause.
- The command is a CLI adapter over the manual invalidation use case; it MUST NOT re-implement policy semantics independently.
- The command MUST report the final affected set, not the raw pre-normalized user input.

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — CLI discovery, formatting, and exit-code conventions.
- [`core:invalidate-change`](../../core/invalidate-change/spec.md) — authoritative manual invalidation behavior.
- [`core:get-status`](../../core/get-status/spec.md) — status/reporting conventions that the CLI output must remain compatible with.
- [`default:_global/docs`](../../_global/docs/spec.md) — user-facing command documentation conventions.
