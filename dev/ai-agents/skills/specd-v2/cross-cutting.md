# Cross-cutting: Conversational scope detection

**This applies at all times during the lifecycle, not just within a specific phase.**

Throughout the conversation — whether inside a lifecycle phase or during free discussion
between phases — the user may make statements, decisions, or observations that have
spec implications. Examples:

- "Actually, we should also handle the case where X happens" → may need a new spec or
  a delta to an existing one
- "Let's not touch the auth layer after all" → a spec may need to be removed from scope
- "I realized this also affects how Y works" → a dependency or modified spec may be needed
- "We decided in the team meeting to change the approach to Z" → may invalidate current
  specs or require new ones

**When you detect a statement with spec implications:**

1. **Identify the implication.** What area, module, or domain concept is affected? Is it
   already covered by a spec?

2. **Cross-reference against existing specs:**

   ```bash
   node packages/cli/dist/index.js spec list --format text --summary
   ```

3. **Surface it explicitly to the user.** Do not silently absorb the information — make
   the spec implication visible:

   > What you just described affects `<area>`. I see a few possibilities:
   >
   > - **New spec needed:** There's no existing spec covering `<area>`. Should we create
   >   one? (This would expand the change's scope.)
   > - **Existing spec affected:** `<workspace>:<path>` covers this area. Should I add
   >   it to this change as a modified spec or dependency?
   > - **Scope reduction:** If this means we're no longer touching `<specId>`, should I
   >   remove it from the change?
   > - **Separate change:** If this is big enough, it might warrant its own change
   >   rather than expanding this one.

4. **Act on the user's decision.** Use the appropriate CLI commands (`change edit`,
   `change deps`, `change create`) as needed. If adding a spec requires going back to
   designing, inform the user of the lifecycle cost.

   **Always use fully-qualified spec IDs** (`workspace:capability-path`). Never guess —
   look up the correct ID from `spec list --format text` before passing it to any command.

5. **If no active change exists** and the conversation reveals a spec-worthy decision,
   note it to the user:

   > That sounds like it could warrant a spec. Want me to start a new change for it?

**Key principle:** The LLM is the last line of defense against undocumented decisions.
If something the user says would change system behavior, constraints, or architecture,
and there is no spec for it, that is worth surfacing — even if the user didn't ask.
