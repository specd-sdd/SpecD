import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { Application } from 'typedoc'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirPath = path.dirname(currentFilePath)
const appRootPath = path.resolve(currentDirPath, '..')
const typedocConfigPath = path.join(appRootPath, 'typedoc.json')
const publicDocsConfigPath = path.join(appRootPath, 'src/lib/public-docs-config.ts')

/**
 * Encodes MDX-significant braces in prose while preserving code fences and inline code.
 *
 * Docusaurus treats braces in markdown prose as JSX expression delimiters, and
 * TypeDoc emits object signatures such as `\{ foo: string \}` outside code
 * fences. HTML entities survive markdown rendering without tripping the MDX
 * parser, so they are safer than backslash escaping here.
 *
 * @param line Markdown source line to sanitize.
 * @returns Line with prose braces encoded for MDX rendering.
 */
export function escapeMdxBracesInLine(line) {
  const segments = line.split(/(`[^`]*`)/g)

  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment
      }

      return segment
        .replaceAll('\\{', '&#123;')
        .replaceAll('\\}', '&#125;')
        .replaceAll('{', '&#123;')
        .replaceAll('}', '&#125;')
    })
    .join('')
}

const MEMBER_SECTION_HEADINGS = new Set(['Properties', 'Methods', 'Accessors'])

/**
 * Drops inherited members whose source file lives under node_modules.
 *
 * TypeDoc documents Error/Object inherited members with full Node.js JSDoc examples
 * (including `function a()` sample code), which overwhelms specd error class pages.
 *
 * @param markdown Generated class or interface markdown.
 * @returns Markdown without externally sourced member blocks.
 */
export function stripExternallyDefinedMembers(markdown) {
  const lines = markdown.split('\n')
  const output = []
  let inMemberSection = false
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const sectionMatch = line.match(/^## (.+)$/)

    if (sectionMatch) {
      inMemberSection = MEMBER_SECTION_HEADINGS.has(sectionMatch[1])
      output.push(line)
      index += 1
      continue
    }

    if (inMemberSection && line.startsWith('### ')) {
      const block = [line]
      index += 1

      while (index < lines.length) {
        const nextLine = lines[index]

        if (nextLine.startsWith('### ') || nextLine.startsWith('## ')) {
          break
        }

        block.push(nextLine)
        index += 1

        if (nextLine === '***') {
          break
        }
      }

      const isExternal = block.some((blockLine) =>
        /^Defined in:.*node\\?_modules/.test(blockLine),
      )

      if (!isExternal) {
        output.push(...block)
      }

      continue
    }

    output.push(line)
    index += 1
  }

  return output
    .join('\n')
    .replace(/\n## (?:Properties|Methods|Accessors)\n+(?=\n## |$)/g, '\n')
}

/**
 * Rewrites generated Markdown files so Docusaurus MDX parsing does not treat prose braces as JSX.
 *
 * @param outputPath Root directory containing generated API markdown files.
 * @returns Promise that resolves when all markdown files have been sanitized.
 */
export async function sanitizeGeneratedMarkdown(outputPath) {
  const directoryEntries = await fs.readdir(outputPath, { withFileTypes: true })

  await Promise.all(
    directoryEntries.map(async (entry) => {
      const entryPath = path.join(outputPath, entry.name)

      if (entry.isDirectory()) {
        await sanitizeGeneratedMarkdown(entryPath)
        return
      }

      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        return
      }

      const source = stripExternallyDefinedMembers(await fs.readFile(entryPath, 'utf8'))
      const lines = source.split('\n')
      let inFence = false
      const sanitized = lines.map((line) => {
        if (line.startsWith('```')) {
          inFence = !inFence
          return line
        }

        if (inFence) {
          return line
        }

        return escapeMdxBracesInLine(line)
      })

      await fs.writeFile(entryPath, sanitized.join('\n'))
    }),
  )
}

/**
 * Builds the synthetic API landing page rendered at `/api`.
 *
 * @param packages Curated package entrypoints in sidebar order.
 * @returns Markdown content for the public API overview page.
 */
