import { type GetChangeArtifactResult, type SaveChangeArtifactResult } from '@specd/core'
import { type ArtifactContentDto } from '../dto/artifact-content.js'

/**
 * Maps get-artifact result to DTO.
 * @param result
 */
export function toArtifactContentDto(result: GetChangeArtifactResult): ArtifactContentDto {
  return {
    content: result.content,
    originalHash: result.originalHash,
  }
}

/**
 * Maps save-artifact result to DTO.
 * @param content
 * @param result
 */
export function toSaveArtifactContentDto(
  content: string,
  result: SaveChangeArtifactResult,
): ArtifactContentDto {
  return {
    content,
    originalHash: result.contentHash,
    contentHash: result.contentHash,
    updatedAt: result.updatedAt,
  }
}
