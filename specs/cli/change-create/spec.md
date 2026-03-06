# Change Create

## Overview

Defines the `specd change create <name> --spec <id>...` command, which creates a new change and persists it to the repository.

## Requirements

### Requirement: Command signature

```
specd change create <name> --spec <id>... [--format text|json|toon]
```

- `<name>` — required positional; the unique slug name for the new change (e.g. `add-auth-flow`)
- `--spec <id>` — required repeatable flag; one or more spec IDs being created or modified. Each `<id>` is `[<workspace>:]<capability-path>` — the workspace qualifier is optional and defaults to `default` when omitted (e.g. `--spec auth/login` means `default:auth/login`, `--spec billing/invoices` with an explicit workspace would be `--spec billing-ws:billing/invoices`).
- `--description <text>` — optional; a short free-text description of the change's purpose, stored in the manifest
- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Workspace resolution

The workspace IDs for the new change are derived from the workspace prefix of each `--spec` value. If the workspace prefix is omitted, `default` is used. If a named workspace is not declared in `specd.yaml`, the command fails with exit code 1 and prints an `error:` message to stderr.

### Requirement: Schema name and version

`schemaName` and `schemaVersion` are resolved from the active `SpecdConfig` at command time and passed to the `CreateChange` use case. The user does not specify these values.

### Requirement: Output on success

On success, output depends on `--format`:

- `text` (default): prints a single line to stdout:

  ```
  created change <name>
  ```

- `json` or `toon`: outputs the following to stdout (encoded in the respective format):

  ```json
  { "result": "ok", "name": "<name>", "state": "drafting" }
  ```

No further output is produced.

### Requirement: Duplicate name error

If a change with the given name already exists (`ChangeAlreadyExistsError`), the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- At least one `--spec` flag is required; omitting it is a CLI usage error (exit code 1)
- The change name must be a valid kebab-case slug; the CLI validates the format before invoking the use case
- The workspace prefix in `--spec` defaults to `default` when omitted; workspace IDs are never a separate flag

## Examples

```
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

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/change/spec.md`](../../core/change/spec.md) — Change entity, identity requirements
- [`specs/core/spec-id-format/spec.md`](../../core/spec-id-format/spec.md) — canonical `workspace:capabilityPath` format, bare path shorthand
