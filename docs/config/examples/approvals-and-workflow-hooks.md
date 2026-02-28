# Example: Project with approvals, workflow hooks, and artifact rules

## When to use this setup

Use this setup when your team requires explicit human sign-off at key lifecycle gates, wants to enforce per-artifact writing conventions without forking the schema, and needs shell automation at lifecycle boundaries. This is a typical configuration for a team that treats their spec directory as a regulated artifact — changes to it require review and approval before implementation begins and before the change is archived.

## specd.yaml

```yaml
schema: '@specd/schema-std'

llmOptimizedContext: true

context:
  - file: AGENTS.md
  - instruction: 'Always prefer editing existing files over creating new ones.'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

# always include global architecture specs regardless of which change is active
contextIncludeSpecs:
  - 'default:_global/*'

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  drafts:
    adapter: fs
    fs:
      path: specd/drafts
  discarded:
    adapter: fs
    fs:
      path: specd/discarded
  archive:
    adapter: fs
    fs:
      path: specd/archive
      pattern: '{{year}}/{{change.archivedName}}'

approvals:
  spec: true # human approval required before implementation may begin
  signoff: true # human sign-off required before archiving

workflow:
  - step: implementing
    hooks:
      pre:
        - instruction: |
            Before writing any code, confirm that the spec approval has been recorded.
            Do not begin implementation until SpecD confirms the change is in spec-approved state.
  - step: archiving
    hooks:
      pre:
        - run: 'pnpm test'
      post:
        - run: 'pnpm run notify-slack -- "Change {{change.name}} archived"'

artifactRules:
  specs:
    - 'All requirements must use SHALL or MUST for normative statements.'
    - 'Every requirement must have at least one WHEN/THEN scenario in verify.md.'
  design:
    - 'Architecture decisions must reference an ADR number.'

plugins:
  - name: '@specd/plugin-claude'
```

## What this configuration does

**Approval gates** — both gates are enabled. The change lifecycle expands to include two mandatory human review points:

```
ready → pending-spec-approval → spec-approved → implementing → ... → done → pending-signoff → signed-off → archivable
```

With `approvals.spec: true`, a human must explicitly run `specd approve spec` for each spec touched by the change before the agent can begin implementation. With `approvals.signoff: true`, a human must run `specd approve signoff` after verification is complete before the change can be archived. Both approval records capture the approver's git identity, a reason, and a hash of the artifacts at approval time.

**LLM-optimised context** — `llmOptimizedContext: true` enables richer metadata generation. When SpecD builds `.specd-metadata.yaml` files for specs, it uses an LLM to produce more precise descriptions, structured scenarios, and accurate `dependsOn` suggestions. This requires LLM access in the automation pipeline.

**Context entries** — `AGENTS.md` is injected verbatim into every compiled context before any spec content. The inline instruction is appended after it. These entries fire regardless of which change or workspace is active.

**Project-level context spec selection** — `contextIncludeSpecs: ['default:_global/*']` ensures that specs under `specs/_global/` are always in context, for every change, regardless of scope. This is declared at the project level so it applies unconditionally — without it, specs outside the active change's scope would only be included if the change explicitly referenced them.

**Workflow hooks** — the `implementing` pre-hook injects an instruction reminding the agent to confirm spec approval state before writing code. This is belt-and-suspenders: SpecD enforces the gate, but the instruction makes the expectation explicit in the agent's context.

The `archiving` pre-hook runs `pnpm test` before the archive proceeds — if tests fail, the archive is aborted and the user is informed. The post-hook fires after the archive is complete and sends a Slack notification.

**Artifact rules** — the `artifactRules` entries are injected by `CompileContext` as a distinct constraints block after the schema's own instruction for each artifact. They are additive — they extend the schema's instruction without replacing it. The `specs` rules enforce the project's normative language convention and scenario coverage requirement. The `design` rule ensures architecture decisions are traceable to ADRs.

**Plugin** — `@specd/plugin-claude` installs skill files and hooks for Claude Code. Plugin installation is managed by `specd plugin add` and `specd update` — the declaration here keeps the plugin in sync across team members.
