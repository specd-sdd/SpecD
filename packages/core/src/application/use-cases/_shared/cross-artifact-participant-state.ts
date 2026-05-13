import { type SelectorNode } from '../../../domain/services/selector-matching.js'
import { type RuleEvaluatorParser } from '../../../domain/services/rule-evaluator.js'
import { type Change } from '../../../domain/entities/change.js'
import { type ChangeRepository } from '../../ports/change-repository.js'
import { type SpecRepository } from '../../ports/spec-repository.js'
import { type ArtifactParserRegistry } from '../../ports/artifact-parser.js'
import { type Schema } from '../../../domain/value-objects/schema.js'
import { expectedArtifactFilename } from '../../../domain/services/artifact-filename.js'
import { type ArtifactType } from '../../../domain/value-objects/artifact-type.js'
import { SpecPath } from '../../../domain/value-objects/spec-path.js'
import { inferFormat } from '../../../domain/services/format-inference.js'
import * as path from 'node:path'

/** Parsed artifact output eligible for cross-artifact rule evaluation. */
export interface ReadyArtifactParticipant {
  readonly artifactId: string
  readonly key: string
  readonly scope: 'spec' | 'change'
  readonly root: SelectorNode
  readonly parser: RuleEvaluatorParser
  readonly filename: string
}

/** Input for {@link rehydrateReadyArtifactParticipant}. */
export interface RehydrateReadyArtifactParticipantInput {
  readonly change: Change
  readonly artifactType: ArtifactType
  readonly fileKey: string
  readonly workspace: string
  readonly capabilityPath: string
  readonly specExists: boolean
  readonly changes: ChangeRepository
  readonly specs: ReadonlyMap<string, SpecRepository>
  readonly parsers: ArtifactParserRegistry
  readonly schema: Schema
}

/**
 * Reads a direct artifact file from the change repository for rehydration.
 *
 * @param input - Rehydration context
 * @param validationFilename - The expected filename to load
 * @returns The file content, or `null` if unavailable
 */
async function resolveRehydratedContent(
  input: RehydrateReadyArtifactParticipantInput,
  validationFilename: string,
): Promise<string | null> {
  const rawFile = await input.changes.artifact(input.change, validationFilename)
  if (rawFile !== null) return rawFile.content

  return null
}

/**
 * Loads a delta file and merges it with the base artifact for rehydration.
 *
 * @param input - Rehydration context
 * @param validationFilename - The expected delta filename to load
 * @returns The merged content, or `null` if any step fails
 */
async function resolveDeltaMergedContent(
  input: RehydrateReadyArtifactParticipantInput,
  validationFilename: string,
): Promise<string | null> {
  const specRepo = input.specs.get(input.workspace)
  if (specRepo === undefined) return null

  const specPath = SpecPath.parse(input.capabilityPath)
  const spec = await specRepo.get(specPath)
  if (spec === null) return null

  const outputBasename = path.basename(input.artifactType.output)
  const baseArtifact = await specRepo.artifact(spec, outputBasename)
  if (baseArtifact === null) return null

  const deltaFile = await input.changes.artifact(input.change, validationFilename)
  if (deltaFile === null) return null

  const format = input.artifactType.format ?? inferFormat(outputBasename)
  const parser = format !== undefined ? input.parsers.get(format) : undefined
  const yamlParser = input.parsers.get('yaml')
  if (parser === undefined || yamlParser === undefined) return null

  const baseAST = parser.parse(baseArtifact.content)
  const deltaEntries = yamlParser.parseDelta(deltaFile.content)
  const mergedResult = parser.apply(baseAST, deltaEntries)
  return parser.serialize(mergedResult.ast)
}

/**
 * Reloads and parses an already-`complete` participant so cross-artifact
 * validation can reuse it in a later invocation.
 *
 * @param input - Rehydration context including change, artifact type, repositories, and parsers
 * @returns A ready participant, or `null` if rehydration is not possible
 */
export async function rehydrateReadyArtifactParticipant(
  input: RehydrateReadyArtifactParticipantInput,
): Promise<ReadyArtifactParticipant | null> {
  const { change, artifactType, fileKey, specExists, parsers } = input

  const changeArtifact = change.getArtifact(artifactType.id)
  if (changeArtifact === null) return null

  const trackedFile = changeArtifact.getFile(fileKey)
  if (trackedFile === undefined || trackedFile.status !== 'complete') return null

  const expectedFilename = expectedArtifactFilename({
    artifactType,
    key: fileKey,
    ...(artifactType.scope === 'spec' ? { specExists } : {}),
  })

  const validationFilename =
    trackedFile.validatedHash !== undefined &&
    !isSameRepresentation(trackedFile.filename, expectedFilename)
      ? expectedFilename
      : trackedFile.filename

  const isDelta =
    artifactType.delta && artifactType.scope === 'spec' && isDeltaFilename(validationFilename)

  let content: string | null

  if (isDelta) {
    content = await resolveDeltaMergedContent(input, validationFilename)
  } else {
    content = await resolveRehydratedContent(input, validationFilename)
  }

  if (content === null) return null

  const outputBasename = path.basename(artifactType.output)
  const format = artifactType.format ?? inferFormat(outputBasename)
  const parser = format !== undefined ? parsers.get(format) : undefined
  if (parser === undefined) return null

  const ast = parser.parse(content)

  return {
    artifactId: artifactType.id,
    key: fileKey,
    scope: artifactType.scope,
    root: ast.root,
    parser,
    filename: validationFilename,
  }
}

/**
 * Returns whether a tracked change-artifact filename is delta-backed.
 *
 * @param filename - Change-directory filename to check
 * @returns `true` when the filename lives under `deltas/`
 */
function isDeltaFilename(filename: string): boolean {
  return filename.startsWith('deltas/')
}

/**
 * Checks whether two filenames are both delta or both direct representations.
 *
 * @param a - First filename
 * @param b - Second filename
 * @returns `true` when both are delta or both are direct
 */
function isSameRepresentation(a: string, b: string): boolean {
  return isDeltaFilename(a) === isDeltaFilename(b)
}
