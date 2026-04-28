## How specd is used in practice

specd is designed to be driven by **coding assistants** — tools like Claude Code, GitHub Copilot, OpenAI Codex, or any AI-powered coding tool that supports slash commands or custom instructions.

You do not typically run specd by typing CLI commands one by one. Instead, you interact through **skills** — slash commands installed into your coding assistant that orchestrate the full lifecycle for you.

### Skills

When you set up specd in a project, you install skills for your coding assistant of choice:

```bash
specd project init --plugin @specd/plugin-agent-claude     # Install skills for Claude Code
specd project init --plugin @specd/plugin-agent-copilot    # Install skills for GitHub Copilot
specd project init --plugin @specd/plugin-agent-codex      # Install skills for OpenAI Codex
specd project init --plugin @specd/plugin-agent-opencode   # Install skills for Open Code
```

This installs slash commands that the coding assistant can invoke. The main one is `/specd`.

### The `/specd` entry point

`/specd` is the primary skill. When you invoke it, it:

1. Shows the current project status — active changes, their states, available specs
2. Detects where you left off and suggests what to do next
3. Routes you to the appropriate phase skill

You can invoke it with a change name to jump straight to that change, or without arguments to see an overview and decide what to work on.

```
> /specd

# specd

**Schema:** @specd/schema-std
**Workspaces:** default (12 specs), core (45 specs)
**Active changes:** 1 — add-auth-flow (designing)
**Drafts:** none

> The change "add-auth-flow" is in the designing state.
> Specs and verify are complete. Design is next.
> Suggest: /specd-design add-auth-flow
```

### Phase skills

Each lifecycle phase has its own skill that knows how to guide the coding assistant through that phase:

| Skill              | Phase        | What it does                                                         |
| ------------------ | ------------ | -------------------------------------------------------------------- |
| `/specd-new`       | Creation     | Explores what you want to do, creates a change when ready            |
| `/specd-design`    | Designing    | Drives the agent through proposal → specs → verify → design → tasks  |
| `/specd-implement` | Implementing | Works through tasks one by one, runs hooks, transitions to verifying |
| `/specd-verify`    | Verifying    | Checks the implementation against verification scenarios             |
| `/specd-archive`   | Archiving    | Handles signoff gates, archives the change, applies deltas           |

You rarely need to invoke phase skills directly — `/specd` suggests the right one based on the current state. But you can jump to any phase if you know where you are.

### The typical workflow

A real session looks like this:

1. You type `/specd` in your coding assistant
2. specd shows the project status and asks what you want to do
3. You describe the change you want to make (or pick an existing one)
4. `/specd-new` explores what you want through a conversation, creates the change, and saves the full discovery context to `specd-exploration.md` in the change directory — so nothing is lost between sessions
5. `/specd-design` reads the exploration context, verifies it's still current, and guides the agent through writing the artifacts defined by the schema — in `@specd/schema-std` that means proposal, specs, verification scenarios, design, and tasks. Other schemas may define a different set of artifacts.
6. You review the artifacts. If approval gates are enabled, you approve the spec.
7. `/specd-implement` works through the task list, writing code that satisfies the specs
8. `/specd-verify` runs through each verification scenario to confirm correctness
9. `/specd-archive` archives the completed change, applying spec deltas to the permanent spec repository

At every step, the coding assistant has access to the compiled context — the right specs, the right instructions, the right constraints — assembled automatically by specd.

### The CLI underneath

The skills call the specd CLI under the hood. Every operation is ultimately a CLI command:

```bash
specd changes create add-auth --spec auth/login
specd changes status add-auth
specd changes transition add-auth implementing
specd changes context add-auth designing
specd changes archive add-auth
```

You can use the CLI directly when you need to — for scripting, CI pipelines, or when you want fine-grained control. But for day-to-day development, the skills provide the guided experience that makes spec-driven development practical.

See the [CLI Reference](../../../cli/cli-reference.md) for the full command reference.
