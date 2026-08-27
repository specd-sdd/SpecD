import { type SpecRepository } from '@specd/core'
import { createRelation, type Relation } from '../../domain/value-objects/relation.js'
import { RelationType } from '../../domain/value-objects/relation-type.js'
import { type SymbolNode } from '../../domain/value-objects/symbol-node.js'
import {
  type IndexCoverageDiagnostic,
  type IndexCoverageDiagnosticReason,
} from '../../domain/value-objects/index-result.js'

/** Persisted repository state used to derive canonical implementation links. */
type PersistedSpecState = Awaited<ReturnType<SpecRepository['readPersistedState']>>

/** Canonical implementation-link shape exposed by the Core repository port. */
export type PersistedImplementationLink = NonNullable<PersistedSpecState>['implementation'][number]

/** Inputs required to deterministically project canonical persisted implementation links. */
export interface ProjectSpecCoverageInput {
  readonly specs: readonly {
    readonly specId: string
    readonly implementation: readonly PersistedImplementationLink[]
  }[]
  readonly indexedFilePaths: ReadonlySet<string>
  readonly symbolsByFile: (filePath: string) => readonly SymbolNode[]
  readonly logicalIdByDeclarationSymbolId: ReadonlyMap<string, string>
}

/** Relations and diagnostics produced by one deterministic coverage projection. */
export interface ProjectSpecCoverageResult {
  readonly relations: readonly Relation[]
  readonly diagnostics: readonly IndexCoverageDiagnostic[]
}

/**
 * Projects canonical persisted implementation links against one complete semantic generation.
 * @param input - Prepared specs and complete in-memory semantic lookup state.
 * @returns Deterministically sorted coverage relations and diagnostics.
 */
export function projectSpecCoverage(input: ProjectSpecCoverageInput): ProjectSpecCoverageResult {
  const relations = new Map<string, Relation>()
  const diagnostics: IndexCoverageDiagnostic[] = []

  const addDiagnostic = (
    specId: string,
    filePath: string,
    symbolName: string | undefined,
    reason: IndexCoverageDiagnosticReason,
  ): void => {
    diagnostics.push({
      specId,
      filePath,
      ...(symbolName === undefined ? {} : { symbolName }),
      reason,
    })
  }

  for (const spec of input.specs) {
    for (const link of spec.implementation) {
      if (!input.indexedFilePaths.has(link.file)) {
        if (link.symbols === undefined || link.symbols.length === 0) {
          addDiagnostic(spec.specId, link.file, undefined, 'FILE_NOT_INDEXED')
        } else {
          for (const symbolName of link.symbols) {
            addDiagnostic(spec.specId, link.file, symbolName, 'FILE_NOT_INDEXED')
          }
        }
        continue
      }

      if (link.symbols === undefined || link.symbols.length === 0) {
        const relation = createRelation({
          source: spec.specId,
          target: link.file,
          type: RelationType.CoversFile,
        })
        relations.set(`${relation.source}:${relation.type}:${relation.target}`, relation)
        continue
      }

      for (const symbolName of link.symbols) {
        const logicalIds = new Set(
          input
            .symbolsByFile(link.file)
            .filter((symbol) => symbol.name === symbolName)
            .map((symbol) => input.logicalIdByDeclarationSymbolId.get(symbol.id))
            .filter((logicalId): logicalId is string => logicalId !== undefined),
        )
        if (logicalIds.size === 1) {
          const relation = createRelation({
            source: spec.specId,
            target: [...logicalIds][0]!,
            type: RelationType.CoversSymbol,
          })
          relations.set(`${relation.source}:${relation.type}:${relation.target}`, relation)
        } else {
          addDiagnostic(
            spec.specId,
            link.file,
            symbolName,
            logicalIds.size === 0 ? 'SYMBOL_NOT_FOUND' : 'SYMBOL_AMBIGUOUS',
          )
        }
      }
    }
  }

  return {
    relations: [...relations.values()].sort((left, right) =>
      `${left.source}:${left.type}:${left.target}`.localeCompare(
        `${right.source}:${right.type}:${right.target}`,
      ),
    ),
    diagnostics: diagnostics.sort((left, right) => {
      const leftKey = `${left.specId}:${left.filePath}:${left.symbolName ?? ''}:${left.reason}`
      const rightKey = `${right.specId}:${right.filePath}:${right.symbolName ?? ''}:${right.reason}`
      return leftKey.localeCompare(rightKey)
    }),
  }
}
