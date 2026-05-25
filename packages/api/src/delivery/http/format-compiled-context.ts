import type {
  CompileContextResult,
  ContextSpecEntry,
  ProjectContextEntry,
} from '@specd/core'

/**
 * Renders {@link CompileContextResult} as agent-facing markdown (CLI `changes context` parity).
 */
export function formatCompiledContextMarkdown(result: CompileContextResult): string {
  const parts: string[] = [`Context Fingerprint: ${result.contextFingerprint}`]

  for (const entry of result.projectContext) {
    parts.push(formatProjectContextEntry(entry))
  }

  const fullSpecs = result.specs.filter((s) => s.mode === 'full')
  if (fullSpecs.length > 0) {
    const specParts = fullSpecs.map(
      (s) => `### Spec: ${s.specId}\nMode: full\n\n${s.content ?? ''}`,
    )
    parts.push(`## Spec content\n\n${specParts.join('\n\n---\n\n')}`)
  }

  const nonFullSpecs = result.specs.filter((s) => s.mode !== 'full')
  if (nonFullSpecs.length > 0) {
    parts.push(formatSpecCatalogue(nonFullSpecs))
  }

  if (result.availableSteps.length > 0) {
    const stepLines = result.availableSteps.map((s) =>
      s.available
        ? `- ${s.step}: available`
        : `- ${s.step}: unavailable — requires: [${s.blockingArtifacts.join(', ')}]`,
    )
    parts.push(`## Available steps\n\n${stepLines.join('\n')}`)
  }

  return parts.join('\n\n---\n\n')
}

function formatProjectContextEntry(entry: ProjectContextEntry): string {
  if (entry.source === 'file' && entry.path !== undefined) {
    return `**Source: ${entry.path}**\n\n${entry.content}`
  }
  return `**Source: instruction**\n\n${entry.content}`
}

function formatSpecCatalogue(specs: readonly ContextSpecEntry[]): string {
  const includePatternSpecs = specs.filter((s) => s.source !== 'dependsOnTraversal')
  const depTraversalSpecs = specs.filter((s) => s.source === 'dependsOnTraversal')

  const catalogueParts: string[] = [
    'Use `specd changes spec-preview <change-name> <specId>` to load the merged full content of any change spec you need.',
    '',
  ]

  if (includePatternSpecs.length > 0) {
    catalogueParts.push('| Spec ID | Mode | Source | Title | Description |')
    catalogueParts.push('|---------|------|--------|-------|-------------|')
    for (const s of includePatternSpecs) {
      catalogueParts.push(
        `| ${s.specId} | ${s.mode} | ${s.source} | ${s.title ?? '—'} | ${s.description ?? '—'} |`,
      )
    }
  }

  if (depTraversalSpecs.length > 0) {
    catalogueParts.push('', '### Via dependencies', '')
    catalogueParts.push('| Spec ID | Mode | Source | Title | Description |')
    catalogueParts.push('|---------|------|--------|-------|-------------|')
    for (const s of depTraversalSpecs) {
      catalogueParts.push(
        `| ${s.specId} | ${s.mode} | ${s.source} | ${s.title ?? '—'} | ${s.description ?? '—'} |`,
      )
    }
  }

  return `## Available context specs\n\n${catalogueParts.join('\n')}`
}

/**
 * Maps change lifecycle `state` to a workflow step name for {@link CompileContext}.
 */
export function resolveCompileContextStep(state: string): string {
  const workflowSteps = new Set([
    'designing',
    'ready',
    'implementing',
    'verifying',
    'archiving',
  ])
  if (workflowSteps.has(state)) {
    return state
  }

  const byState: Record<string, string> = {
    drafting: 'designing',
    exploring: 'designing',
    'pending-spec-approval': 'ready',
    'spec-approved': 'implementing',
    done: 'implementing',
    archivable: 'archiving',
    'pending-signoff': 'archiving',
    'signed-off': 'archiving',
    archiving: 'archiving',
  }
  return byState[state] ?? 'designing'
}
