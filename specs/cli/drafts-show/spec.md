# Drafts Show

## Purpose

Before restoring a drafted change, users need to inspect its metadata to confirm it is the right one. `specd drafts show <name>` displays basic metadata — name, state, specs, and schema — for a single change in `drafts/`.

## Requirements

### Requirement: Command signature

```
specd drafts show <name> [--format text|json|toon]
```

Alias:

```
specd draft show <name> [--format text|json|toon]
```

- `<name>` — required positional; the name of the drafted change to show
- `--format` — controls output encoding; defaults to `text`

### Requirement: Loads drafted change via GetDraft

The command MUST invoke `GetDraft.execute({ name })` (or the kernel equivalent) to load the drafted change.

The command MUST NOT invoke `GetStatus` or `ChangeRepository.get` for this command.

Displayed fields (`name`, `state`, `specIds`, `schema`) MUST be read from the returned `DraftedChangeView`.

### Requirement: Output format — text

The command prints metadata for the change to stdout:

```
name:    <name>
state:   <state>
specs:   <specId>, ...
schema:  <schema-name>@<version>
```

### Requirement: Output format — JSON

When `--format json` is passed, the command writes a single JSON object to stdout:

```json
{"name":"...","state":"...","specIds":[...],"schema":{"name":"...","version":N}}
```

### Requirement: Output format — toon

When `--format toon` is passed, the command writes the same data model as JSON encoded in Token-Oriented Object Notation (toon) to stdout.

### Requirement: Error cases

- If `GetDraft` throws `ChangeNotFoundError`, the command exits with code 1 and prints an `error:` message to stderr indicating the change is not in `drafts/`.
- If a change with the given name exists only under active storage, the command exits with code 1 and prints an `error:` message to stderr.

## Constraints

- Errors always go to stderr as plain text regardless of `--format`
- `--format` only affects stdout
- Only changes currently in `drafts/` are shown by this command

## Examples

```
$ specd drafts show old-experiment
name:    old-experiment
state:   drafting
specs:   auth/legacy
schema:  schema-std@1

$ specd drafts show old-experiment --format json
{"name":"old-experiment","state":"drafting","specIds":["auth/legacy"],"schema":{"name":"schema-std","version":1}}
```

## Spec Dependencies

- [`cli:entrypoint`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`core:get-draft`](../../core/get-draft/spec.md) — load drafted change by name
- [`core:drafted-change-view`](../../core/drafted-change-view/spec.md) — read model returned to the command
- [`cli:command-resource-naming`](../command-resource-naming/spec.md) — canonical plural naming and singular alias policy
