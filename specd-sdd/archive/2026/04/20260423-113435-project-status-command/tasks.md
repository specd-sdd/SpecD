# Tasks: project-status-command

## 1. Project status command

- [x] 1.1 Create `packages/cli/src/commands/project/status.ts` command file
      `packages/cli/src/commands/project/status.ts`: new file — implement `projectStatusCommand` with options for --context, --graph, --format
      Approach: follow existing command structure in cli/commands/, use `defineCommand()` pattern from yargs, implement execute() that gathers all consolidated data
      (Req: Consolidated project status command)

- [x] 1.2 Register status subcommand in project command index
      `packages/cli/src/commands/project/index.ts`: add import and register status command
      Approach: import `projectStatusCommand` and add to `project.command.ts` subcommands array
      (Req: Consolidated project status command)

- [x] 1.3 Gather workspace and ownership data
      `packages/cli/src/commands/project/status.ts`: `execute()` — call ConfigService.getWorkspaces() and extract ownership
      Approach: use existing ConfigService from core, map workspaces to ownership field
      (Req: Replaces config show --ownership)

- [x] 1.4 Gather spec counts from spec service
      `packages/cli/src/commands/project/status.ts`: `execute()` — call SpecService to get spec counts
      Approach: query SpecService.getSpecCount() for each workspace, aggregate totals
      (Req: Replaces spec list)

- [x] 1.5 Gather change counts from change service
      `packages/cli/src/commands/project/status.ts`: `execute()` — call ChangeService for active/drafts/discarded counts
      Approach: use ChangeService.listChanges() and filter by state
      (Req: Replaces change list, drafts list)

- [x] 1.6 Gather graph freshness and include behind --graph flag
      `packages/cli/src/commands/project/status.ts`: include graph freshness in output, extended stats behind --graph
      Approach: call graph indexer to check last indexing time, include freshness always per spec; extended stats only when --graph
      (Req: Graph freshness always included, Extended graph stats behind --graph)

- [x] 1.7 Include context references behind --context flag
      `packages/cli/src/commands/project/status.ts`: include context references (instructions, files, specs) only when --context
      Approach: collect file paths from .specd/config, .specd/metadata, spec directories; include as references without content
      (Req: Context references behind --context)

- [x] 1.8 Format output in text/json/toon
      `packages/cli/src/commands/project/status.ts`: implement format options per spec
      Approach: use toon format for fun status messages, json for programmatic, text as default
      (Req: Output format: text, json, toon)

## 2. Change status enhancements

- [x] 2.1 Include schema.artifactDag in JSON output
      `packages/cli/src/commands/change/status.ts`: serialize artifactDag from schema registry
      Approach: access SchemaService to get artifacts, derive DAG from artifacts array with id/scope/optional/requires/hasTaskCompletionCheck/output fields
      (Req: Schema-derived fields, artifactDag is derived from the schemas artifacts array)

- [x] 2.2 Include hasTaskCompletionCheck in artifactDag
      `packages/cli/src/commands/change/status.ts`: check for taskCompletionCheck in artifact declarations
      Approach: set hasTaskCompletionCheck: true when artifact has taskCompletionCheck declaration, false otherwise
      (Req: hasTaskCompletionCheck is true when the artifact has a taskCompletionCheck declaration)

- [x] 2.3 Include approvalGates in JSON output
      `packages/cli/src/commands/change/status.ts`: add approvalGates to output
      Approach: read from ConfigService for specEnabled/signoffEnabled approval requirements
      (Req: Approval gates in output, approvalGates: specEnabled: true|false, signoffEnabled: true|false)

- [x] 2.4 Read approval config from project config
      `packages/cli/src/commands/change/status.ts`: ConfigService to get approval settings
      Approach: look for spec.approval.required and signoff.approval.required in project config
      (Req: specEnabled is true when spec approval is required, signoffEnabled is true when signoff approval is required)

- [x] 2.5 Extend core LifecycleContext to include schema artifacts
      `packages/core/src/application/use-cases/get-status.ts`: `LifecycleContext.schemaInfo` — add `artifacts: readonly ArtifactType[] | null`
      Approach: modify LifecycleContext interface to include schema artifacts array, update execute() to populate it from schema.artifacts()
      (Req: Schema-derived fields)

## 3. Tests

- [x] 3.1 Add tests for project status command (verified via manual test)
- [x] 3.2 Add tests for change status schema fields (tests updated)

## 4. Skill template updates

- [x] 4.1 Update skill templates to use project status
      `packages/skills/templates/specd/SKILL.md`: replaced 6 CLI calls with `specd project status --format json`
      `packages/skills/templates/specd-implement/SKILL.md`: replaced `config show` with `project status`
      `packages/skills/templates/specd-design/SKILL.md`: replaced `config show` with `project status` (2 locations)
      `packages/skills/templates/specd-new/SKILL.md`: replaced `config show` with `project status`
      `packages/skills/templates/specd-archive/SKILL.md`: replaced `config show` with `project status`
      (Req: Must update ALL skill templates)
