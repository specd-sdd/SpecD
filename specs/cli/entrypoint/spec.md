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

User and domain errors (exit code 1) are printed to stderr as a single human-readable line prefixed with `error:`. System errors (exit code 3) are printed to stderr with a `fatal:` prefix followed by the error message; a stack trace is included only when debug logging is enabled for the active logger (`Logger.isLevelEnabled('debug')`).

### Requirement: Output format flag

Every `specd` command accepts a `--format text|json|toon` flag at the end of its flag list, defaulting to `text`. The three values are:

- `text` — human-readable visual output (the default behaviour)
- `json` — machine-friendly JSON written to stdout
- `toon` — LLM-friendly Token-Oriented Object Notation (TOON) encoding of the same data model as `json`, written to stdout

Errors always go to stderr as plain `error:` or `fatal:` text for human consumption and logging.

### Requirement: Structured error output

The CLI SHALL ensure all user-facing errors (validation, format, configuration) use typed error classes that follow the "Specd Error Contract" defined in [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md).

`@specd/cli` SHALL define its own `SpecdCliError` base class (extending `SpecdError`) for CLI-specific errors. Generic `Error` throws MUST be eliminated from formatters, command helpers, and argument validation logic to ensure the global `handleError` can emit structured JSON/TOON output without stack traces.

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

### Requirement: Host package SDK dependency boundary

Delivery host packages `@specd/cli` and `@specd/mcp` MUST declare `@specd/sdk` as their only direct workspace dependency on specd platform packages (`@specd/core`, `@specd/code-graph`, `@specd/sdk`). Plugin, schema, and third-party dependencies are unaffected.

`@specd/mcp` declares `@specd/sdk` as its specd platform dependency even when the package contains no MCP tools yet.

### Requirement: Banner version labels

When the root help banner renders version labels, it MUST show installed versions for `@specd/cli`, `@specd/sdk`, the `@specd/core` version obtained through `@specd/sdk` re-exports (`CORE_VERSION`), and the `@specd/code-graph` version obtained through `@specd/sdk` re-exports (`codeGraphVersion`).

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

- [`core:config`](../../core/config/spec.md) — SpecdConfig shape and config file format
- [`default:_global/error-handling-conventions`](../../_global/error-handling-conventions/spec.md) — canonical error handling standards for the monorepo.
