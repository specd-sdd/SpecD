# Change Create

## Purpose

Users need a way to start tracking a new unit of spec work before any artifacts exist. `specd change create <name> [--spec <id>...]` creates a new change and persists it to the repository, optionally scoping it to one or more specs upfront.

## Requirements

### Requirement: Command signature

```
specd change create <name> [--spec <id>...] [--format text|json|toon]
```

- `<name>` — required positional; the unique slug name for the new change (e.g. `add-auth-flow`)
- `--spec <id>` — optional repeatable flag; one or more spec IDs being created or modified. Each `<id>` is `[<workspace>:]<capability-path>` — the workspace qualifier is optional and defaults to `default` when omitted (e.g. `--spec auth/login` means `default:auth/login`, `--spec billing/invoices` with an explicit workspace would be `--spec billing-ws:billing/invoices`). When omitted, the change is created with an empty specIds list — specs can be added later via `change edit`.
- `--description <text>` — optional; a short free-text description of the change's purpose, stored in the manifest
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Workspace resolution

The workspace IDs for the new change are derived from the workspace prefix of each `--spec` value. If the workspace prefix is omitted, `default` is used. If a named workspace is not declared in `specd.yaml`, the command fails with exit code 1 and prints an `error:` message to stderr.

### Requirement: ReadOnly workspace rejection

After resolving the workspace for each `--spec` value, the CLI MUST check the workspace's `ownership` from `SpecdConfig`. If any spec's workspace has `readOnly` ownership, the command MUST exit with code 1 and print an error message to stderr:

```text
error: Cannot add spec "<specId>" to change — workspace "<workspace>" is readOnly.

ReadOnly workspaces are protected: their specs and code cannot be modified by changes.
```

This check MUST occur before invoking the `CreateChange` use case. If multiple specs target readOnly workspaces, one error per spec MUST be printed. The error message MUST NOT suggest remediation steps.

### Requirement: Schema name and version

`schemaName` and `schemaVersion` are resolved from the active `SpecdConfig` at command time and passed to the `CreateChange` use case. The user does not specify these values.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:
- `json` or `toon`: outputs the following to stdout (encoded in the respective format): The `changePath` is the absolute filesystem path to the change directory where artifacts should be written.

No further output is produced.

### Requirement: Duplicate name error

If a change with the given name already exists (`ChangeAlreadyExistsError`), the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- \--spec is optional; when omitted, the change is created with an empty specIds list
- The change name must be a valid kebab-case slug; the CLI validates the format before invoking the use case
- The workspace prefix in --spec defaults to default when omitted; workspace IDs are never a separate flag
- Specs targeting readOnly workspaces are rejected before the use case is invoked

## Examples

```
# no specs — bootstrapping a change before specs are decided
specd change create add-oauth-login

# workspace omitted — defaults to 'default'
specd change create add-oauth-login --spec auth/oauth

# with description
specd change create add-oauth-login --spec auth/oauth --description "Add OAuth2 login via Google"

# multiple specs in the default workspace
specd change create update-billing --spec billing/invoices --spec billing/payments

# explicit workspace qualifier
specd change create add-shared-api --spec shared-ws:api/contracts
```

## Spec Dependencies

- [`cli:cli/entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:core/change`](../../core/change/spec.md) — Change entity, identity requirements
- [`core:core/spec-id-format`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format, bare path shorthand
