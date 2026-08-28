import { isCancel, multiselect, log } from '@clack/prompts'
import chalk from 'chalk'

/**
 * Interface representing a candidate implementation suggestion item for prompt selection.
 */
export interface CandidateImplementationItem {
  readonly file: string
  readonly symbols: readonly string[]
  readonly confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  readonly alreadyIncluded: boolean
}

/**
 * Interface representing a candidate spec dependency item for prompt selection.
 */
export interface CandidateSpecDepItem {
  readonly specId: string
  readonly title?: string
  readonly reason: string
  readonly alreadyIncluded?: boolean
}

/**
 * Options for configuring interactive prompt display.
 */
export interface PromptApplyOptions {
  /**
   * Whether another specification follows in the interactive iteration.
   * When true, renders "enter: confirm and next spec"; otherwise renders "enter: confirm".
   */
  readonly hasNext?: boolean
  /** Existing implementation files already registered in spec-lock.json for this spec. */
  readonly existingFiles?: readonly string[]
  /** Existing dependencies already registered in spec-lock.json for this spec. */
  readonly existingDependsOn?: readonly string[]
}

/**
 * Interactively prompts the user to select which implementation links to apply for a specification.
 *
 * @param specId - Canonical specification ID
 * @param suggestions - Discovered implementation candidate suggestions
 * @param options - Prompt configuration options
 * @returns Array of selected items, or null if the user cancelled the prompt
 */
export async function promptSelectImplementationLinks<T extends CandidateImplementationItem>(
  specId: string,
  suggestions: readonly T[],
  options?: PromptApplyOptions,
): Promise<readonly T[] | null> {
  const existingFiles = options?.existingFiles ?? []
  const alreadyIncludedInSuggestions = suggestions.filter((s) => s.alreadyIncluded)
  const newCandidates = suggestions.filter((s) => !s.alreadyIncluded)

  const existingMap = new Map<string, T | null>()
  for (const f of existingFiles) {
    existingMap.set(f, null)
  }
  for (const s of alreadyIncludedInSuggestions) {
    existingMap.set(s.file, s)
  }

  if (existingMap.size === 0 && newCandidates.length === 0) {
    return []
  }

  if (existingMap.size > 0) {
    const lines = Array.from(existingMap.entries()).map(([file, item]) => {
      if (item) {
        const syms = item.symbols.length > 0 ? ` [${item.symbols.join(', ')}]` : ''
        return `[already included] [${item.confidence}] ${item.file}${syms}`
      }
      return `[already included] ${file}`
    })
    log.info(
      wrapForClack(
        `Existing implementation links for [${chalk.bold(specId)}]:\n${lines.map((l) => `  • ${l}`).join('\n')}`,
      ),
    )
  }

  if (newCandidates.length === 0) {
    return []
  }

  const selectOptions = newCandidates.map((c, index) => {
    const syms = c.symbols.length > 0 ? ` [${c.symbols.join(', ')}]` : ''
    return {
      value: String(index),
      label: `[${c.confidence}] ${c.file}${syms}`,
    }
  })

  const initialValues = newCandidates
    .map((c, index) => (c.confidence === 'HIGH' ? String(index) : null))
    .filter((idx): idx is string => idx !== null)

  const actionHint = options?.hasNext ? 'enter: confirm and next spec' : 'enter: confirm'

  const selection = await multiselect({
    message: `Select candidate implementation links to apply for [${chalk.bold(specId)}]:\n\n   (space: toggle, ${actionHint}, ctrl+c: abort)\n`,
    options: selectOptions,
    initialValues,
    required: false,
  })

  if (isCancel(selection)) {
    return null
  }

  const selectedIndices = new Set(selection)
  return newCandidates.filter((_, index) => selectedIndices.has(String(index)))
}

/**
 * Interactively prompts the user to select which spec dependencies to apply for a specification.
 *
 * @param specId - Canonical specification ID
 * @param suggestions - Deduced spec dependency suggestions
 * @param options - Prompt configuration options
 * @returns Array of selected items, or null if the user cancelled the prompt
 */
