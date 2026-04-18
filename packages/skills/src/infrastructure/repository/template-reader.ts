import { readFile } from 'node:fs/promises'
import type { SkillTemplate } from '../../domain/skill.js'

/**
 * Lazily-loaded template implementation backed by a file path.
 */
class FileSkillTemplate implements SkillTemplate {
  /**
   * Creates a file-backed template.
   *
   * @param filename - Template filename.
   * @param filePath - Absolute template file path.
   */
  constructor(
    readonly filename: string,
    private readonly filePath: string,
  ) {}

  /**
   * Reads template content from disk on demand.
   *
   * @returns Template content.
   */
  async getContent(): Promise<string> {
    return readFile(this.filePath, 'utf8')
  }
}

/**
 * Creates file-backed lazy templates from path metadata.
 */
export class TemplateReader {
  /**
   * Creates a single lazy template instance.
   *
   * @param filename - Template filename.
   * @param filePath - Absolute template file path.
   * @returns Lazy template object.
   */
  createTemplate(filename: string, filePath: string): SkillTemplate {
    return new FileSkillTemplate(filename, filePath)
  }
}
