import { mkdir, rm, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { SharedFile, SkillRepository } from '../../application/ports/skill-repository.js'
import type { Skill } from '../../domain/skill.js'
import type { ResolvedFile, SkillBundle } from '../../domain/skill-bundle.js'
import { TemplateReader } from './template-reader.js'

/**
 * Repository configuration for template resolution.
 */
export interface SkillRepositoryOptions {
  /**
   * Absolute templates root directory.
   */
  readonly templatesRoot?: string
}

/**
 * Skill-bundle implementation backed by resolved in-memory files.
 */
class ResolvedSkillBundle implements SkillBundle {
  /**
   * Creates a resolved bundle.
   *
   * @param name - Skill name.
   * @param description - Skill description.
   * @param files - Resolved files.
   */
  constructor(
    readonly name: string,
    readonly description: string,
    readonly files: readonly ResolvedFile[],
  ) {}

  /**
   * Installs bundle files into a target directory.
   *
   * @param targetDir - Target directory path.
   * @returns A promise that resolves after all writes complete.
   */
  async install(targetDir: string): Promise<void> {
    await mkdir(targetDir, { recursive: true })

    for (const file of this.files) {
      const outputPath = path.join(targetDir, file.filename)
      await writeFile(outputPath, file.content, 'utf8')
    }
  }

  /**
   * Uninstalls bundle files from a target directory.
   *
   * @param targetDir - Target directory path.
   * @returns A promise that resolves after best-effort cleanup.
   */
  async uninstall(targetDir: string): Promise<void> {
    for (const file of this.files) {
      const outputPath = path.join(targetDir, file.filename)
      try {
        await rm(outputPath, { force: true })
      } catch {
        // Idempotent uninstall: missing/unremovable files should not fail the entire operation.
      }
    }
  }
}

/**
 * Filesystem implementation of `SkillRepository`.
 */
class FsSkillRepository implements SkillRepository {
  /**
   * Creates an fs-backed repository.
   *
   * @param templatesRoot - Absolute templates root.
   * @param templateReader - Lazy template reader.
   */
  constructor(
    private readonly templatesRoot: string,
    private readonly templateReader: TemplateReader,
  ) {}

  /**
   * Lists all skills under the templates root.
   *
   * @returns Skill metadata list.
   */
  list(): readonly Skill[] {
    const entries = readdirSync(this.templatesRoot, { withFileTypes: true })
    const dirs = entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
      .map((entry) => entry.name)
      .sort()

    const skills: Skill[] = []
    for (const dirName of dirs) {
      const templates = this.readTemplates(dirName)
      skills.push({
        name: dirName,
        description: `Skill '${dirName}'`,
        templates,
      })
    }

    return skills
  }

  /**
   * Gets one skill by name.
   *
   * @param name - Skill name.
   * @returns Skill metadata or undefined.
   */
  get(name: string): Skill | undefined {
    const all = this.list()
    return all.find((skill) => skill.name === name)
  }

  /**
   * Resolves one skill to a concrete install bundle.
   *
   * @param name - Skill name.
   * @param variables - Placeholder variables.
   * @returns Resolved install bundle.
   */
  getBundle(name: string, variables: Readonly<Record<string, string>> = {}): SkillBundle {
    const skill = this.get(name)
    if (skill === undefined) {
      throw new Error(`Skill '${name}' was not found`)
    }

    const files: ResolvedFile[] = []
    const included = new Set<string>()
    for (const template of skill.templates) {
      included.add(template.filename)
      const content = readFileSync(path.join(this.templatesRoot, name, template.filename), 'utf8')
      files.push({
        filename: template.filename,
        content: applyVariables(content, variables),
      })
    }

    const sharedFiles = this.listSharedFiles()
    for (const shared of sharedFiles) {
      if (!shared.skills.includes(name) || included.has(shared.filename)) {
        continue
      }
      files.push({
        filename: shared.filename,
        content: applyVariables(shared.content, variables),
      })
      included.add(shared.filename)
    }

    return new ResolvedSkillBundle(skill.name, skill.description, files)
  }

  /**
   * Lists shared files declared by metadata files in `templates/shared`.
   *
   * @returns Shared-file records.
   */
  listSharedFiles(): readonly SharedFile[] {
    const sharedRoot = path.join(this.templatesRoot, 'shared')
    let entries: Array<import('node:fs').Dirent<string>>
    try {
      entries = readdirSync(sharedRoot, { withFileTypes: true })
    } catch {
      return []
    }

    const metadataFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.meta.json'))
      .map((entry) => entry.name)
      .sort()

    const output: SharedFile[] = []
    for (const metadataFile of metadataFiles) {
      const metadataPath = path.join(sharedRoot, metadataFile)
      const metadataRaw = readFileSync(metadataPath, 'utf8')
      const metadata = JSON.parse(metadataRaw) as { filename?: unknown; skills?: unknown }

      if (typeof metadata.filename !== 'string' || !Array.isArray(metadata.skills)) {
        continue
      }

      const skills = metadata.skills.filter((value): value is string => typeof value === 'string')
      const contentPath = path.join(sharedRoot, metadata.filename)
      const content = readFileSync(contentPath, 'utf8')

      output.push({
        filename: metadata.filename,
        content,
        skills,
      })
    }

    return output
  }

  /**
   * Reads markdown templates for one skill directory.
   *
   * @param skillName - Skill directory name.
   * @returns Lazy template descriptors.
   */
  private readTemplates(skillName: string): Skill['templates'] {
    const skillDir = path.join(this.templatesRoot, skillName)
    const entries = readdirSync(skillDir, { withFileTypes: true })
    const markdownFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => entry.name)
      .sort()

    return markdownFiles.map((filename) =>
      this.templateReader.createTemplate(filename, path.join(skillDir, filename)),
    )
  }
}

