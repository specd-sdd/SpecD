# CLI Entrypoint

## Purpose

Every subcommand needs consistent config discovery, output routing, and error reporting — without a shared entrypoint contract, each command would reimplement these concerns differently. This spec defines the global behaviour of the `specd` CLI: configuration discovery (with the `--config` override), stdout/stderr conventions, the `--format` flag, and uniform exit codes.

## Requirements

### Requirement: Configuration discovery

When no `--config` flag is provided, `specd` discovers `specd.yaml` by walking up the directory tree from CWD toward the git repository root. The first `specd.yaml` found is loaded. If no `specd.yaml` is found before reaching the git root (or the filesystem root when not inside a git repo), the command fails with exit code 1 and a descriptive error on stderr.

### Requirement: Config flag override

`--config <path>` is a global option defined on the root `specd` program. When provided before a subcommand (`specd --config <path> change list`), Commander parses it at the root level. When provided after a subcommand (`specd change list --config <path>`), individual subcommands that declare their own `--config` option parse it locally.

To make both positions work seamlessly, the root program's `preAction` hook propagates the root-level `--config` value to any subcommand that has not received its own `--config` value. This means:

- `specd --config /path/to/specd.yaml change list` — root parses it, `preAction` injects into `change list`
- `specd change list --config /path/to/specd.yaml` — `change list` parses it directly
- `specd --config /path/to/specd.yaml` (no subcommand) — root parses it; used for auto-dashboard dispatch

When provided, config discovery is skipped and `specd.yaml` is loaded directly from `<path>`. If the file does not exist or cannot be parsed, the command fails with exit code 1 and a descriptive error on stderr.

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

Errors always go to stderr as plain `error:` or `fatal:` text for human consumption and logging.

### Requirement: Structured error output

When `--format` is `json` or `toon`, errors are **also** written to stdout in the corresponding structured format so that programmatic consumers (LLMs, scripts, CI) can parse them without reading stderr. The structured error object contains:

```json
{
  "result": "error",
  "code": "<MACHINE_READABLE_CODE>",
  "message": "<human-readable description>",
  "exitCode": 1
}
```

- `result` — always the string `"error"`
- `code` — the machine-readable error code from the `SpecdError` subclass (e.g. `DEPENDS_ON_OVERWRITE`, `CHANGE_NOT_FOUND`, `HOOK_FAILED`, `SCHEMA_NOT_FOUND`)
- `message` — the same message written to stderr (without the `error:`/`fatal:` prefix)
- `exitCode` — the numeric exit code (1, 2, or 3)

Structured error output is only emitted for known error types — subtypes of `SpecdError` that carry a machine-readable `code`. Generic or unexpected errors (exit code 3 from unhandled exceptions) are written to stderr only; stdout remains empty.

When `--format` is `text` (the default), errors go to stderr only and stdout remains empty — no change from the existing behaviour for human users.

### Requirement: JSON/TOON output schema in help

Every command that supports `--format json|toon` MUST include a human-readable description of its JSON output schema in the command help text, appended after the options list using Commander's `addHelpText('after', ...)`. The schema block MUST:

- Start with a header line: `\nJSON/TOON output schema:`
- Show the output shape as a TypeScript-style type annotation with one property per line
- Use `// comment` for brief field descriptions only when the field name is not self-explanatory
- Use `?` suffix for optional/conditional fields
- Show array element types inline (e.g. `Array<{ name: string, score: number }>`)

Example:

```
JSON/TOON output schema:
  {
    totalSymbols: number
    entries: Array<{
      symbol: { id: string, name: string, kind: string, filePath: string, line: number, col: number, comment?: string }
      score: number
      riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    }>
  }
```

This ensures programmatic consumers (agents, scripts, CI pipelines) can discover the output shape without reading source code or running the command.

### Requirement: Excess arguments rejected

Every leaf command rejects unexpected positional arguments. If a user passes more positional arguments than the command declares, the command exits with code 1 and prints a usage error to stderr. This prevents silent typos and misremembered syntax from being ignored.

### Requirement: Banner in help

When `specd --help` is invoked, the SpecD ASCII art banner is rendered above the standard Commander help text. The banner is prepended using Commander's `addHelpText('before', ...)` mechanism. The banner does not appear in subcommand help pages (e.g. `specd change --help`).

### Requirement: Auto-show dashboard

When `specd` is invoked with no subcommand — either as `specd` alone or as `specd --config <path>` — the CLI attempts config discovery (or loads the provided path). If a valid config is found, the `project dashboard` command is executed automatically as if the user had run `specd project dashboard [--config <path>]`. If config discovery fails (no `specd.yaml` found), the standard help text is shown instead.

This behaviour makes `specd` act as a project landing page when a project is present, rather than always showing generic help.

### Requirement: Top-level init alias

`specd init` SHALL be available as a top-level command that delegates to the same handler as `specd project init`. Both invocation forms MUST produce identical behaviour — same flags, interactive wizard, exit codes, and output formats. The top-level `init` command SHALL appear in the output of `specd --help` alongside other top-level commands.

## Constraints

- Every leaf command must call `.allowExcessArguments(false)` so Commander rejects extra positional arguments
- `--config` is defined on the root program as a global option; individual subcommands MAY also declare their own `--config` option for ergonomic use after the subcommand name. Commander lifts any `--config` occurrence to the root level, so the `preAction` hook propagates `program.opts().config` to the action command via `setOptionValue`. When `--config` appears twice, Commander's last-value-wins semantics apply.
- Config discovery halts at the git repository root; it does not cross repository boundaries
- Stdout and stderr must be independent streams — no interleaving of normal output and error messages
- Exit code 2 is reserved exclusively for hook failures; domain errors from hooks (e.g. the hook emits an error message and exits 1) still yield exit code 2
- `--format` never affects stderr — errors are always plain text on stderr regardless of format
- When `--format` is `json` or `toon`, errors are written to both stderr (plain text) and stdout (structured) — stderr for humans/logs, stdout for programmatic consumers
- The banner MUST NOT be shown in subcommand help pages; it is only prepended to the root `specd --help` output

## Examples

```
# Discovery from CWD — also auto-shows project dashboard if config is found
specd

# Initialize a new project (top-level alias)
specd init

# Same as above, using the full form
specd project init

# Global --config before subcommand
specd --config /path/to/specd.yaml change list

# Per-subcommand --config after subcommand name (equivalent)
specd change list --config /path/to/specd.yaml

# Auto-dashboard with explicit config
specd --config /path/to/specd.yaml

# Hook failure example — exit code 2 even if the hook printed its own error
specd change transition my-change implementing
# → hook exits 1 → specd exits 2
```

## Spec Dependencies

- [`core:core/config`](../../core/config/spec.md) — SpecdConfig shape and config file format
