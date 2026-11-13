import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { type FileCategory } from '../../../src/domain/value-objects/file-node.js'
import { type PackageEntry } from '../../../src/domain/value-objects/language-adapter-facets.js'

/**
 * Registers indexed files in a session.
 * @param paths - Workspace-prefixed file paths.
 * @param language - Language id of the files.
 * @param category - Category recorded for every file.
 * @returns The session.
 */
function sessionWith(
  paths: readonly string[],
  language: string,
  category: FileCategory = 'source',
): InMemoryIndexSession {
  const session = new InMemoryIndexSession()
  for (const filePath of paths) {
    session.registerFile({
      filePath,
      projectRelativePath: filePath,
      language,
      contentHash: 'h',
      workspace: filePath.split(':')[0]!,
      category,
    })
  }
  return session
}

/**
 * Writes files under a directory.
 * @param root - Directory that receives the files.
 * @param files - Relative path to content.
 */
function write(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

describe('Package resolution facets', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'specd-package-resolution-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('TypeScript entry surface', () => {
    const adapter = new TypeScriptLanguageAdapter()

    /**
     * Prepares a package and returns its entries for a specifier.
     * @param manifest - package.json content.
     * @param specifier - Full import specifier.
     * @param files - Indexed files of the `pkg` workspace.
     * @returns The entries returned by the facet.
     */
    function entries(
      manifest: Record<string, unknown>,
      specifier: string,
      files: readonly string[],
    ): readonly PackageEntry[] {
      write(root, { 'package.json': JSON.stringify({ name: '@acme/pkg', ...manifest }) })
      const session = sessionWith(files, 'typescript')
      adapter.packageResolution.prepare({
        session,
        workspaces: [{ name: 'pkg', codeRoot: root }],
        projectRoot: root,
      })
      return adapter.packageResolution.entrySurface({
        specifier,
        packageName: '@acme/pkg',
        workspace: 'pkg',
        session,
      })
    }

    it('Given exports ".", when the bare specifier is asked, then dist maps to the indexed source', () => {
      const result = entries({ exports: { '.': './dist/public.js' } }, '@acme/pkg', [
        'pkg:src/public.ts',
      ])

      expect(result).toEqual([{ filePath: 'pkg:src/public.ts', surface: 'pkg:src/public.ts' }])
    })

    it('Given only main, when the bare specifier is asked, then main is used', () => {
      const result = entries({ main: './dist/index.js' }, '@acme/pkg', ['pkg:src/index.ts'])

      expect(result.map((entry) => entry.filePath)).toEqual(['pkg:src/index.ts'])
    })

    it('Given exports without the root and a main, when the bare specifier is asked, then main is ignored', () => {
      const result = entries(
        { main: './dist/index.js', exports: { './internal': './dist/internal.js' } },
        '@acme/pkg',
        ['pkg:src/index.ts', 'pkg:src/internal.ts'],
      )

      expect(result).toEqual([])
    })

    it('Given a package that publishes a JavaScript source, when the bare specifier is asked, then the JavaScript file is the entry', () => {
      const result = entries({ exports: { '.': './src/index.js' } }, '@acme/pkg', [
        'pkg:src/index.js',
      ])

      expect(result.map((entry) => entry.filePath)).toEqual(['pkg:src/index.js'])
    })

    it('Given a subpath export, when the subpath is asked, then its own entry is returned and not the root', () => {
      const manifest = { exports: { '.': './dist/public.js', './internal': './dist/index.js' } }
      const files = ['pkg:src/public.ts', 'pkg:src/index.ts']

      expect(entries(manifest, '@acme/pkg/internal', files).map((e) => e.filePath)).toEqual([
        'pkg:src/index.ts',
      ])
    })

    it('Given exports without the subpath, when it is asked, then nothing is published', () => {
      const result = entries({ exports: { '.': './dist/public.js' } }, '@acme/pkg/secret', [
        'pkg:src/public.ts',
        'pkg:src/secret.ts',
      ])

      expect(result).toEqual([])
    })

    it('Given import and types conditions, when asked, then the runtime source is used', () => {
      const result = entries(
        { exports: { '.': { import: './dist/public.js', types: './dist/public.d.ts' } } },
        '@acme/pkg',
        ['pkg:src/public.ts'],
      )

      expect(result.map((entry) => entry.filePath)).toEqual(['pkg:src/public.ts'])
    })

    it('Given only a types condition that maps to an indexed source, when asked, then types is the fallback', () => {
      const result = entries({ exports: { '.': { types: './dist/public.d.ts' } } }, '@acme/pkg', [
        'pkg:src/public.ts',
      ])

      expect(result.map((entry) => entry.filePath)).toEqual(['pkg:src/public.ts'])
    })

    it('Given only platform conditions, when asked, then nothing is published', () => {
      const result = entries(
        { exports: { '.': { require: './dist/public.cjs', node: './dist/public.node.js' } } },
        '@acme/pkg',
        ['pkg:src/public.ts'],
      )

      expect(result).toEqual([])
    })

    it('Given runtime alternatives with different indexed sources, when asked, then both are returned', () => {
      const result = entries(
        { exports: { '.': { import: './dist/a.js', default: './dist/b.js' } } },
        '@acme/pkg',
        ['pkg:src/a.ts', 'pkg:src/b.ts'],
      )

      expect(result.map((entry) => entry.filePath)).toEqual(['pkg:src/a.ts', 'pkg:src/b.ts'])
    })

    it('Given an unindexed target, when asked, then only indexed files are returned', () => {
      const result = entries({ exports: { '.': './dist/public.js' } }, '@acme/pkg', [
        'pkg:src/other.ts',
      ])

      expect(result).toEqual([])
    })

    it('Given prepared manifests, when the manifest is deleted afterwards, then the entry surface still resolves from prepared data', () => {
      write(root, {
        'package.json': JSON.stringify({ name: '@acme/pkg', exports: './dist/public.js' }),
      })
      const session = sessionWith(['pkg:src/public.ts'], 'typescript')
      adapter.packageResolution.prepare({
        session,
        workspaces: [{ name: 'pkg', codeRoot: root }],
        projectRoot: root,
      })
      rmSync(join(root, 'package.json'))

      const result = adapter.packageResolution.entrySurface({
        specifier: '@acme/pkg',
        packageName: '@acme/pkg',
        workspace: 'pkg',
        session,
      })

      expect(result.map((entry) => entry.filePath)).toEqual(['pkg:src/public.ts'])
    })

    it('Given a workspace that was never prepared, when asked, then nothing is published', () => {
      const session = sessionWith(['pkg:src/public.ts'], 'typescript')

      expect(
        adapter.packageResolution.entrySurface({
          specifier: '@acme/pkg',
          packageName: '@acme/pkg',
          workspace: 'pkg',
          session,
        }),
      ).toEqual([])
    })

    it('Given several workspaces, when prepare runs, then every manifest is available', () => {
      write(root, {
        'a/package.json': JSON.stringify({ name: '@acme/a', main: './dist/index.js' }),
        'b/package.json': JSON.stringify({ name: '@acme/b', main: './dist/index.js' }),
      })
      const session = sessionWith(['a:src/index.ts', 'b:src/index.ts'], 'typescript')
      adapter.packageResolution.prepare({
        session,
        workspaces: [
          { name: 'a', codeRoot: join(root, 'a') },
          { name: 'b', codeRoot: join(root, 'b') },
        ],
        projectRoot: root,
      })

      const entry = (workspace: string, name: string): string[] =>
        adapter.packageResolution
          .entrySurface({ specifier: name, packageName: name, workspace, session })
          .map((item) => item.filePath)
      expect(entry('a', '@acme/a')).toEqual(['a:src/index.ts'])
      expect(entry('b', '@acme/b')).toEqual(['b:src/index.ts'])
    })
  })

  describe('Python entry surface', () => {
    const adapter = new PythonLanguageAdapter()
    const entries = (specifier: string, files: readonly string[]): string[] =>
      adapter.packageResolution
        .entrySurface({
          specifier,
          packageName: 'acme-auth',
          workspace: 'auth',
          session: sessionWith(files, 'python'),
        })
        .map((entry) => entry.filePath)

    it('Given a dotted module, when asked, then the module file under src is returned', () => {
      expect(entries('acme_auth.models', ['auth:src/acme_auth/models.py'])).toEqual([
        'auth:src/acme_auth/models.py',
      ])
    })

    it('Given the package itself, when asked, then __init__ is returned', () => {
      expect(
        entries('acme_auth', ['auth:acme_auth/__init__.py', 'auth:acme_auth/models.py']),
      ).toEqual(['auth:acme_auth/__init__.py'])
    })

    it('Given a source file and its stub, when asked, then only the source is the entry', () => {
      expect(
        entries('acme_auth.models', [
          'auth:src/acme_auth/models.py',
          'auth:src/acme_auth/models.pyi',
        ]),
      ).toEqual(['auth:src/acme_auth/models.py'])
    })

    it('Given a stub and a package directory, when asked, then both forms are accepted in order', () => {
      expect(
        entries('acme_auth.models', [
          'auth:src/acme_auth/models.pyi',
          'auth:src/acme_auth/models/__init__.py',
        ]),
      ).toEqual(['auth:src/acme_auth/models.pyi', 'auth:src/acme_auth/models/__init__.py'])
    })

    it('Given unindexed candidates, when asked, then nothing is returned', () => {
      expect(entries('acme_auth.models', ['auth:src/other/models.py'])).toEqual([])
    })

    it('Given a module and a package, when asked, then the surface is the path without extension or __init__', () => {
      const session = sessionWith(
        ['auth:src/acme_auth/models.py', 'auth:acme_auth/__init__.pyi'],
        'python',
      )
      const surfaces = (specifier: string): string[] =>
        adapter.packageResolution
          .entrySurface({ specifier, packageName: 'acme-auth', workspace: 'auth', session })
          .map((entry) => entry.surface)

      expect(surfaces('acme_auth.models')).toEqual(['auth:src/acme_auth/models'])
      expect(surfaces('acme_auth')).toEqual(['auth:acme_auth'])
    })

    it('Given hyphen and underscore, when the specifier is matched, then they are equivalent', () => {
      expect(
        adapter.packageResolution.matchSpecifier(
          'acme_auth.models',
          ['acme-auth'],
          new InMemoryIndexSession(),
        ),
      ).toBe('acme-auth')
    })
  })

  describe('Go entry surface', () => {
    const adapter = new GoLanguageAdapter()
    const files = [
      'auth:models/user.go',
      'auth:models/user_test.go',
      'auth:models/role.go',
      'auth:main.go',
      'auth:v2/models/user.go',
    ]

    /**
     * Returns the entries for an import path of module `github.com/acme/auth`.
     * @param specifier - Import path.
     * @returns Entry file paths.
     */
    function entries(specifier: string): string[] {
      write(root, { 'go.mod': 'module github.com/acme/auth\n' })
      const session = sessionWith(files, 'go')
      adapter.packageResolution.prepare({
        session,
        workspaces: [{ name: 'auth', codeRoot: root }],
        projectRoot: root,
      })
      return adapter.packageResolution
        .entrySurface({
          specifier,
          packageName: 'github.com/acme/auth',
          workspace: 'auth',
          session,
        })
        .map((entry) => entry.filePath)
    }

    it('Given an import path, when asked, then the non-test files of the package directory are returned', () => {
      expect(entries('github.com/acme/auth/models').sort()).toEqual([
        'auth:models/role.go',
        'auth:models/user.go',
      ])
    })

    it('Given the module path, when asked, then the package at the module root is returned', () => {
      expect(entries('github.com/acme/auth')).toEqual(['auth:main.go'])
    })

    it('Given a directory with no Go files, when asked, then nothing is returned', () => {
      expect(entries('github.com/acme/auth/missing')).toEqual([])
    })

    it('Given nested modules, when matched, then the longest known module prefix wins', () => {
      expect(
        adapter.packageResolution.matchSpecifier(
          'github.com/acme/auth/v2/models',
          ['github.com/acme/auth', 'github.com/acme/auth/v2'],
          new InMemoryIndexSession(),
        ),
      ).toBe('github.com/acme/auth/v2')
    })
  })

  describe('PHP package matching and entry surface', () => {
    const adapter = new PhpLanguageAdapter()

    /**
     * Prepares two workspaces with Composer manifests and returns the session.
     * @returns The prepared session.
     */
    function prepared(): InMemoryIndexSession {
      write(root, {
        'shared/composer.json': JSON.stringify({
          name: 'acme/shared',
          autoload: { 'psr-4': { 'Acme\\': 'src/' } },
        }),
        'billing/composer.json': JSON.stringify({
          name: 'acme/billing',
          autoload: { 'psr-4': { 'Acme\\Billing\\': 'src/' } },
        }),
      })
      const session = sessionWith(
        ['shared:src/Util.php', 'billing:src/Invoice.php', 'shared:src/Billing/Invoice.php'],
        'php',
      )
      adapter.packageResolution.prepare({
        session,
        workspaces: [
          { name: 'shared', codeRoot: join(root, 'shared') },
          { name: 'billing', codeRoot: join(root, 'billing') },
        ],
        projectRoot: root,
      })
      return session
    }

    it('Given overlapping prefixes in two workspaces, when matched, then the longest prefix owns the name', () => {
      const session = prepared()

      expect(
        adapter.packageResolution.matchSpecifier(
          'Acme\\Billing\\Invoice',
          ['acme/shared', 'acme/billing'],
          session,
        ),
      ).toBe('acme/billing')
      expect(
        adapter.packageResolution.matchSpecifier(
          'Acme\\Util',
          ['acme/shared', 'acme/billing'],
          session,
        ),
      ).toBe('acme/shared')
    })

    it('Given a name no prefix matches, when matched, then nothing is returned', () => {
      expect(
        adapter.packageResolution.matchSpecifier(
          'Vendor\\Lib\\Foo',
          ['acme/shared', 'acme/billing'],
          prepared(),
        ),
      ).toBeUndefined()
    })

    it('Given the owning package, when the entry surface is asked, then the PSR-4 class file of that workspace is returned', () => {
      const session = prepared()

      const result = adapter.packageResolution.entrySurface({
        specifier: 'Acme\\Billing\\Invoice',
        packageName: 'acme/billing',
        workspace: 'billing',
        session,
      })

      expect(result.map((entry) => entry.filePath)).toEqual(['billing:src/Invoice.php'])
    })

    it('Given a package that matches a broader prefix, when asked, then a candidate within its own workspace is returned', () => {
      const session = prepared()

      const result = adapter.packageResolution.entrySurface({
        specifier: 'Acme\\Billing\\Invoice',
        packageName: 'acme/shared',
        workspace: 'shared',
        session,
      })

      // `Acme\` is mapped to `shared:src/`, so the candidate is `shared:src/Billing/Invoice.php`.
      expect(result.map((entry) => entry.filePath)).toEqual(['shared:src/Billing/Invoice.php'])
    })

    it('Given an unprepared session, when matched, then nothing is returned', () => {
      expect(
        adapter.packageResolution.matchSpecifier(
          'Acme\\Util',
          ['acme/shared'],
          new InMemoryIndexSession(),
        ),
      ).toBeUndefined()
    })
  })

  describe('facet shape', () => {
    it('Given the TypeScript adapter, when its type is inspected, then it declares no qualified-name facet', () => {
      expectTypeOf<TypeScriptLanguageAdapter>().not.toHaveProperty('qualifiedNameResolution')
      expect('qualifiedNameResolution' in new TypeScriptLanguageAdapter()).toBe(false)
    })

    it('Given the Go adapter, when its members are inspected, then it declares neither relative nor qualified-name facets', () => {
      const go = new GoLanguageAdapter()
      expect('relativeImportResolution' in go).toBe(false)
      expect('qualifiedNameResolution' in go).toBe(false)
    })

    it('Given the adapters, when their types are inspected, then the former loose methods are gone', () => {
      for (const member of [
        'getPackageIdentity',
        'resolvePackageFromSpecifier',
        'resolveRelativeImportPath',
        'buildQualifiedName',
        'resolveQualifiedNameToPath',
        'parseSymbolReference',
        'renderSymbolReference',
        'linkReExports',
      ] as const) {
        expectTypeOf<LanguageAdapter>().not.toHaveProperty(member)
      }
    })

    it('Given a Python workspace whose pyproject.toml is deleted after identity, when entrySurface runs, then it still returns the entry', () => {
      const root = mkdtempSync(join(tmpdir(), 'py-surface-'))
      try {
        write(root, { 'pyproject.toml': '[project]\nname = "acme-auth"\n' })
        const python = new PythonLanguageAdapter()
        expect(python.packageResolution.identity(root, root)).toBe('acme-auth')
        rmSync(join(root, 'pyproject.toml'))
        const found = python.packageResolution.entrySurface({
          specifier: 'acme_auth.models',
          packageName: 'acme-auth',
          workspace: 'auth',
          session: sessionWith(['auth:src/acme_auth/models.py'], 'python'),
        })
        expect(found.map((entry) => entry.filePath)).toEqual(['auth:src/acme_auth/models.py'])
      } finally {
        rmSync(root, { recursive: true, force: true })
      }
    })
  })
})
