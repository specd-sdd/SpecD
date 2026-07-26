import type { CompileContextResult } from '@specd/core'
import { renderFullSpecs, renderChangeCatalogue } from './_shared/catalogue.js'

/**
 * Options for rendering compiled change context markdown.
 */
export interface ChangeContextToMarkdownOptions {
  /** Name of the change used in spec-preview hints. */
  readonly changeName: string
  /** Whether to emit the fingerprint header line (defaults to true). */
  readonly includeFingerprint?: boolean
}

/**
 * Renders agent-facing markdown for a compiled change context.
 *
 * @param context - Compiled change context result.
 * @param options - Presentation options including change name and fingerprint preference.
 * @returns Agent-facing markdown string for the change context.
 */
export function changeContextToMarkdown(
  context: CompileContextResult,
  options: ChangeContextToMarkdownOptions,
): string {
  const includeFingerprint = options.includeFingerprint ?? true

  if (context.status === 'unchanged') {
    const parts: string[] = []
    if (includeFingerprint) {
      parts.push(`Context Fingerprint: ${context.contextFingerprint}`)
    }
    parts.push('Context unchanged since last call.')
    return parts.join('\n\n')
  }

  const parts: string[] = []

  if (includeFingerprint) {
    parts.push(`Context Fingerprint: ${context.contextFingerprint}`)
  }

  for (const entry of context.projectContext) {
    if (entry.source === 'file' && entry.path !== undefined) {
      parts.push(`**Source: ${entry.path}**\n\n${entry.content}`)
    } else {
      parts.push(`**Source: instruction**\n\n${entry.content}`)
    }
  }

  const fullSpecsBlock = renderFullSpecs(context.specs)
  if (fullSpecsBlock !== '') {
    parts.push(fullSpecsBlock)
  }

  const catalogueBlock = renderChangeCatalogue(context.specs, options.changeName)
  if (catalogueBlock !== '') {
    parts.push(catalogueBlock)
  }

  return parts.join('\n\n---\n\n')
}
