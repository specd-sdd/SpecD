import { type SpecPath } from '../../../domain/value-objects/spec-path.js'
import { type Schema } from '../../../domain/value-objects/schema.js'
import { inferFormat } from '../../../domain/services/format-inference.js'
import {
  extractMetadata,
  type ExtractedMetadata,
  type ExtractorTransformRegistry,
  type SubtreeRenderer,
} from '../../../domain/services/extract-metadata.js'
import { type SelectorNode } from '../../../domain/services/selector-matching.js'
import { type ArtifactParserRegistry } from '../../ports/artifact-parser.js'
import { type ContentHasher } from '../../ports/content-hasher.js'
import { type SpecRepository } from '../../ports/spec-repository.js'
import { createExtractorTransformContext } from './extractor-transform-context.js'
import { createSpecReferenceResolver, type SpecWorkspaceRoute } from './spec-reference-resolver.js'

/**
 * Resolved artifact content used as input for metadata extraction.
 */
export interface MetadataArtifactInput {
  /** Schema artifact id for the content (for example `spec` or `verify`). */
  readonly artifactId: string
  /** Concrete filename for the artifact content. */
  readonly filename: string
  /** Full artifact content to parse. */
  readonly content: string
  /** Optional explicit format override. */
  readonly format: string | undefined
}

/**
 * Input for extracting metadata from an already-resolved set of spec artifacts.
 */
export interface ExtractMetadataFromSpecArtifactsInput {
  /** Effective schema governing the spec whose artifacts are being extracted. */
  readonly effectiveSpecSchema: Schema
  /** Workspace owning the spec. */
  readonly workspace: string
  /** Logical spec path inside the workspace. */
  readonly specPath: SpecPath
  /** Resolved artifact contents to parse and extract from. */
  readonly artifacts: readonly MetadataArtifactInput[]
  /** Registry of artifact parsers keyed by format. */
  readonly parsers: ArtifactParserRegistry
  /** Shared extractor transform registry. */
  readonly extractorTransforms: ExtractorTransformRegistry
  /** Repository map used by built-in transforms such as `resolveSpecPath`. */
  readonly repositories: ReadonlyMap<string, SpecRepository>
  /** Workspace routing metadata for cross-workspace reference resolution. */
  readonly workspaceRoutes: readonly SpecWorkspaceRoute[]
  /** Optional content hasher for callers that need `contentHashes`. */
  readonly hasher?: ContentHasher
  /** Optional extraction filter for a single artifact id. */
  readonly targetArtifactId?: string
}

/**
 * Result of extracting metadata from resolved spec artifact content.
 */
export interface ExtractMetadataFromSpecArtifactsResult {
  /** Whether the effective schema declared `metadataExtraction`. */
  readonly hasExtraction: boolean
  /** Extracted metadata fields. */
  readonly metadata: ExtractedMetadata
  /** Optional content hashes keyed by filename. */
  readonly contentHashes: Readonly<Record<string, string>>
}

/**
 * Extracts metadata from an already-resolved set of spec artifacts.
 *
 * The helper owns the repeated preparation pipeline used across multiple use
 * cases: parser lookup, AST construction, subtree renderers, transform context
 * creation, `extractMetadata(...)`, and optional `contentHashes` calculation.
 *
 * @param input - Extraction inputs for one logical spec
 * @returns Extracted metadata plus optional content hashes
 */
export async function extractMetadataFromSpecArtifacts(
  input: ExtractMetadataFromSpecArtifactsInput,
): Promise<ExtractMetadataFromSpecArtifactsResult> {
  const extraction = input.effectiveSpecSchema.metadataExtraction()
  if (extraction === undefined) {
    return { hasExtraction: false, metadata: {}, contentHashes: {} }
  }

  const astsByArtifact = new Map<string, { root: SelectorNode }>()
  const renderers = new Map<string, SubtreeRenderer>()
  const transformContexts = new Map<string, ReturnType<typeof createExtractorTransformContext>>()
  const contentHashes: Record<string, string> = {}
  const resolveSpecReference = createSpecReferenceResolver({
    originWorkspace: input.workspace,
    originSpecPath: input.specPath,
    repositories: input.repositories,
    workspaceRoutes: input.workspaceRoutes,
  })

  for (const artifact of input.artifacts) {
    const schemaArtifact = input.effectiveSpecSchema.artifact(artifact.artifactId)
    const format =
      artifact.format ?? schemaArtifact?.format ?? inferFormat(artifact.filename) ?? 'plaintext'
    const parser = input.parsers.get(format)
    if (parser === undefined) continue

    const ast = parser.parse(artifact.content)
    astsByArtifact.set(artifact.artifactId, ast)
    renderers.set(artifact.artifactId, parser as SubtreeRenderer)
    transformContexts.set(
      artifact.artifactId,
      createExtractorTransformContext(
        input.workspace,
        input.specPath.toString(),
        artifact.artifactId,
        artifact.filename,
        { resolveSpecReference },
      ),
    )

    if (input.hasher !== undefined) {
      contentHashes[artifact.filename] = input.hasher.hash(artifact.content)
    }
  }

  const metadata = await extractMetadata(
    extraction,
    astsByArtifact,
    renderers,
    input.extractorTransforms,
    transformContexts,
    input.targetArtifactId,
  )

  return {
    hasExtraction: true,
    metadata,
    contentHashes,
  }
}