export async function promptSelectSpecDependencies<T extends CandidateSpecDepItem>(
  specId: string,
  suggestions: readonly T[],
  options?: PromptApplyOptions,
): Promise<readonly T[] | null> {
  const existingDependsOn = options?.existingDependsOn ?? []
  const alreadyIncludedInSuggestions = suggestions.filter((s) => s.alreadyIncluded)
  const newCandidates = suggestions.filter((s) => !s.alreadyIncluded)

  const existingSet = new Set(existingDependsOn)
  for (const s of alreadyIncludedInSuggestions) {
    existingSet.add(s.specId)
  }

  if (existingSet.size === 0 && newCandidates.length === 0) {
    return []
  }

  if (existingSet.size > 0) {
    const lines = Array.from(existingSet).map((depSpecId) => {
      const matchingSug = suggestions.find((s) => s.specId === depSpecId)
      const reasonStr = matchingSug?.reason ? ` — ${matchingSug.reason}` : ''
      return `[already included] ${depSpecId}${reasonStr}`
    })
    log.info(
      wrapForClack(
        `Existing dependencies for [${chalk.bold(specId)}]:\n${lines.map((l) => `  • ${l}`).join('\n')}`,
      ),
    )
  }

  if (newCandidates.length === 0) {
    return []
  }

  const selectOptions = newCandidates.map((c, index) => ({
    value: String(index),
    label: `${c.specId} — ${c.reason}`,
  }))

  const actionHint = options?.hasNext ? 'enter: confirm and next spec' : 'enter: confirm'

  const selection = await multiselect({
    message: `Select candidate dependencies to apply for [${chalk.bold(specId)}]:\n\n   (space: toggle, ${actionHint}, ctrl+c: abort)\n`,
    options: selectOptions,
    required: false,
  })

  if (isCancel(selection)) {
    return null
  }

  const selectedIndices = new Set(selection)
  return newCandidates.filter((_, index) => selectedIndices.has(String(index)))
}

/**
 * Strips ANSI styling escape sequences when measuring visible string length.
 *
 * @param str - Input string containing ANSI escape codes
 * @returns Plain text string without ANSI escape codes
 */
function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '')
}

/**
 * Wraps text so that no individual line exceeds `maxWidth` characters,
 * preserving leading indentation on wrapped continuation lines.
 *
 * Defaults to `process.stdout.columns - 8` (minimum 40) or 80 if unavailable,
 * guaranteeing that Clack's left border (`│  `) is prepended to every visual
 * line without the terminal breaking the column flow.
 *
 * @param text - Text string containing zero or more lines
 * @param maxWidth - Optional maximum line width
 * @returns Wrapped text with soft line breaks
 */
export function wrapForClack(text: string, maxWidth?: number): string {
  const width =
    maxWidth ??
    (typeof process !== 'undefined' && process.stdout?.columns
      ? Math.max(40, process.stdout.columns - 8)
      : 80)

  return text
    .split('\n')
    .map((line) => {
      if (stripAnsi(line).length <= width) {
        return line
      }

      const match = line.match(/^(\s*)/)
      const leadingSpaces = match ? match[1]! : ''
      const continuationIndent = leadingSpaces + '    '
      const continuationPrefix = continuationIndent + '... '

      const words = line.trimStart().split(/\s+/)
      const wrapped: string[] = []
      let current = leadingSpaces

      for (const word of words) {
        if (!word) continue
        const isLineStart = current === leadingSpaces || current === continuationPrefix

        if (isLineStart) {
          current += word
        } else if (stripAnsi(current).length + 1 + stripAnsi(word).length + 4 <= width) {
          current += ' ' + word
        } else {
          wrapped.push(current + ' ...')
          current = continuationPrefix + word
        }
      }

      if (current.trim().length > 0) {
        wrapped.push(current)
      }

      return wrapped.join('\n')
    })
    .join('\n')
}