export function buildApiIndexContent(packages) {
  const packageSections = packages
    .map(
      (pkg) => `## ${pkg.packageName}

Browse the curated public \`"."\` export for \`${pkg.packageName}\`.

- [Package index](/api/${pkg.id}/)`,
    )
    .join('\n\n')

  return `---
title: API Reference
sidebar_position: 1
---

# Public API Reference

Generated reference for curated public barrels. Host integrations MUST import from \`@specd/sdk\`; \`@specd/core\` and \`@specd/code-graph\` document their public package exports for package-level discovery.

${packageSections}

Use the sidebar to browse each package by symbol kind. Example SDK entries:

- [Classes](/api/sdk/classes/AlreadyInitialisedError)
- [Interfaces](/api/sdk/interfaces/ActorIdentity)
- [Functions](/api/sdk/functions/createKernel)
`
}

/**
 * Loads the shared public-web config by transpiling the TypeScript module on the fly.
 *
 * @returns Shared docs and API generation config values.
 */
export async function loadPublicDocsConfig() {
  const source = await fs.readFile(publicDocsConfigPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: publicDocsConfigPath,
  })
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  return import(moduleUrl)
}

/**
 * Resolves TypeDoc options for one public package API reference generation run.
 *
 * @param input Generation roots for a single curated package surface.
 * @param input.entryPoint Repository-relative package public entry file.
 * @param input.outputPath Absolute output directory for the generated markdown tree.
 * @returns TypeDoc bootstrap options with concrete absolute paths.
 */
export async function resolveTypeDocOptions({ entryPoint, outputPath }) {
  const typedocConfigSource = await fs.readFile(typedocConfigPath, 'utf8')
  const typedocConfig = JSON.parse(typedocConfigSource)

  return {
    ...typedocConfig,
    entryPoints: [path.resolve(appRootPath, entryPoint)],
    out: outputPath,
    tsconfig: path.join(appRootPath, 'tsconfig.typedoc.json'),
  }
}

/**
 * Generates markdown API reference files for one curated public package.
 *
 * @param input Generation roots for a single curated package surface.
 * @param input.entryPoint Repository-relative package public entry file.
 * @param input.outputPath Absolute output directory for the generated markdown tree.
 * @returns Promise that resolves when the package reference has been generated.
 * @throws Error when the TypeDoc project cannot be converted.
 */
export async function generatePackageApiDocs({ entryPoint, outputPath }) {
  const options = await resolveTypeDocOptions({ entryPoint, outputPath })

  await fs.rm(options.out, { force: true, recursive: true })
  await fs.mkdir(options.out, { recursive: true })

  const application = await Application.bootstrapWithPlugins(options)
  const project = await application.convert()

  if (!project) {
    throw new Error(`TypeDoc could not convert API entrypoint: ${entryPoint}`)
  }

  await application.generateOutputs(project)
  await sanitizeGeneratedMarkdown(options.out)
}

/**
 * Generates markdown API reference files for the curated public packages.
 *
 * @returns Promise that resolves when API docs have been generated successfully.
 * @throws Error when the TypeDoc project cannot be converted.
 */
export async function generateApiDocs() {
  const publicDocsConfig = await loadPublicDocsConfig()
  const outputRoot = path.join(appRootPath, publicDocsConfig.generatedApiPath)

  await fs.rm(outputRoot, { force: true, recursive: true })
  await fs.mkdir(outputRoot, { recursive: true })

  for (const pkg of publicDocsConfig.apiPackageEntryPoints) {
    await generatePackageApiDocs({
      entryPoint: pkg.entryPoint,
      outputPath: path.join(outputRoot, pkg.id),
    })
  }

  await fs.writeFile(
    path.join(outputRoot, 'index.md'),
    buildApiIndexContent(publicDocsConfig.apiPackageEntryPoints),
  )
}

/**
 * Entrypoint used by the public-web build pipeline.
 *
 * @returns Promise that resolves when generation completes.
 */
async function main() {
  await generateApiDocs()
}

void main()
