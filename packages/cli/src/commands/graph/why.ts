import { Command } from 'commander'
import {
  runGraphWhy,
  type ExplainCandidate,
  type ExplainRule,
  type ExplainStep,
  type RunGraphWhyResult,
  type SdkHostContext,
} from '@specd/sdk'
import { output, parseFormat } from '../../formatter.js'
import { cliError } from '../../handle-error.js'
import { resolveGraphCliContext } from './resolve-graph-cli-context.js'
import { warnGraphStale } from './warn-graph-staleness.js'
import { createGraphHostContext } from './host-context.js'
import { withProvider } from './with-provider.js'

/**
 * Renders the origin of a rule on one line.
 * @param rule - The rule to describe.
 * @returns Text such as `from global graph.excludePaths`.
 */
function describeRule(rule: ExplainRule): string {
  const origin = rule.origin
  const parts = ['from', origin.layer]
  if (origin.workspace !== undefined) parts.push(origin.workspace)
  if (origin.key !== undefined) parts.push(origin.key)
  if (origin.sourceFile !== undefined) {
    parts.push(
      origin.line !== undefined && origin.line !== null
        ? `${origin.sourceFile}:${String(origin.line)}`
        : origin.sourceFile,
    )
  }
  if (rule.viaDirectory !== undefined) parts.push(`via ${rule.viaDirectory}`)
  return parts.join(' ')
}

/**
 * Renders one evaluation step on one line.
 * @param step - The step to render.
 * @returns The step line.
 */
function renderStep(step: ExplainStep): string {
  let line = `  - ${step.stage}: ${step.outcome}`
  if (step.rule !== undefined) {
    line += ` — ${step.rule.pattern} (${step.rule.negated ? 'negation' : 'pattern'}) ${describeRule(step.rule)}`
  }
  const detail = step.detail
  if (detail !== undefined) {
    if (detail.sizeBytes !== undefined && detail.sizeBytes !== null) {
      line += ` size=${String(detail.sizeBytes)}`
      if (detail.limitBytes !== undefined) line += ` limit=${String(detail.limitBytes)}`
      if (detail.exempt === true) line += ' exempt'
    }
    if (detail.category !== undefined) line += ` category=${detail.category}`
    if (detail.kind !== undefined) {
      line += ` kind=${detail.kind}`
      if (detail.language !== undefined) line += ` language=${detail.language}`
      if (detail.kind === 'document') line += ' (subject to text decoding at index time)'
    }
  }
  return line
}

/**
 * Renders one candidate block.
 * @param candidate - The candidate to render.
 * @returns Lines of the block.
 */
function renderCandidate(candidate: ExplainCandidate): string[] {
  const inGraph = candidate.inGraph === null ? 'unknown' : candidate.inGraph ? 'yes' : 'no'
  const lines = [
    `${candidate.identity}  [${candidate.verdict}]  category: ${candidate.category ?? '-'}  kind: ${candidate.kind ?? '-'}  inGraph: ${inGraph}`,
  ]
  for (const step of candidate.steps) {
    lines.push(renderStep(step))
    if (step.detail?.workspaceNegationBlocked === true) {
      lines.push('    a global exclusion prevented a workspace pattern from re-including this path')
    }
  }
  return lines
}

/**
 * Renders a path explanation as text. Pure: performs no evaluation, only presentation.
 * @param result - The explanation produced by `runGraphWhy`.
 * @returns The text output.
 */
export function renderGraphWhyText(result: RunGraphWhyResult): string {
  const lines = [
    result.projectRelativePath,
    `verdict: ${result.verdict}   owners: ${result.owners.length > 0 ? result.owners.join(', ') : 'none'}`,
  ]
  for (const candidate of result.candidates) {
    lines.push('')
    lines.push(...renderCandidate(candidate))
  }
  if (result.diagnostics.length > 0) lines.push('')
  for (const diagnostic of result.diagnostics) {
    lines.push(`! ${diagnostic.code}: ${diagnostic.message}`)
  }
  return lines.join('\n')
}

/**
 * Registers the `graph why` command.
 * @param parent - The parent commander command.
 */
export function registerGraphWhy(parent: Command): void {
  parent
    .command('why <path>')
    .allowExcessArguments(false)
    .description('Explain why a path is excluded, classified or indexed by the code graph')
    .option('--config <path>', 'path to specd.yaml')
    .option('--path <path>', 'repository root for bootstrap mode')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .addHelpText(
      'after',
      `
<path> is a project-relative path, an absolute path, or workspace:path.
Patterns in specd.yaml are interpreted relative to the project root.

JSON/TOON output schema:
  {
    input: string
    projectRelativePath: string
    verdict: 'indexable' | 'not-indexed' | 'not-in-scope'
    owners: string[]
    candidates: Array<{
      workspace: string | null
      identity: string
      verdict: 'indexable' | 'excluded' | 'not-allowed' | 'too-large'
      category: 'source' | 'test' | 'ignored' | null
      kind: 'file' | 'document' | null
      inGraph: boolean | null
      steps: Array<{
        stage: 'binary-extension' | 'gitignore' | 'global-exclude' | 'workspace-exclude'
          | 'allowed-paths' | 'size-limit' | 'category' | 'adapter'
        outcome: 'matched' | 'passed' | 'not-applicable'
        rule?: { pattern: string, negated: boolean, origin: object, viaDirectory?: string }
        detail?: object
      }>
    }>
    diagnostics: Array<{ code: string, message: string, workspace?: string }>
  }
`,
    )
    .action(async (path: string, opts: { config?: string; path?: string; format: string }) => {
      const fmt = parseFormat(opts.format)
      if (opts.config !== undefined && opts.path !== undefined) {
        cliError('--config and --path are mutually exclusive', opts.format, 1)
      }
      const { config, kernel } = await resolveGraphCliContext({
        configPath: opts.config,
        repoPath: opts.path,
      }).catch((err: unknown) =>
        cliError(
          err instanceof Error ? err.message : 'failed to resolve graph context',
          opts.format,
          1,
        ),
      )
      await withProvider(
        config,
        opts.format,
        async (provider) => {
          await warnGraphStale(provider, config, kernel)
          const hostContext: SdkHostContext = await createGraphHostContext(config, kernel)
          const result = await runGraphWhy(hostContext, { path, provider })
          if (fmt === 'text') {
            output(renderGraphWhyText(result), 'text')
          } else {
            output(result, fmt)
          }
        },
        { kernel },
      )
    })
}
