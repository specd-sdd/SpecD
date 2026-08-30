import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Root, Heading, Code, InlineCode, Node } from 'mdast'

/**
 * Result of classifying symbols from specification markdown.
 */
export interface ClassifiedSpecSymbols {
  readonly ownedSymbols: readonly string[]
  readonly referencedSymbols: readonly string[]
  readonly primaryOwnerSymbol: string | null
  readonly isComplete: boolean
  readonly completenessIssues: readonly string[]
}

/**
 * Converts a kebab-case or colon-separated spec identifier into PascalCase.
 *
 * @param specId - Spec ID (e.g. 'core:create-change' or 'create-change').
 * @returns PascalCase name (e.g. 'CreateChange').
 */
function toPascalCase(specId: string): string {
  const clean = specId.includes(':') ? specId.split(':')[1] || specId : specId
  return clean
    .split(/[-_/\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Extracts plain text recursively from an AST node.
 *
 * @param node - Any mdast Node (heading, paragraph, text, code, etc.)
 * @returns Concatenated plain-text string from the node and its descendants
 */
function extractNodeText(node: Node): string {
  if ('value' in node && typeof (node as { value: unknown }).value === 'string') {
    return (node as { value: string }).value
  }
  if ('children' in node && Array.isArray((node as { children: unknown[] }).children)) {
    return (node as { children: Node[] }).children.map(extractNodeText).join(' ')
  }
  return ''
}

/**
 * Pure domain service for classifying symbols into owned vs referenced symbols
 * and auditing specification implementation completeness.
 */
export class SpecSymbolClassifier {
  /**
   * Analyzes markdown spec content and classifies extracted symbols.
   *
   * @param specContent - The full Markdown text of the spec document(s).
   * @param specId - Canonical spec identifier (e.g. 'core:create-change').
   * @param existingLinkedSymbols - Currently linked AST symbols from spec-lock (if any).
   * @param existingLinkedFiles - Currently linked file paths from spec-lock (if any).
   * @returns Classified symbol breakdown with completeness status.
   */
  static classify(
    specContent: string,
    specId: string,
    existingLinkedSymbols: readonly string[] = [],
    existingLinkedFiles: readonly string[] = [],
  ): ClassifiedSpecSymbols {
    const ownedSymbols = new Set<string>()
    const referencedSymbols = new Set<string>()
    const completenessIssues: string[] = []

    const pascalSpecId = toPascalCase(specId)
    if (pascalSpecId.length > 0) {
      ownedSymbols.add(pascalSpecId)
      // Also add stem without UseCase, Service, Repository, Port, Adapter
      const strippedStem = pascalSpecId.replace(
        /(?:UseCase|Service|Repository|Port|Adapter|LanguageAdapter)$/,
        '',
      )
      if (strippedStem.length > 2) {
        ownedSymbols.add(strippedStem)
      }
    }

    let primaryOwnerSymbol: string | null = pascalSpecId.length > 0 ? pascalSpecId : null

    let ast: Root
    try {
      ast = fromMarkdown(specContent)
    } catch {
      return {
        ownedSymbols: [...ownedSymbols],
        referencedSymbols: [],
        primaryOwnerSymbol,
        isComplete: existingLinkedFiles.length > 0,
        completenessIssues: ['Spec content could not be parsed as valid markdown'],
      }
    }

    const currentSectionPath: string[] = []

    const visit = (node: Node) => {
      if (node.type === 'heading') {
        const heading = node as Heading
        const text = extractNodeText(heading).trim()
        const depth = heading.depth
        while (currentSectionPath.length >= depth) {
          currentSectionPath.pop()
        }
        currentSectionPath.push(text)

        // Extract potential symbol names from heading text (e.g. "### Requirement: DetectOverlap use case")
        const headingWords = text.match(/\b[A-Za-z][A-Za-z0-9_]{2,}\b/g)
        if (headingWords) {
          for (const word of headingWords) {
            if (
              /^(?:Requirement|Verification|Scenario|Purpose|Requirements|Context|Rules|Given|When|Then|And)$/i.test(
                word,
              )
            ) {
              continue
            }
            if (
              /^[A-Z]/.test(word) ||
              /^(?:create|detect|get|list|index|search|parse|extract|validate|update|archive|apply)/.test(
                word,
              )
            ) {
              if (currentSectionPath.some((s) => /spec dependencies/i.test(s))) {
                referencedSymbols.add(word)
              } else {
                ownedSymbols.add(word)
              }
            }
          }
        }
      }

      const inDependenciesSection = currentSectionPath.some((s) => /spec dependencies/i.test(s))
      const inContractOrInterfaceSection = currentSectionPath.some((s) =>
        /contract|interface|use case|purpose|requirements|declaration/i.test(s),
      )

      if (node.type === 'code') {
        const codeNode = node as Code
        const codeText = codeNode.value

        // Extract class, interface, type, enum, function, const declarations
        const declMatches = codeText.matchAll(
          /(?:export\s+)?(?:class|interface|type|enum|function|const)\s+([a-zA-Z][a-zA-Z0-9_]*)/g,
        )
        for (const match of declMatches) {
          const symbolName = match[1]
          if (symbolName && symbolName.length > 2) {
            if (inDependenciesSection) {
              referencedSymbols.add(symbolName)
            } else {
              ownedSymbols.add(symbolName)
              if (/^[A-Z]/.test(symbolName)) {
                // If it's a structure or class, extract its base stem (e.g. LoadPluginInput -> LoadPlugin)
                const baseStem = symbolName.replace(
                  /(?:Input|Output|Result|Deps|Options|Config|Error|Props|Manifest|Report)$/,
                  '',
                )
                if (baseStem.length > 2) {
                  ownedSymbols.add(baseStem)
                }
              }
              if (!primaryOwnerSymbol || symbolName === pascalSpecId) {
                primaryOwnerSymbol = symbolName
              }
            }
          }
        }

        // Extract constructor parameter types or ports (referenced)
        const constructorMatches = codeText.matchAll(/constructor\s*\([^)]*\)/gs)
        for (const cMatch of constructorMatches) {
          const cBody = cMatch[0]
          const paramTypeMatches = cBody.matchAll(/:\s*([A-Z][a-zA-Z0-9_]*)/g)
          for (const pMatch of paramTypeMatches) {
            const pType = pMatch[1]
            if (pType && !ownedSymbols.has(pType)) {
              referencedSymbols.add(pType)
            }
          }
        }
      }

      if (node.type === 'inlineCode') {
        const inlineText = (node as InlineCode).value.trim()
        if (/^[a-zA-Z][a-zA-Z0-9_]{2,}$/.test(inlineText)) {
          if (inDependenciesSection) {
            referencedSymbols.add(inlineText)
          } else if (inContractOrInterfaceSection) {
            ownedSymbols.add(inlineText)
            const baseStem = inlineText.replace(
              /(?:Input|Output|Result|Deps|Options|Config|Error|Props|Manifest|Report|UseCase|Service|Repository|Port)$/,
              '',
            )
            if (baseStem.length > 2) {
              ownedSymbols.add(baseStem)
            }
          }
        }
      }

      if ('children' in node && Array.isArray((node as { children: unknown[] }).children)) {
        for (const child of (node as { children: Node[] }).children) {
          visit(child)
        }
      }
    }

    visit(ast)

    // Remove any owned symbols that were accidentally added to referenced
    for (const owned of ownedSymbols) {
      referencedSymbols.delete(owned)
    }

    // Evaluate completeness
    if (existingLinkedFiles.length === 0) {
      completenessIssues.push('Spec has no implementation file links')
    }

    if (existingLinkedSymbols.length > 0 && primaryOwnerSymbol) {
      const hasPrimary = existingLinkedSymbols.some(
        (sym) =>
          sym === primaryOwnerSymbol || sym.toLowerCase() === primaryOwnerSymbol!.toLowerCase(),
      )
      if (!hasPrimary) {
        completenessIssues.push(
          `Primary owner symbol '${primaryOwnerSymbol}' is missing from linked symbols`,
        )
      }
    }

    const isComplete = completenessIssues.length === 0 && existingLinkedFiles.length > 0

    return {
      ownedSymbols: [...ownedSymbols].sort(),
      referencedSymbols: [...referencedSymbols].sort(),
      primaryOwnerSymbol,
      isComplete,
      completenessIssues,
    }
  }
}
