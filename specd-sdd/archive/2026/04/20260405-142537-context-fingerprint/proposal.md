# Proposal: context-fingerprint

## Motivation

Every time an AI agent invokes a specd skill for an existing change, the skill calls `change context` to load spec content and project context. The output is identical unless specs or config changed, but the CLI always returns the full context — forcing the agent to re-process the same content repeatedly. This wastes tokens and time.

## Current behaviour

When an agent enters a specd skill for an existing change:

1. Agent calls `change context <name> <step>`
2. CLI compiles the full context from scratch (specs, projectContext, available steps)
3. CLI returns everything — even if it was identical to the previous call
4. Agent re-processes the same content

The context output is deterministic based on:

- Change specIds
- Project config (projectContext, contextIncludeSpecs, contextExcludeSpecs)
- The step being queried
- Schema version
- All CLI flags that affect output: `--rules`, `--constraints`, `--scenarios`, `--follow-deps`, `--depth`

If none of these changed, the output is byte-for-byte identical — but the agent pays the full cost every time.

## Proposed solution

Add a `--fingerprint` flag to `change context` that lets agents skip re-reading unchanged context:

1. **First call**: Agent calls `change context <name> <step>`. CLI returns full context + a `contextFingerprint` field (SHA-256 of all relevant inputs).

2. **Agent stores fingerprint**: The agent remembers the fingerprint in its conversation context (no files needed).

3. **Subsequent calls**: Agent calls `change context <name> <step> --fingerprint <value>`. CLI:
   - Calculates current fingerprint
   - If `current === provided`: returns `{"status": "unchanged", "contextFingerprint": "sha256:..."}`
   - If `current !== provided` or no fingerprint: returns full context + new fingerprint

## Specs affected

### New specs

_none_

### Modified specs

- `cli:cli/change-context`: Add `--fingerprint` flag to the command signature. Document new behaviour in Requirements and Constraints.
  - Depends on (added): none

- `core:core/compile-context`: Add fingerprint calculation to the use case. Fingerprint composition includes change specIds, project context entries, include/exclude patterns, step, and schema version. Add `contextFingerprint` and `status` fields to `CompileContextResult`.
  - Depends on (added): none

## Impact

- **CLI**: New `--fingerprint` flag on `change context` command. Comparison logic added.
- **Core**: `CompileContext` use case calculates fingerprint from all context inputs.
- **Skills**: All specd skills become more efficient — they can skip context re-reads within a session.
- **Skill files** (`dev/ai-agents/skills/`): Skills that call `change context` (e.g., `specd`, `specd-design`, `specd-implement`, `specd-verify`) must be updated to use the fingerprint mechanism. The flow: store fingerprint from first call, pass it to subsequent calls, use cached context when `status` is `"unchanged"`.

## Technical context

The fingerprint is calculated at the CLI level (inside `CompileContext`) because it has access to all inputs. The agent only needs to pass the fingerprint back — it doesn't need to understand what inputs affect it.

**Fingerprint composition** (inputs hashed together):

- Change specIds (sorted for consistency)
- Project context entries (instructions verbatim + file content hashes)
- Context include/exclude patterns from config
- The step being queried
- Schema version
- All CLI flags that affect output: `--rules`, `--constraints`, `--scenarios`, `--follow-deps`, `--depth`

Note: `--format` does not affect the fingerprint because the CLI compares the fingerprint at the use case level (before formatting). The fingerprint represents the logical context content, not its rendering.

**Session-based persistence**: The agent stores the fingerprint in its conversation window. If the user closes and reopens the chat, the agent starts fresh (no fingerprint) and gets full context on the first call. This is acceptable because the first call in any session needs the full context anyway.

**Text mode**: When `status: "unchanged"`, text output shows a brief "Context unchanged since last call" message. The full context is not printed.

**API response shapes**:

```bash
# First call (no fingerprint)
$ change context my-change designing --format json
{
  "contextFingerprint": "sha256:abc123...",
  "status": "changed",
  ...full context...
}

# Subsequent calls with matching fingerprint
$ change context my-change designing --fingerprint sha256:abc123... --format json
{
  "contextFingerprint": "sha256:abc123...",
  "status": "unchanged"
}

# When something changed
$ change context my-change designing --fingerprint sha256:abc123... --format json
{
  "contextFingerprint": "sha256:xyz789...",
  "status": "changed",
  ...full context (with new fingerprint)...
}
```

**Rejected alternatives**:

1. **Context cache file in change directory**: Requires agent to know if cache is stale. Would need fingerprint anyway — circular.
2. **Fingerprint stored in manifest.json**: Would persist across sessions but adds complexity. Session-based approach is simpler.
3. **Agent comparing context output itself**: Too much work for the agent, and it doesn't have access to spec file hashes to know if they changed.

## Open questions

_none_