/**
 * Creates an fs-backed `SkillRepository`.
 *
 * @param options - Optional repository configuration.
 * @returns Repository implementation.
 */
export function createSkillRepository(options: SkillRepositoryOptions = {}): SkillRepository {
  const templatesRoot = options.templatesRoot ?? resolveDefaultTemplatesRoot()
  return new FsSkillRepository(templatesRoot, new TemplateReader())
}

/**
 * Resolves the default templates root.
 *
 * In bundled contexts (for example when consumed through another package build),
 * `import.meta.url` may point at the bundle location rather than `@specd/skills`.
 * To keep runtime resolution stable, this first resolves the `@specd/skills`
 * package entry and derives its package root from `package.json`.
 *
 * @returns Absolute templates root path.
 */
function resolveDefaultTemplatesRoot(): string {
  const resolvedFromPackage = resolveTemplatesRootFromPackage('@specd/skills')
  if (resolvedFromPackage !== null) {
    return resolvedFromPackage
  }
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates')
}

/**
 * Resolves templates root by package name.
 *
 * @param packageName - Package name to resolve.
 * @returns Absolute templates path, or `null` when unresolved.
 */
function resolveTemplatesRootFromPackage(packageName: string): string | null {
  try {
    const require = createRequire(import.meta.url)
    const entryPath = require.resolve(packageName, {
      conditions: new Set(['import', 'node', 'default']),
    } as unknown as NodeJS.RequireResolveOptions)
    const packageRoot = derivePackageRoot(packageName, entryPath)
    if (packageRoot === null) {
      return null
    }
    return path.join(packageRoot, 'templates')
  } catch {
    return null
  }
}

/**
 * Derives package root by scanning upward for matching `package.json`.
 *
 * @param packageName - Expected package name.
 * @param entryPath - Resolved package entry path.
 * @returns Package root, or `null` when not found.
 */
function derivePackageRoot(packageName: string, entryPath: string): string | null {
  let current = path.dirname(entryPath)
  while (true) {
    const packageJsonPath = path.join(current, 'package.json')
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown }
      if (packageJson.name === packageName) {
        return current
      }
    } catch {
      // Keep walking up.
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

/**
 * Applies `{{key}}` substitution using invocation-time variables.
 *
 * @param content - Template content.
 * @param variables - Variable map.
 * @returns Content with placeholders replaced where possible.
 */
function applyVariables(content: string, variables: Readonly<Record<string, string>>): string {
  return content.replaceAll(/\{\{([A-Za-z0-9_.-]+)\}\}/g, (_match, key: string) => {
    return variables[key] ?? `{{${key}}}`
  })
}
