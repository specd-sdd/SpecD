import type { GetProjectContextResult } from '@specd/core'
import { renderFullSpecs, renderProjectCatalogue } from './_shared/catalogue.js'

/**
 * Renders agent-facing markdown for project context.
 *
 * @param context - Project context result containing context entries and specs.
 * @returns Agent-facing markdown string for the project context.
 */
export function projectContextToMarkdown(context: GetProjectContextResult): string {
  const parts: string[] = []

  if (context.contextEntries.length > 0) {
    parts.push(...context.contextEntries)
  }

  const fullSpecsBlock = renderFullSpecs(context.specs)
  if (fullSpecsBlock !== '') {
    parts.push(fullSpecsBlock)
  }

  const catalogueBlock = renderProjectCatalogue(context.specs)
  if (catalogueBlock !== '') {
    parts.push(catalogueBlock)
  }

  if (parts.length === 0) {
    return 'no project context configured'
  }

  return parts.join('\n\n---\n\n')
}
