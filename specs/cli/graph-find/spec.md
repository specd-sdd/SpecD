# Graph Find

## Purpose

Without a way to search the code graph for symbols, users and agents must resort to text-based grep which misses semantic structure. The `specd graph find` command searches symbols in the code graph by name, kind, file, or comment text, returning structured results that include location and documentation.

## Requirements

### Requirement: Command signature

```
specd graph find [--name <pattern>] [--kind <kind>] [--file <path>] [--comment <text>] [--case-sensitive] [--path <path>] [--format text|json|toon]
```

- `--name` — optional; symbol name pattern, supports `*` wildcards
- `--kind` — optional; symbol kind filter, must be one of: `function`, `class`, `method`, `variable`, `type`, `interface`, `enum`
- `--file` — optional; file path filter, supports `*` wildcards
- `--comment` — optional; substring match against symbol comments (full-text search)
- `--case-sensitive` — optional; when present, `--name` and `--comment` matching is case sensitive. Default is case insensitive
- `--path` — optional; workspace root, defaults to the current working directory
- `--format text|json|toon` — optional; output format, defaults to `text`

All filters are optional and combinable. At least one filter should be provided, but the command does not enforce this — an empty query returns all symbols.

### Requirement: Search behaviour

The command:

1. Creates a `CodeGraphProvider` with the resolved path
2. Opens the provider
3. Builds a query from the provided filters and calls the appropriate search method
4. Outputs the matching `SymbolNode` array
5. Closes the provider
6. Exits with `process.exit(0)` — required because the LadybugDB native addon keeps the Node process alive

### Requirement: Output format

In `text` mode (default), the output begins with a count line followed by the matching symbols:

```
10 symbol(s) found:

  function computeHash  src/hash.ts:8 — /** Computes the hash. */
  class User  src/user.ts:1
```

Each symbol line shows:

- Kind (e.g. `function`, `class`)
- Name
- File path and line number separated by `:`
- If a comment is present, `—` followed by the comment truncated to 60 characters

When no symbols match, the output is `0 symbol(s) found:` with no symbol lines.

In `json` or `toon` mode, the full `SymbolNode` array is output as-is.

### Requirement: Error cases

If the provider cannot be opened or the search fails due to an infrastructure error, the command exits with code 3.

If `--kind` is provided with an invalid value, the command exits with code 1 and prints an `error:` message listing the valid kinds.

## Constraints

- The CLI does not contain search logic — it delegates entirely to `@specd/code-graph`
- `process.exit(0)` is called explicitly after closing the provider
- Comment truncation in text mode is capped at 60 characters; longer comments are cut with no ellipsis marker
- Wildcard matching for `--name` and `--file` uses `*` glob-style patterns

## Examples

```
$ specd graph find --name "compute*"
3 symbol(s) found:

  function computeHash  src/hash.ts:8 — /** Computes the hash. */
  function computeDigest  src/hash.ts:22
  method computeScore  src/scoring.ts:45 — /** Computes score */

$ specd graph find --kind class
5 symbol(s) found:

  class User  src/user.ts:1
  class Session  src/session.ts:1
  class AuthService  src/auth.ts:20 — /** Handles authentication */
  class Config  src/config.ts:5
  class Logger  src/logger.ts:1

$ specd graph find --file "src/auth*" --kind function
2 symbol(s) found:

  function validate  src/auth.ts:10 — /** Validates credentials */
  function hashPassword  src/auth-utils.ts:3

$ specd graph find --comment "hash"
2 symbol(s) found:

  function computeHash  src/hash.ts:8 — /** Computes the hash. */
  function hashPassword  src/auth-utils.ts:3 — /** Hashes a password using bcrypt */

$ specd graph find --name "validate" --format json
[{"name":"validate","kind":"function","file":"src/auth.ts","line":10,"comment":"/** Validates credentials */"}]

$ specd graph find --kind invalid
error: invalid kind 'invalid' — must be one of: function, class, method, variable, type, interface, enum
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/code-graph/composition/spec.md`](../../code-graph/composition/spec.md) — CodeGraphProvider, SymbolNode
