import { type GetChangeArtifactResult, type SaveChangeArtifactResult } from '@specd/core'
import { type ArtifactContentDto } from '../dto/artifact-content.js'

/**
 * Maps get-artifact result to DTO.
 * @param filename
 * @param result
 */
export function toArtifactContentDto(
  filename: string,
  result: GetChangeArtifactResult,
): ArtifactContentDto {
  return {
    filename,
    content: result.content,
    originalHash: result.originalHash,
  }
}

/**
 * Maps save-artifact result to DTO.
 * @param filename
 * @param content
 * @param result
 */
export function toSaveArtifactContentDto(
  filename: string,
  content: string,
  result: SaveChangeArtifactResult,
): ArtifactContentDto {
  return {
    filename,
    content,
    originalHash: result.contentHash,
    contentHash: result.contentHash,
    updatedAt: result.updatedAt,
  }
}
