# spec implementation

Manage persisted implementation links in `spec-lock.json`.

## Usage

```bash
specd specs implementation list <specPath>
specd specs implementation add <specPath> --file <path> [--symbol <name>...]
specd specs implementation remove <specPath> --file <path> [--symbol <name>...]
specd specs implementation suggest [<specPath>] [--spec <id>...] [--all] [--workspace <name>] [--apply] [--confidence <HIGH|MEDIUM|MED|LOW>] [--rebuild-cache]
```

## Behavior

- `add` requires the target file to exist under the workspace `codeRoot` and normalizes paths to `workspace:relative/path`.
- `add` merges `symbols` additively when the file entry already exists.
- `remove` with `symbols` drops only those names; without `symbols`, removes the whole entry.
- `suggest` performs static analysis and Code Graph symbol correlation to deduce candidate implementation files and AST symbols.
- `suggest` extracts symbol and file candidates from Markdown AST using syntax-aware classifiers:
  - **Fenced code blocks**: (`+30` score, reason `fenced-code-evidence`) identifier candidates in supported language code blocks.
  - **Inline code**: (`+20` score, reason `inline-code-evidence`) identifier candidates and file paths with supported extensions.
  - **Graph-validated prose**: (`+5` score, reason `prose-symbol-evidence`) prose terms matching symbol naming conventions that resolve to indexed symbols within the target workspace. Unmatched prose terms are discarded.
- Evidence bonuses supplement primary symbol (`+200`), derivative (`+50`), filename (`+150`), and token affinity (`+100`) scores without independently qualifying a candidate as `HIGH` confidence.
- `suggest --apply` performs an additive set union, updating `spec-lock.json` without overriding or deleting existing confirmed links.
- `suggest` marks every candidate with `alreadyIncluded` and emits `result`, `specs`, `existing`, and ranked `suggestions` in JSON/TOON formats; machine formats never prompt.
- Missing lock: `add` creates incidental state; `remove` is a no-op.

### Evidence Scoring

| Source                       | Score Bonus | Reason                  |
| ---------------------------- | ----------: | ----------------------- |
| Fenced code block            |         +30 | `fenced-code-evidence`  |
| Inline code snippet          |         +20 | `inline-code-evidence`  |
| Graph-validated prose symbol |          +5 | `prose-symbol-evidence` |

## Errors

| Error                                  | Cause                                            |
| -------------------------------------- | ------------------------------------------------ |
| `ImplementationFileNotFoundError`      | File missing on disk                             |
| `ImplementationWorkspaceBoundaryError` | File outside workspace code root                 |
| `InvalidInputError`                    | Missing target, cache, or required file observer |
