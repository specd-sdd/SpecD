import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SkillTemplateMetadata } from '../../domain/skill-template-metadata.js'
import { InvalidSkillTemplateMetadataError } from '../../domain/errors/invalid-skill-template-metadata-error.js'

/**
 * Reads and validates `skill.meta.json` files.
 */
export class SkillTemplateMetadataReader {
  /**
   * Reads one skill metadata file from a template directory.
   *
   * @param directory - Absolute skill template directory.
   * @param kind - Template kind to determine filename.
   * @returns Validated metadata contract.
   * @throws {InvalidSkillTemplateMetadataError} When the metadata file is missing or malformed.
   */
  async readSkillMetadata(
    directory: string,
    kind: 'skill' | 'agent' = 'skill',
  ): Promise<SkillTemplateMetadata> {
    const metaFilename = kind === 'skill' ? 'skill.meta.json' : 'specd-agent.meta.json'
    const filename = path.join(directory, metaFilename)
    let raw: string
    try {
      raw = await readFile(filename, 'utf8')
    } catch (error) {
      throw new InvalidSkillTemplateMetadataError(
        filename,
        `file could not be read: ${(error as Error).message}`,
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw) as unknown
    } catch (error) {
      throw new InvalidSkillTemplateMetadataError(
        filename,
        `file is not valid JSON: ${(error as Error).message}`,
      )
    }

    return this.validateMetadata(filename, parsed, kind)
  }

  /**
   * Validates unknown parsed metadata into the canonical contract.
   *
   * @param filename - Source metadata filename.
   * @param value - Parsed JSON value.
   * @param kind - Template kind.
   * @returns Validated metadata object.
   * @throws {InvalidSkillTemplateMetadataError} When validation fails.
   */
  private validateMetadata(
    filename: string,
    value: unknown,
    kind: 'skill' | 'agent',
  ): SkillTemplateMetadata {
    if (!this.isRecord(value)) {
      throw new InvalidSkillTemplateMetadataError(filename, 'root value must be an object')
    }

    return {
      kind,
      supportedCapabilities: this.readStringArray(
        value['supportedCapabilities'],
        filename,
        'supportedCapabilities',
      ),
      requiredCapabilities: this.readStringArray(
        value['requiredCapabilities'],
        filename,
        'requiredCapabilities',
      ),
      requiredSharedTemplates: this.readStringArray(
        value['requiredSharedTemplates'],
        filename,
        'requiredSharedTemplates',
      ),
      name: typeof value['name'] === 'string' ? value['name'] : undefined,
      description: typeof value['description'] === 'string' ? value['description'] : undefined,
      allowedTools:
        value['allowedTools'] !== undefined
          ? this.readStringArray(value['allowedTools'], filename, 'allowedTools')
          : undefined,
      model: typeof value['model'] === 'string' ? value['model'] : undefined,
    }
  }

  /**
   * Validates that a metadata property is an array of strings.
   *
   * @param value - Candidate property value.
   * @param filename - Source metadata filename.
   * @param field - Metadata field name.
   * @returns Validated readonly string array.
   * @throws {InvalidSkillTemplateMetadataError} When validation fails.
   */
  private readStringArray(value: unknown, filename: string, field: string): readonly string[] {
    if (!Array.isArray(value)) {
      throw new InvalidSkillTemplateMetadataError(filename, `${field} must be an array`)
    }

    const strings = value.filter((entry): entry is string => typeof entry === 'string')
    if (strings.length !== value.length) {
      throw new InvalidSkillTemplateMetadataError(filename, `${field} must contain only strings`)
    }

    return strings
  }

  /**
   * Checks whether a parsed JSON value is a plain record.
   *
   * @param value - Candidate value.
   * @returns `true` when the value is a non-null object.
   */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
