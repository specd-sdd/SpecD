# CLI Entrypoint

## Overview

Defines the global behaviour of the `specd` CLI that applies to every command: configuration discovery, the `--config` override flag, output conventions (stdout vs stderr), and process exit codes.

## Requirements

### Requirement: Configuration discovery

When no `--config` flag is provided, `specd` discovers `specd.yaml` by walking up the directory tree from CWD toward the git repository root. The first `specd.yaml` found is loaded. If no `specd.yaml` is found before reaching the git root (or the filesystem root when not inside a git repo), the command fails with exit code 1 and a descriptive error on stderr.

### Requirement: Config flag override

Every `specd` command accepts a `--config <path>` flag. When provided, config discovery is skipped and `specd.yaml` is loaded directly from `<path>`. If the file does not exist or cannot be parsed, the command fails with exit code 1 and a descriptive error on stderr.

### Requirement: Output conventions

Normal output (tables, structured text, success messages) is written to stdout. All errors, warnings, and diagnostic messages are written to stderr. These streams must not be mixed.

### Requirement: Exit codes

`specd` uses the following exit codes uniformly across all commands:

| Code | Meaning                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- |
| 0    | Success                                                                                             |
| 1    | User or domain error (change not found, invalid state transition, validation failure, config error) |
| 2    | Hook failure (a `run:` hook exited with a non-zero status)                                          |
| 3    | System error (unhandled exception, I/O error, schema resolution failure)                            |

No other exit codes are used. When a hook fails, the hook's own stdout/stderr is forwarded verbatim and `specd` exits with code 2.

### Requirement: Error message format

User and domain errors (exit code 1) are printed to stderr as a single human-readable line prefixed with `error:`. System errors (exit code 3) are printed to stderr with a `fatal:` prefix followed by the error message; a stack trace is included only when the `SPECD_DEBUG=1` environment variable is set.

### Requirement: Output format flag

Every `specd` command accepts a `--format text|json|toon` flag at the end of its flag list, defaulting to `text`. The three values are:

- `text` — human-readable visual output (the default behaviour)
- `json` — machine-friendly JSON written to stdout
- `toon` — LLM-friendly Token-Oriented Object Notation (TOON) encoding of the same data model as `json`, written to stdout

Errors always go to stderr as plain `error:` or `fatal:` text regardless of the `--format` value. The `--format` flag affects stdout output only.

## Constraints

- `--config` must be the first flag processed, before any sub-command-specific flag parsing
- Config discovery halts at the git repository root; it does not cross repository boundaries
- Stdout and stderr must be independent streams — no interleaving of normal output and error messages
- Exit code 2 is reserved exclusively for hook failures; domain errors from hooks (e.g. the hook emits an error message and exits 1) still yield exit code 2
- `--format` never affects stderr — errors are always plain text on stderr regardless of format

## Examples

```
# Discovery from CWD
specd change list

# Explicit config path
specd --config /path/to/specd.yaml change list

# Hook failure example — exit code 2 even if the hook printed its own error
specd change transition my-change implementing
# → hook exits 1 → specd exits 2
```

## Spec Dependencies

- [`specs/core/config/spec.md`](../../core/config/spec.md) — SpecdConfig shape and config file format
