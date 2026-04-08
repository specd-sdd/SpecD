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

      const source = await fs.readFile(entryPath, 'utf8')
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
 * @returns Markdown content for the public API overview page.
 */
export function buildApiIndexContent() {
  return `---
title: API Reference
sidebar_position: 1
---

# @specd/core API Reference

This section exposes the generated public API reference for \`@specd/core\`.

Use the sidebar to browse the exported surface by kind:

- [Classes](/api/classes/AlreadyInitialisedError)
- [Interfaces](/api/interfaces/ActorIdentity)
- [Functions](/api/functions/applyPreHashCleanup)
- [Type Aliases](/api/type-aliases/ArchiveHookPhaseSelector)
- [Variables](/api/variables/CORE_VERSION)
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
 * Resolves TypeDoc options for the initial public API reference generation.
 *
 * @returns TypeDoc bootstrap options with concrete absolute paths.
 */
export async function resolveTypeDocOptions() {
  const [typedocConfigSource, publicDocsConfig] = await Promise.all([
    fs.readFile(typedocConfigPath, 'utf8'),
    loadPublicDocsConfig(),
  ])
  const typedocConfig = JSON.parse(typedocConfigSource)
  const outputPath = path.join(appRootPath, publicDocsConfig.generatedApiPath)
  const entryPoints = publicDocsConfig.initialApiEntryPoints.map((entryPoint) =>
    path.resolve(appRootPath, entryPoint),
  )

  return {
    ...typedocConfig,
    entryPoints,
    out: outputPath,
    tsconfig: path.join(appRootPath, 'tsconfig.typedoc.json'),
  }
}

/**
 * Generates markdown API reference files for the curated public packages.
 *
 * @returns Promise that resolves when API docs have been generated successfully.
 * @throws Error when the TypeDoc project cannot be converted.
 */
export async function generateApiDocs() {
  const options = await resolveTypeDocOptions()

  await fs.rm(options.out, { force: true, recursive: true })
  await fs.mkdir(options.out, { recursive: true })

  const application = await Application.bootstrapWithPlugins(options)
  const project = await application.convert()

  if (!project) {
    throw new Error('TypeDoc could not convert the configured public API entrypoints.')
  }

  await application.generateOutputs(project)
  await fs.writeFile(path.join(options.out, 'index.md'), buildApiIndexContent())
  await sanitizeGeneratedMarkdown(options.out)
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
