import type { ContextSpecEntry } from '@specd/core'

/**
 * Renders specs with mode === 'full' under `## Spec content`.
 *
 * @param specs - List of context spec entries.
 * @returns Rendered markdown string for full-mode specs, or empty string if none exist.
 */
export function renderFullSpecs(specs: readonly ContextSpecEntry[]): string {
  const fullSpecs = specs.filter((s) => s.mode === 'full')
  if (fullSpecs.length === 0) return ''
  const specParts = fullSpecs.map((s) => `### Spec: ${s.specId}\nMode: full\n\n${s.content ?? ''}`)
  return `## Spec content\n\n${specParts.join('\n\n---\n\n')}`
}

/**
 * Renders non-full specs for change context under `## Available context specs`.
 *
 * @param specs - List of context spec entries.
 * @param changeName - Name of the active change.
 * @returns Rendered markdown string for non-full change context specs, or empty string if none exist.
 */
export function renderChangeCatalogue(
  specs: readonly ContextSpecEntry[],
  changeName: string,
): string {
  const nonFullSpecs = specs.filter((s) => s.mode !== 'full')
  if (nonFullSpecs.length === 0) return ''

  const group1 = nonFullSpecs.filter((s) => s.source === 'specIds')
  const group2 = nonFullSpecs.filter(
    (s) => s.source === 'specDependsOn' || s.source === 'includePattern',
  )
  const group3 = nonFullSpecs.filter((s) => s.source === 'dependsOnTraversal')

  const parts: string[] = []

  if (group1.length > 0) {
    parts.push(
      `Use \`specd changes spec-preview ${changeName} <specId>\` to load the merged full content of any change spec you need.`,
    )
    parts.push('')
    parts.push(renderChangeTable(group1))
  }

  if (group2.length > 0 || group3.length > 0) {
    if (parts.length > 0) {
      parts.push('')
    }
    parts.push(
      'Use `specd specs context <specId>` to load the full optimized context of any listed spec.',
    )
    parts.push('')

    if (group2.length > 0) {
      parts.push(renderChangeTable(group2))
    }

    if (group3.length > 0) {
      if (group2.length > 0) {
        parts.push('')
      }
      parts.push('### Via dependencies')
      parts.push('')
      parts.push(renderChangeTable(group3))
    }
  }

  return `## Available context specs\n\n${parts.join('\n')}`
}

/**
 * Renders a markdown table for change context specs.
 *
 * @param specs - List of spec entries in the group.
 * @returns Markdown table string.
 */
function renderChangeTable(specs: readonly ContextSpecEntry[]): string {
  const isAllList = specs.every((s) => s.mode === 'list')
  const rows: string[] = []
  if (isAllList) {
    rows.push('| Spec ID | Mode | Source |')
    rows.push('|---------|------|--------|')
    for (const s of specs) {
      rows.push(`| ${s.specId} | ${s.mode} | ${s.source} |`)
    }
  } else {
    rows.push('| Spec ID | Mode | Source | Title | Description |')
    rows.push('|---------|------|--------|-------|-------------|')
    for (const s of specs) {
      rows.push(
        `| ${s.specId} | ${s.mode} | ${s.source} | ${s.title ?? '—'} | ${s.description ?? '—'} |`,
      )
    }
  }
  return rows.join('\n')
}

/**
 * Renders non-full specs for project context under `## Available context specs`.
 *
 * @param specs - List of context spec entries.
 * @returns Rendered markdown string for non-full project context specs, or empty string if none exist.
 */
export function renderProjectCatalogue(specs: readonly ContextSpecEntry[]): string {
  const nonFullSpecs = specs.filter((s) => s.mode !== 'full')
  if (nonFullSpecs.length === 0) return ''

  const parts: string[] = [
    'Use `specd specs context <specId>` to load the full optimized context of any listed spec.',
    '',
    renderProjectTable(nonFullSpecs),
  ]

  return `## Available context specs\n\n${parts.join('\n')}`
}

/**
 * Renders a markdown table for project context specs.
 *
 * @param specs - List of spec entries in the group.
 * @returns Markdown table string.
 */
function renderProjectTable(specs: readonly ContextSpecEntry[]): string {
  const isAllList = specs.every((s) => s.mode === 'list')
  const rows: string[] = []
  if (isAllList) {
    rows.push('| Spec ID | Mode |')
    rows.push('|---------|------|')
    for (const s of specs) {
      rows.push(`| ${s.specId} | ${s.mode} |`)
    }
  } else {
    rows.push('| Spec ID | Mode | Title | Description |')
    rows.push('|---------|------|-------|-------------|')
    for (const s of specs) {
      rows.push(`| ${s.specId} | ${s.mode} | ${s.title ?? '—'} | ${s.description ?? '—'} |`)
    }
  }
  return rows.join('\n')
}
