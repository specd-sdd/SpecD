import { type Command } from 'commander'
import { type ResolveContextSpecsResult } from '@specd/sdk'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { collect } from '../../helpers/collect.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Formats partitioned context-spec IDs for text output.
 *
 * @param result - Partitioned resolution result.
 * @param workspacesOnly - When true, omit the `project:` section entirely.
 * @returns Nested text with optional `project:` and `workspaces.<name>:` groups.
 */
function formatContextSpecsText(
  result: ResolveContextSpecsResult,
  workspacesOnly: boolean,
): string {
  const lines: string[] = []

  if (!workspacesOnly) {
    lines.push('project:')
    if (result.project.length === 0) {
      lines.push('  (none)')
    } else {
      for (const specId of result.project) lines.push(`  ${specId}`)
    }
    lines.push('')
  }

  lines.push('workspaces:')
  const workspaceNames = Object.keys(result.workspaces)
  if (workspaceNames.length === 0) {
    lines.push('  (none)')
  } else {
    for (const name of workspaceNames) {
      const ids = result.workspaces[name] ?? []
      lines.push(`  ${name}:`)
      if (ids.length === 0) {
        lines.push('    (none)')
      } else {
        for (const specId of ids) lines.push(`    ${specId}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Registers the `project context-specs` command.
 *
 * @param parent - Parent project command.
 */
export function registerProjectContextSpecs(parent: Command): void {
  parent
    .command('context-specs')
    .allowExcessArguments(false)
    .description(
      'List context-pattern spec IDs partitioned into project vs per-workspace includes.',
    )
    .option(
      '--workspace <name>',
      'limit workspace-level patterns to this workspace (repeatable); project patterns still apply unless --workspaces-only',
      collect,
      [],
    )
    .option(
      '--workspaces-only',
      'skip project-level patterns; only resolve and print workspace-level includes',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
Resolves project and active-workspace contextIncludeSpecs/contextExcludeSpecs.

Output shape:
  project:      IDs from project-level patterns (omitted in text with --workspaces-only)
  workspaces:   map of workspace name → IDs from that workspace's patterns

An ID included by both layers appears under project and under that workspace.

--workspace is repeatable (same as specs list). It only selects which workspace-level
pattern sets run; it does NOT suppress project: unless --workspaces-only is also set.
Omit --workspace to activate all configured workspaces.
Do not pass comma-separated names or a plural --workspaces value flag.

Examples:
  specd project context-specs
  specd project context-specs --workspace core --workspace cli
  specd project context-specs --workspace core --workspaces-only
  specd project context-specs --format toon
`,
    )
    .action(
      async (opts: {
        workspace: string[]
        workspacesOnly?: boolean
        format: string
        config?: string
      }) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })
          const workspacesOnly = opts.workspacesOnly === true
          const result = await kernel.project.resolveContextSpecs.execute({
            ...(opts.workspace.length > 0 ? { workspaces: opts.workspace } : {}),
            ...(workspacesOnly ? { workspacesOnly: true } : {}),
          })
          const fmt = parseFormat(opts.format)
          output(fmt === 'text' ? formatContextSpecsText(result, workspacesOnly) : result, fmt)
        } catch (error) {
          handleError(error, opts.format)
        }
      },
    )
}
