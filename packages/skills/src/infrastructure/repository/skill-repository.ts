import { mkdir, rm, writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import type { SharedFile, SkillRepository } from '../../application/ports/skill-repository.js'
import type { Skill } from '../../domain/skill.js'
import type { SkillTemplateMetadata } from '../../domain/skill-template-metadata.js'
import type {
  ResolvedFile,
  SkillBundle,
  SkillBundleInstallTarget,
} from '../../domain/skill-bundle.js'
import type { SkillTemplateContext } from '../../domain/template-context.js'
import { InvalidSkillTemplateMetadataError } from '../../domain/errors/invalid-skill-template-metadata-error.js'
import { SkillNotFoundError } from '../../domain/errors/skill-not-found-error.js'
import { TemplateReader } from './template-reader.js'
import { SkillTemplateMetadataReader } from './skill-template-metadata-reader.js'
import { TemplateRenderer } from './template-renderer.js'

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
   * @param target - Target directory path or split install targets.
   * @returns A promise that resolves after all writes complete.
   */
  async install(target: string | SkillBundleInstallTarget): Promise<void> {
    const targetDir = typeof target === 'string' ? target : target.targetDir
    const sharedTargetDir =
      typeof target === 'string' ? target : (target.sharedTargetDir ?? target.targetDir)

    await mkdir(targetDir, { recursive: true })
    if (this.files.some((file) => file.shared === true)) {
      await mkdir(sharedTargetDir, { recursive: true })
    }

    for (const file of this.files) {
      const baseDir = file.shared === true ? sharedTargetDir : targetDir
      const outputPath = path.join(baseDir, file.filename)
      await writeFile(outputPath, file.content, 'utf8')
    }
  }

  /**
   * Uninstalls bundle files from a target directory.
   *
   * @param target - Target directory path or split install targets.
   * @returns A promise that resolves after best-effort cleanup.
   */
  async uninstall(target: string | SkillBundleInstallTarget): Promise<void> {
    const targetDir = typeof target === 'string' ? target : target.targetDir
    const sharedTargetDir =
      typeof target === 'string' ? target : (target.sharedTargetDir ?? target.targetDir)

    for (const file of this.files) {
      const baseDir = file.shared === true ? sharedTargetDir : targetDir
      const outputPath = path.join(baseDir, file.filename)
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
   * @param metadataReader - Skill metadata reader.
   * @param templateRenderer - Install-time template renderer.
   */
  constructor(
    private readonly templatesRoot: string,
    private readonly templateReader: TemplateReader,
    private readonly metadataReader: SkillTemplateMetadataReader,
    private readonly templateRenderer: TemplateRenderer,
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
   * @param context - Structured install-time render context.
   * @returns Resolved install bundle.
   * @throws SkillNotFoundError if skill is not found.
   */
  getBundle(name: string, context: SkillTemplateContext = {}): SkillBundle {
    const skill = this.get(name)
    if (skill === undefined) {
      throw new SkillNotFoundError(name)
    }

    const skillDir = path.join(this.templatesRoot, name)
    const metadata = this.metadataReader.readSkillMetadata(skillDir)
    this.validateCapabilities(name, metadata, context.capabilities ?? [])

    const files: ResolvedFile[] = []
    const included = new Set<string>()
    for (const template of skill.templates) {
      const outputFilename = this.templateRenderer.normalizeOutputFilename(template.filename)
      included.add(outputFilename)
      const content = readFileSync(path.join(skillDir, template.filename), 'utf8')
      files.push({
        filename: outputFilename,
        content: this.templateRenderer.render({
          templateSource: content,
          context: this.filterContextForSkill(metadata, context),
          includeFrontmatter: true,
        }),
      })
    }

    const sharedFiles = this.listSharedFiles()
    const requiredSharedTemplates = new Set(metadata.requiredSharedTemplates)
    for (const shared of sharedFiles) {
      if (!requiredSharedTemplates.has(shared.filename) || included.has(shared.filename)) {
        continue
      }
      files.push({
        filename: shared.filename,
        content: this.templateRenderer.render({
          templateSource: shared.content,
          context: this.filterContextForSkill(metadata, context),
          includeFrontmatter: false,
        }),
        shared: true,
      })
      included.add(shared.filename)
    }

    for (const filename of metadata.requiredSharedTemplates) {
      if (!included.has(filename)) {
        throw new InvalidSkillTemplateMetadataError(
          path.join(skillDir, 'skill.meta.json'),
          `required shared template '${filename}' does not exist`,
        )
      }
    }

    return new ResolvedSkillBundle(skill.name, skill.description, files)
  }

  /**
   * Lists shared files available in `templates/shared`.
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

    const templateFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md.tpl'))
      .map((entry) => entry.name)
      .sort()

    const output: SharedFile[] = []
    for (const templateFile of templateFiles) {
      const outputFilename = this.templateRenderer.normalizeOutputFilename(templateFile)
      const content = readFileSync(path.join(sharedRoot, templateFile), 'utf8')

      output.push({
        filename: outputFilename,
        content,
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
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md.tpl'))
      .map((entry) => entry.name)
      .sort()

    return markdownFiles.map((filename) =>
      this.templateReader.createTemplate(filename, path.join(skillDir, filename)),
    )
  }

  /**
   * Filters the public render context down to metadata-supported capabilities.
   *
   * @param metadata - Skill metadata contract.
   * @param context - Incoming render context.
   * @returns Filtered render context.
   */
  private filterContextForSkill(
    metadata: SkillTemplateMetadata,
    context: SkillTemplateContext,
  ): SkillTemplateContext {
    const supported = new Set(metadata.supportedCapabilities)
    const capabilities = (context.capabilities ?? []).filter((capability) =>
      supported.has(capability),
    )
    return {
      ...(context.variables !== undefined ? { variables: context.variables } : {}),
      ...(capabilities.length > 0 ? { capabilities } : {}),
    }
  }

  /**
   * Validates that all required capabilities are present before rendering.
   *
   * @param skillName - Skill name used for diagnostics.
   * @param metadata - Skill metadata contract.
   * @param capabilities - Provided capability list.
   * @throws {InvalidSkillTemplateMetadataError} When required capabilities are missing.
   */
  private validateCapabilities(
    skillName: string,
    metadata: SkillTemplateMetadata,
    capabilities: readonly string[],
  ): void {
    const provided = new Set(capabilities)
    const missing = metadata.requiredCapabilities.filter((capability) => !provided.has(capability))
    if (missing.length > 0) {
      throw new InvalidSkillTemplateMetadataError(
        path.join(this.templatesRoot, skillName, 'skill.meta.json'),
        `missing required capabilities: ${missing.join(', ')}`,
      )
    }
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
  return new FsSkillRepository(
    templatesRoot,
    new TemplateReader(),
    new SkillTemplateMetadataReader(),
    new TemplateRenderer(),
  )
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
 * @returns Absolute templates path, or \`null\` when unresolved.
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
