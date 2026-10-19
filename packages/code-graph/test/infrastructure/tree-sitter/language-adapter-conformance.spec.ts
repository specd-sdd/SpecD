import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import * as nodeFs from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdapterRegistry } from '../../../src/infrastructure/tree-sitter/adapter-registry.js'
import { TypeScriptLanguageAdapter } from '../../../src/infrastructure/tree-sitter/typescript-language-adapter.js'
import { PythonLanguageAdapter } from '../../../src/infrastructure/tree-sitter/python-language-adapter.js'
import { GoLanguageAdapter } from '../../../src/infrastructure/tree-sitter/go-language-adapter.js'
import { PhpLanguageAdapter } from '../../../src/infrastructure/tree-sitter/php-language-adapter.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { type LanguageAdapter } from '../../../src/domain/value-objects/language-adapter.js'
import { SymbolKind } from '../../../src/domain/value-objects/symbol-kind.js'
import { type SymbolNode } from '../../../src/domain/value-objects/symbol-node.js'
import { IndexCodeGraph } from '../../../src/application/use-cases/index-code-graph.js'
import { analyzeResolvedSymbolImpact } from '../../../src/domain/services/analyze-impact.js'
import { createSpecNode } from '../../../src/domain/value-objects/spec-node.js'
import { createRelation } from '../../../src/domain/value-objects/relation.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { InMemoryGraphStore } from '../../helpers/in-memory-graph-store.js'
import { makeMockSpecRepository } from '../../helpers/make-mock-spec-repository.js'

// Passthrough spies: pass-2 purity is asserted by counting reads performed after preparation.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    statSync: vi.fn(actual.statSync),
    existsSync: vi.fn(actual.existsSync),
    readdirSync: vi.fn(actual.readdirSync),
  }
})

interface LanguageConformanceFixture {
  readonly language: string
  readonly fileName: string
  readonly callerOutsideSnippet: string
  readonly containedCallerSnippet: string
  readonly ownershipSnippet: string
  readonly physicalOnlySnippet: string
  readonly physicalOnlySymbolName: string
  readonly structuralBoundarySnippet: string
  readonly structuralCallName: string
  readonly structuralLookalikeName: string
  readonly sameLineSnippet: string
  readonly sameLineCallNames: readonly string[]
  readonly unresolvedImportSnippet: string
  readonly boundarySupport: Readonly<Record<StructuralBoundaryCase, boolean>>
  /**
   * Call syntax per structural boundary case. A case without a snippet means the language has no
   * such syntax; a case with one must emit its call fact exactly when `boundarySupport` says so.
   */
  readonly boundarySnippets: Partial<
    Record<'optionalCall' | 'chainedCall' | 'computedCall' | 'genericCall', BoundarySnippet>
  >
  /** Two routines in competing lexical scopes that declare the same local name. */
  readonly lexicalScopeSnippet: string
  readonly lexicalScopeName: string
  /** Overload or merge group, or undefined when the language has explicit absence of grouping. */
  readonly overload:
    | { readonly snippet: string; readonly name: string; readonly occurrences: number }
    | undefined
  /** Project files where `caller` calls `callee`, used for logical coverage after impact. */
  readonly impactFiles: Readonly<Record<string, string>>
  readonly impactCalleeName: string
  readonly impactCallerName: string
  /** Project files where a child extends an imported base; undefined when the language has no hierarchy. */
  readonly hierarchy:
    | { readonly files: Readonly<Record<string, string>>; readonly childName: string }
    | undefined
  /** Project files and an identity-sensitive edit used for incremental-equivalence checks. */
  readonly incremental: {
    readonly files: Readonly<Record<string, string>>
    readonly editFile: string
    readonly before: string
    readonly after: string
  }
}

interface BoundarySnippet {
  readonly code: string
  readonly callName: string
}

type StructuralBoundaryCase =
  | 'optionalCall'
  | 'chainedCall'
  | 'computedCall'
  | 'genericCall'
  | 'nestedCall'
  | 'multilineCall'
  | 'sameLineCall'
  | 'lookalikeIsolation'
  | 'unresolvedImport'
  | 'importedHierarchy'
  | 'noPass2Io'

const COMMON_BOUNDARY_SUPPORT = {
  nestedCall: true,
  multilineCall: true,
  sameLineCall: true,
  lookalikeIsolation: true,
  unresolvedImport: true,
  noPass2Io: true,
} as const

const CONFORMANCE_FIXTURES: Record<string, LanguageConformanceFixture> = {
  typescript: {
    language: 'typescript',
    fileName: 'service.ts',
    callerOutsideSnippet: `function doWork() {
  const x = 1;
}
externalCall();`,
    containedCallerSnippet: `function outer() {
  function inner() {
    targetCall();
  }
}`,
    ownershipSnippet: `class First {
  save() {}
}
class Second {
  save() {}
}`,
    physicalOnlySnippet: `describe('test', () => {
  it('runs', () => {
    const x = 1;
  });
});`,
    physicalOnlySymbolName: '<anonymous>',
    structuralBoundarySnippet: `function run() {
  const text = \`fakeCall() { import x from 'fake' }\`;
  // fakeCall()
  realCall(
    1,
  );
}`,
    structuralCallName: 'realCall',
    structuralLookalikeName: 'fakeCall',
    sameLineSnippet: 'function run(){ first(); second(); }',
    sameLineCallNames: ['first', 'second'],
    unresolvedImportSnippet: "import { missing } from './missing.js'; function run(){ missing(); }",
    lexicalScopeSnippet: `function a() { function same() {} }
function b() { function same() {} }`,
    lexicalScopeName: 'same',
    overload: {
      snippet: `class Mailer {
  send(a: string): void
  send(a: number): void
  send(a: any) {}
}`,
      name: 'send',
      occurrences: 3,
    },
    impactFiles: {
      'main.ts': 'export function callee(): void {}\nexport function caller(): void { callee() }\n',
    },
    impactCalleeName: 'callee',
    impactCallerName: 'caller',
    hierarchy: {
      files: {
        'base.ts': 'export class Base {}\n',
        'child.ts': "import { Base } from './base.js'\nexport class Child extends Base {}\n",
      },
      childName: 'Child',
    },
    incremental: {
      files: {
        'a.ts': 'export function target(): void {}\n',
        'b.ts': "import { target } from './a.js'\nexport function user(): void { target() }\n",
      },
      editFile: 'b.ts',
      before: 'export function user',
      after: '// shifted\n\nexport function user',
    },
    boundarySnippets: {
      optionalCall: { code: 'function run(o: any) { o?.go() }', callName: 'go' },
      chainedCall: { code: 'function run() { build().make() }', callName: 'make' },
      computedCall: { code: "function run(o: any) { o['k']() }", callName: 'k' },
      genericCall: { code: 'function run() { build<string>() }', callName: 'build' },
    },
    boundarySupport: {
      ...COMMON_BOUNDARY_SUPPORT,
      optionalCall: true,
      chainedCall: true,
      computedCall: false,
      genericCall: true,
      importedHierarchy: true,
    },
  },
  python: {
    language: 'python',
    fileName: 'service.py',
    callerOutsideSnippet: `def do_work():
    x = 1

external_call()`,
    containedCallerSnippet: `def outer():
    def inner():
        target_call()`,
    ownershipSnippet: `class First:
    def save(self):
        pass

class Second:
    def save(self):
        pass`,
    physicalOnlySnippet: `def outer():
    def inner():
        pass`,
    physicalOnlySymbolName: 'inner',
    structuralBoundarySnippet: `def run():
    text = "fake_call() class Fake: pass"
    # fake_call()
    real_call(
        1,
    )`,
    structuralCallName: 'real_call',
    structuralLookalikeName: 'fake_call',
    sameLineSnippet: 'def run(): first(); second()',
    sameLineCallNames: ['first', 'second'],
    unresolvedImportSnippet: 'from .missing import missing\ndef run():\n    missing()',
    lexicalScopeSnippet: `def a():
    def same():
        pass

def b():
    def same():
        pass
`,
    lexicalScopeName: 'same',
    overload: undefined,
    impactFiles: {
      'main.py': 'def callee():\n    pass\n\ndef caller():\n    callee()\n',
    },
    impactCalleeName: 'callee',
    impactCallerName: 'caller',
    hierarchy: {
      files: {
        'base.py': 'class Base:\n    pass\n',
        'child.py': 'from .base import Base\n\nclass Child(Base):\n    pass\n',
      },
      childName: 'Child',
    },
    incremental: {
      files: {
        'a.py': 'def target():\n    pass\n',
        'b.py': 'from .a import target\n\ndef user():\n    target()\n',
      },
      editFile: 'b.py',
      before: 'def user',
      after: '# shifted\n\ndef user',
    },
    boundarySnippets: {
      chainedCall: { code: 'def run():\n    build().make()', callName: 'make' },
      computedCall: { code: "def run(o):\n    o['k']()", callName: 'k' },
    },
    boundarySupport: {
      ...COMMON_BOUNDARY_SUPPORT,
      optionalCall: false,
      chainedCall: true,
      computedCall: false,
      genericCall: false,
      importedHierarchy: true,
    },
  },
  go: {
    language: 'go',
    fileName: 'service.go',
    callerOutsideSnippet: `package main

func DoWork() {
}

var _ = externalCall()`,
    containedCallerSnippet: `package main

func Outer() {
	targetCall()
}`,
    ownershipSnippet: `package main

type First struct{}
func (f First) Save() {}

type Second struct{}
func (s Second) Save() {}`,
    physicalOnlySnippet: `package main

func Conflict() string {
	return "first"
}
func Conflict() int {
	return 2
}`,
    physicalOnlySymbolName: 'Conflict',
    structuralBoundarySnippet: `package main

func Run() {
	text := "fakeCall() { import fake }"
	_ = text
	// fakeCall()
	realCall(
		1,
	)
}`,
    structuralCallName: 'realCall',
    structuralLookalikeName: 'fakeCall',
    sameLineSnippet: 'package main\nfunc Run(){ first(); second() }',
    sameLineCallNames: ['first', 'second'],
    unresolvedImportSnippet:
      'package main\nimport missing "example.invalid/missing"\nfunc Run(){ missing.Call() }',
    lexicalScopeSnippet: `package main
func a() { same := 1; _ = same }
func b() { same := 2; _ = same }
`,
    lexicalScopeName: 'same',
    overload: undefined,
    impactFiles: {
      'main.go': 'package main\nfunc Callee() {}\nfunc Caller() { Callee() }\n',
    },
    impactCalleeName: 'Callee',
    impactCallerName: 'Caller',
    hierarchy: undefined,
    incremental: {
      files: {
        'a.go': 'package main\nfunc Target() {}\n',
        'b.go': 'package main\nfunc User() { Target() }\n',
      },
      editFile: 'b.go',
      before: 'func User',
      after: '// shifted\n\nfunc User',
    },
    boundarySnippets: {
      chainedCall: { code: 'package main\nfunc Run() { build().Make() }', callName: 'Make' },
      computedCall: {
        code: 'package main\nfunc Run(o map[string]func()) { o["k"]() }',
        callName: 'k',
      },
      genericCall: { code: 'package main\nfunc Run() { build[int]() }', callName: 'build' },
    },
    boundarySupport: {
      ...COMMON_BOUNDARY_SUPPORT,
      optionalCall: false,
      chainedCall: true,
      computedCall: false,
      // `f[T]()` is an index expression in the Go grammar; it is not emitted as a call fact.
      genericCall: false,
      importedHierarchy: false,
    },
  },
  php: {
    language: 'php',
    fileName: 'service.php',
    callerOutsideSnippet: `<?php
class Worker {
    public function doWork() {}
}
$svc = new ExternalService();`,
    containedCallerSnippet: `<?php
class Worker {
    public function doWork() {
        $svc = new ExternalService();
    }
}`,
    ownershipSnippet: `<?php
class First {
    public function save() {}
}
class Second {
    public function save() {}
}`,
    physicalOnlySnippet: `<?php
function conflictFunc() {}
function conflictFunc() {}`,
    physicalOnlySymbolName: 'conflictFunc',
    structuralBoundarySnippet: `<?php
function runIt() {
    $text = "new FakeService() { require 'fake.php'; }";
    // new FakeService();
    $service = new RealService(
        1
    );
}`,
    structuralCallName: 'RealService',
    structuralLookalikeName: 'FakeService',
    sameLineSnippet: '<?php function runIt(){ $a = new First(); $b = new Second(); }',
    sameLineCallNames: ['First', 'Second'],
    unresolvedImportSnippet:
      '<?php use Missing\\Service; function runIt(){ $service = new Service(); }',
    lexicalScopeSnippet: `<?php
function a() { function same() {} }
function b() { function same() {} }
`,
    lexicalScopeName: 'same',
    overload: undefined,
    impactFiles: {
      'main.php': '<?php\nclass Target {}\nfunction make() { return new Target(); }\n',
    },
    impactCalleeName: 'Target',
    impactCallerName: 'make',
    hierarchy: {
      files: {
        'base.php': '<?php\nnamespace App;\nclass Base {}\n',
        'child.php': '<?php\nnamespace App;\nuse App\\Base;\nclass Child extends Base {}\n',
      },
      childName: 'Child',
    },
    incremental: {
      files: {
        'a.php': '<?php\nfunction target() {}\n',
        'b.php': '<?php\nfunction user() { target(); }\n',
      },
      editFile: 'b.php',
      before: 'function user',
      after: '// shifted\n\nfunction user',
    },
    boundarySnippets: {
      optionalCall: { code: '<?php function run($o) { $o?->go(); }', callName: 'go' },
      chainedCall: { code: '<?php function run($a) { $a->b()->c(); }', callName: 'c' },
      computedCall: { code: '<?php function run($o, $n) { $o->$n(); }', callName: 'n' },
    },
    boundarySupport: {
      ...COMMON_BOUNDARY_SUPPORT,
      // PHP call facts need a variable or `$this->property` receiver; nullsafe calls and calls on
      // a call result have no proven receiver and are intentionally not emitted.
      optionalCall: false,
      chainedCall: false,
      computedCall: false,
      genericCall: false,
      importedHierarchy: true,
    },
  },
}

const temporaryProjects: string[] = []

afterEach(() => {
  for (const dir of temporaryProjects.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/**
 * Writes fixture files into a fresh temporary project directory.
 * @param files - Relative path to content.
 * @returns Absolute project directory.
 */
function writeProject(files: Readonly<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'adapter-conformance-'))
  temporaryProjects.push(dir)
  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, relative)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  return dir
}

/**
 * Runs the real indexing pipeline over one temporary single-workspace project.
 * @param store - Store that receives the generation.
 * @param registry - Registry with every built-in adapter.
 * @param projectDir - Project directory used as workspace root.
 */
async function indexProject(
  store: InMemoryGraphStore,
  registry: AdapterRegistry,
  projectDir: string,
): Promise<void> {
  const result = await new IndexCodeGraph(store, registry).execute({
    projectRoot: projectDir,
    vcsRoot: projectDir,
    workspaces: [
      {
        name: 'ws',
        prefix: null,
        codeRoot: projectDir,
        specRepo: makeMockSpecRepository([]),
        ownership: 'owned',
        isExternal: false,
      },
    ],
    graphConfig: { includePaths: [], workspaces: new Map() },
  })
  expect(result.errors).toEqual([])
}

/**
 * Normalizes the semantic graph into location-independent comparable data.
 * @param store - Indexed store.
 * @returns Sorted symbols, relations, and logical facts.
 */
async function semanticState(store: InMemoryGraphStore): Promise<unknown> {
  const files = await store.getAllFiles()
  const symbols = await store.findSymbols({ filePaths: files.map((file) => file.path) })
  const facts = await store.getAllReferenceFacts()
  return {
    files: files.map((file) => file.path).sort(),
    symbols: symbols.map((symbol) => symbol.id).sort(),
    relations: store
      .allRelationsForTest()
      .map((relation) => `${relation.type}|${relation.source}|${relation.target}`)
      .sort(),
    logicalSymbols: facts.logicalSymbols.map((symbol) => symbol.id).sort(),
    declarations: facts.declarations
      .map((entry) => `${entry.logicalSymbolId}|${entry.declaration.symbolId}`)
      .sort(),
    publicBindings: facts.publicBindings.map((binding) => binding.id).sort(),
  }
}

/**
 * Detects an adapter that attributes a call to a caller whose range does not contain the call.
 * The same detector judges every real adapter and the deliberately non-conformant one.
 * @param adapter - Adapter under test.
 * @param fileName - File name used for analysis.
 * @param snippet - Source containing at least one call outside every callable.
 * @returns True when some call is attributed to a callable that does not contain it.
 */
function attributesCallOutsideCallerRange(
  adapter: LanguageAdapter,
  fileName: string,
  snippet: string,
): boolean {
  const draft = adapter.analyzeFile(fileName, snippet, {
    session: new InMemoryIndexSession(),
    workspaceName: 'ws',
  })
  const position = (line: number, column: number): number => line * 1_000_000 + column
  return draft.callFacts.some((fact) => {
    if (fact.callerSymbolId === undefined) return false
    const caller = draft.symbols.find((symbol) => symbol.id === fact.callerSymbolId)
    if (caller === undefined) return true
    const at = position(fact.location.line, fact.location.column)
    return !(
      position(caller.line, caller.column) <= at && at < position(caller.endLine, caller.endColumn)
    )
  })
}

describe('LanguageAdapter Conformance Suite', () => {
  const registry = new AdapterRegistry()
  const adapters: LanguageAdapter[] = [
    new TypeScriptLanguageAdapter(),
    new PythonLanguageAdapter(),
    new GoLanguageAdapter(),
    new PhpLanguageAdapter(),
  ]

  for (const adapter of adapters) {
    registry.register(adapter)
  }

  it('declares authoritative parser policy on every registered adapter', () => {
    for (const adapter of adapters) {
      const policy = adapter.declarationPolicy?.()
      expect(
        policy,
        `adapter for ${adapter.languages().join(', ')} must define declarationPolicy`,
      ).toBeDefined()
      expect(policy?.structuralFactsAreParserAuthoritative).toBe(true)
      expect(policy?.callableContainerKinds).toBeInstanceOf(Set)
      expect(policy?.callableContainerKinds.size).toBeGreaterThan(0)
      expect(policy?.supportsPhysicalOnlyDeclarations).toBe(true)
    }
  })

  describe('constructs the parser cannot prove', () => {
    const broken: Record<string, { file: string; code: string; intact: string }> = {
      typescript: {
        file: 'ws:broken.ts',
        code: 'export function ok(): void { fine() }\nexport function broken( { leak( \n',
        intact: 'ok',
      },
      python: {
        file: 'ws:broken.py',
        code: 'def ok():\n    fine()\n\ndef broken(:\n    leak(\n',
        intact: 'ok',
      },
      go: {
        file: 'ws:broken.go',
        code: 'package a\nfunc Ok() { fine() }\nfunc Broken( { leak( \n',
        intact: 'Ok',
      },
      php: {
        file: 'ws:broken.php',
        code: '<?php\nfunction ok() { fine(); }\nfunction broken( { leak( \n',
        intact: 'ok',
      },
    }

    for (const [lang, fixture] of Object.entries(broken)) {
      it(`keeps intact facts and emits none for a broken ${lang} construct`, () => {
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath: fixture.file,
          projectRelativePath: fixture.file,
          language: lang,
          contentHash: 'x',
          workspace: 'ws',
        })
        const draft = registry
          .getAdapter(lang)!
          .analyzeFile(fixture.file, fixture.code, { session, workspaceName: 'ws' })

        expect(draft.symbols.map((symbol) => symbol.name)).toEqual([fixture.intact])
        expect(draft.callFacts.map((fact) => fact.name)).toEqual(['fine'])
        expect(draft.callFacts[0]!.callerSymbolId).toBe(draft.symbols[0]!.id)
      })
    }
  })

  describe('manifest text never becomes source facts', () => {
    const manifests: Record<string, { manifest: string; content: string; source: string }> = {
      typescript: {
        manifest: 'package.json',
        content: JSON.stringify({
          name: 'manifest-ts',
          description: 'export function evil(): void { leak() } import x from "./x"',
        }),
        source: 'index.ts',
      },
      python: {
        manifest: 'pyproject.toml',
        content: '[project]\nname = "manifest-py"\ndescription = "def evil(): leak()  import os"\n',
        source: 'main.py',
      },
      go: {
        manifest: 'go.mod',
        content: 'module example.com/manifest\n\n// func Evil() { leak() } import "fmt"\ngo 1.22\n',
        source: 'main.go',
      },
      php: {
        manifest: 'composer.json',
        content: JSON.stringify({
          name: 'acme/manifest',
          description: '<?php function evil() { leak(); } use Foo\\\\Bar;',
          autoload: { 'psr-4': { 'App\\\\': 'src/' } },
        }),
        source: 'main.php',
      },
    }
    const sources: Record<string, string> = {
      typescript: 'export function real(): void {}\n',
      python: 'def real():\n    pass\n',
      go: 'package main\nfunc Real() {}\n',
      php: '<?php\nfunction real() {}\n',
    }

    for (const [lang, fixture] of Object.entries(manifests)) {
      it(`ignores code-like ${fixture.manifest} text for ${lang}`, async () => {
        const store = new InMemoryGraphStore()
        await store.open()
        await indexProject(
          store,
          registry,
          writeProject({ [fixture.manifest]: fixture.content, [fixture.source]: sources[lang]! }),
        )

        const files = await store.getAllFiles()
        const symbols = await store.findSymbols({ filePaths: files.map((file) => file.path) })
        expect(files.some((file) => file.path.endsWith(fixture.manifest))).toBe(false)
        expect(symbols.map((symbol) => symbol.name.toLowerCase())).not.toContain('evil')
        expect(symbols.map((symbol) => symbol.name.toLowerCase())).toContain('real')
        expect(
          store
            .allRelationsForTest()
            .some((relation) => `${relation.source}|${relation.target}`.includes(fixture.manifest)),
        ).toBe(false)
        await store.close()
      })
    }
  })

  it('requires every primary registered language to have a conformance fixture', () => {
    const primaryLanguages = ['typescript', 'python', 'go', 'php']
    for (const lang of primaryLanguages) {
      expect(registry.getAdapter(lang), `registry must have adapter for ${lang}`).toBeDefined()
      expect(
        CONFORMANCE_FIXTURES[lang],
        `conformance fixtures must exist for ${lang}`,
      ).toBeDefined()
    }
  })

  it('requires every adapter fixture to declare every structural boundary explicitly', () => {
    const requiredCases: readonly StructuralBoundaryCase[] = [
      'optionalCall',
      'chainedCall',
      'computedCall',
      'genericCall',
      'nestedCall',
      'multilineCall',
      'sameLineCall',
      'lookalikeIsolation',
      'unresolvedImport',
      'importedHierarchy',
      'noPass2Io',
    ]
    for (const fixture of Object.values(CONFORMANCE_FIXTURES)) {
      expect(Object.keys(fixture.boundarySupport).sort()).toEqual([...requiredCases].sort())
      for (const boundaryCase of requiredCases) {
        expect(typeof fixture.boundarySupport[boundaryCase]).toBe('boolean')
      }
    }
  })

  for (const [lang, fixture] of Object.entries(CONFORMANCE_FIXTURES)) {
    describe(`conformance for ${lang}`, () => {
      const adapter = registry.getAdapter(lang)!

      it('produces output for every capability the adapter advertises', async () => {
        const capabilities = (
          adapter as LanguageAdapter & {
            capabilities?: () => Record<string, boolean>
          }
        ).capabilities?.()
        expect(capabilities, `${lang} must expose capabilities()`).toBeDefined()
        const store = new InMemoryGraphStore()
        await store.open()
        await indexProject(
          store,
          registry,
          writeProject({
            ...fixture.impactFiles,
            ...(fixture.hierarchy?.files ?? {}),
          }),
        )
        const facts = await store.getAllReferenceFacts()

        if (capabilities!['declarations'] === true)
          expect(facts.declarations.length).toBeGreaterThan(0)
        if (capabilities!['publicBindings'] === true)
          expect(facts.publicBindings.length).toBeGreaterThan(0)
        if (capabilities!['localBindings'] === true && fixture.hierarchy !== undefined) {
          expect(facts.localBindings.length).toBeGreaterThan(0)
        }
        if (capabilities!['hierarchy'] === true && fixture.hierarchy !== undefined) {
          expect(facts.steps.length).toBeGreaterThan(0)
        }
        await store.close()
      })

      it('does not attribute an uncontained call to the preceding callable (no nearest-preceding fallback)', () => {
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath: fixture.fileName,
          projectRelativePath: fixture.fileName,
          language: lang,
          contentHash: 'hash1',
          workspace: 'ws',
        })

        const draft = adapter.analyzeFile(fixture.fileName, fixture.callerOutsideSnippet, {
          session,
          workspaceName: 'ws',
        })

        expect(draft.callFacts.length).toBeGreaterThan(0)
        const uncontainedCall = draft.callFacts[0]!
        expect(
          uncontainedCall.callerSymbolId,
          `call outside any callable must have callerSymbolId=undefined in ${lang}`,
        ).toBeUndefined()
        expect(
          attributesCallOutsideCallerRange(adapter, fixture.fileName, fixture.callerOutsideSnippet),
          `no call may be attributed to a callable whose range does not contain it in ${lang}`,
        ).toBe(false)
      })

      it('attributes a contained call to its enclosing callable', () => {
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath: fixture.fileName,
          projectRelativePath: fixture.fileName,
          language: lang,
          contentHash: 'hash2',
          workspace: 'ws',
        })

        const draft = adapter.analyzeFile(fixture.fileName, fixture.containedCallerSnippet, {
          session,
          workspaceName: 'ws',
        })

        expect(draft.callFacts.length).toBeGreaterThan(0)
        const call = draft.callFacts[0]!
        expect(call.callerSymbolId).toBeDefined()
        const callerSymbol = draft.symbols.find((s) => s.id === call.callerSymbolId)
        expect(callerSymbol).toBeDefined()
      })

      it('establishes canonical logical owners and separates same-name methods in distinct owners', () => {
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath: fixture.fileName,
          projectRelativePath: fixture.fileName,
          language: lang,
          contentHash: 'hash3',
          workspace: 'ws',
        })

        const draft = adapter.analyzeFile(fixture.fileName, fixture.ownershipSnippet, {
          session,
          workspaceName: 'ws',
        })

        const declarations = draft.referenceFacts?.declarations ?? []
        const saveDecls = declarations.filter((d) => d.symbolId.toLowerCase().includes('save'))
        expect(saveDecls.length).toBe(2)
        expect(
          saveDecls[0]!.logicalId,
          `same-name methods in distinct owners must have distinct logicalIds in ${lang}`,
        ).not.toBe(saveDecls[1]!.logicalId)
      })

      it('classifies physical-only declarations with physical symbol and no logical declaration target', () => {
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath: fixture.fileName,
          projectRelativePath: fixture.fileName,
          language: lang,
          contentHash: 'hash4',
          workspace: 'ws',
        })

        const draft = adapter.analyzeFile(fixture.fileName, fixture.physicalOnlySnippet, {
          session,
          workspaceName: 'ws',
        })

        const physicalSymbol = draft.symbols.find((s) =>
          s.name.toLowerCase().includes(fixture.physicalOnlySymbolName.toLowerCase()),
        )
        expect(
          physicalSymbol,
          `physical-only symbol "${fixture.physicalOnlySymbolName}" must exist in symbols list in ${lang}`,
        ).toBeDefined()

        const logicalDecls = draft.referenceFacts?.declarations ?? []
        const logicalTarget = logicalDecls.find((d) => d.symbolId === physicalSymbol?.id)
        expect(
          logicalTarget,
          `physical-only symbol must not produce a logical declaration in ${lang}`,
        ).toBeUndefined()
      })

      it('produces identical facts on repeated runs (deterministic stability)', () => {
        const session1 = new InMemoryIndexSession()
        const session2 = new InMemoryIndexSession()

        const draft1 = adapter.analyzeFile(fixture.fileName, fixture.containedCallerSnippet, {
          session: session1,
          workspaceName: 'ws',
        })
        const draft2 = adapter.analyzeFile(fixture.fileName, fixture.containedCallerSnippet, {
          session: session2,
          workspaceName: 'ws',
        })

        expect(draft1.symbols.map((s) => s.id)).toEqual(draft2.symbols.map((s) => s.id))
        expect(draft1.callFacts).toEqual(draft2.callFacts)
        expect(draft1.referenceFacts?.declarations).toEqual(draft2.referenceFacts?.declarations)
      })

      it('emits structural facts only for parser-proven multiline syntax', () => {
        const session = new InMemoryIndexSession()
        const draft = adapter.analyzeFile(fixture.fileName, fixture.structuralBoundarySnippet, {
          session,
          workspaceName: 'ws',
        })

        expect(
          draft.callFacts.filter((fact) => fact.name === fixture.structuralCallName),
        ).toHaveLength(1)
        expect(draft.callFacts.some((fact) => fact.name === fixture.structuralLookalikeName)).toBe(
          false,
        )
      })

      it('retains distinct parser-proven calls on one physical line', () => {
        const draft = adapter.analyzeFile(fixture.fileName, fixture.sameLineSnippet, {
          session: new InMemoryIndexSession(),
          workspaceName: 'ws',
        })
        for (const callName of fixture.sameLineCallNames) {
          expect(draft.callFacts.filter((fact) => fact.name === callName)).toHaveLength(1)
        }
      })

      for (const boundaryCase of [
        'optionalCall',
        'chainedCall',
        'computedCall',
        'genericCall',
      ] as const) {
        it(`emits the ${boundaryCase} call fact exactly when the fixture declares it supported`, () => {
          const snippet = fixture.boundarySnippets[boundaryCase]
          if (snippet === undefined) {
            // The language has no such syntax, so it cannot be declared supported.
            expect(
              fixture.boundarySupport[boundaryCase],
              `${lang} declares unsupported syntax`,
            ).toBe(false)
            return
          }
          const draft = adapter.analyzeFile(fixture.fileName, snippet.code, {
            session: new InMemoryIndexSession(),
            workspaceName: 'ws',
          })
          const emitted = draft.callFacts.some((fact) => fact.name === snippet.callName)
          expect(
            emitted,
            `${boundaryCase} support declaration must match emitted facts in ${lang}`,
          ).toBe(fixture.boundarySupport[boundaryCase])
        })
      }

      it('keeps equally named local declarations in competing lexical scopes from sharing a logical target', () => {
        const draft = adapter.analyzeFile(fixture.fileName, fixture.lexicalScopeSnippet, {
          session: new InMemoryIndexSession(),
          workspaceName: 'ws',
        })
        const logicalIds = (draft.referenceFacts?.declarations ?? [])
          .filter(
            (d) =>
              draft.symbols.find((s) => s.id === d.symbolId)?.name === fixture.lexicalScopeName,
          )
          .map((d) => d.logicalId)
        expect(
          new Set(logicalIds).size,
          `competing scopes must not share one logical id in ${lang}`,
        ).toBe(logicalIds.length)
      })

      it('declares overload grouping consistently with its policy and retains every occurrence', () => {
        const policy = adapter.declarationPolicy?.()
        expect(policy?.supportsLogicalDeclarationGroups).toBe(fixture.overload !== undefined)
        if (fixture.overload === undefined) return

        const draft = adapter.analyzeFile(fixture.fileName, fixture.overload.snippet, {
          session: new InMemoryIndexSession(),
          workspaceName: 'ws',
        })
        const occurrences = (draft.referenceFacts?.declarations ?? []).filter(
          (d) => draft.symbols.find((s) => s.id === d.symbolId)?.name === fixture.overload!.name,
        )
        expect(occurrences).toHaveLength(fixture.overload.occurrences)
        expect(new Set(occurrences.map((d) => d.logicalId)).size).toBe(1)
        expect(new Set(occurrences.map((d) => d.symbolId)).size).toBe(fixture.overload.occurrences)
      })

      it('finds logical coverage of a reached caller after physical impact traversal', async () => {
        const project = writeProject(fixture.impactFiles)
        const store = new InMemoryGraphStore()
        await store.open()
        await indexProject(store, registry, project)

        const facts = await store.getAllReferenceFacts()
        const logicalOf = (name: string) => {
          const symbol = (facts.declarations ?? []).find(
            (entry) =>
              entry.declaration.symbolId.includes(`:${name}:`) ||
              entry.declaration.symbolId.endsWith(`:${name}`),
          )
          const logical = facts.logicalSymbols.find((l) => l.id === symbol?.logicalSymbolId)
          return { symbol, logical }
        }
        const callee = logicalOf(fixture.impactCalleeName)
        const caller = logicalOf(fixture.impactCallerName)
        expect(callee.logical, `callee must have a logical target in ${lang}`).toBeDefined()
        expect(caller.logical, `caller must have a logical target in ${lang}`).toBeDefined()

        await store.upsertSpec(
          createSpecNode({
            specId: 'spec:covers-caller',
            path: 'specs/covers-caller',
            title: 'Covers caller',
            contentHash: 'hash:covers',
            workspace: 'ws',
          }),
          [
            createRelation({
              source: 'spec:covers-caller',
              target: caller.logical!.id,
              type: RelationType.CoversSymbol,
            }),
          ],
        )

        const impact = await analyzeResolvedSymbolImpact(
          store,
          {
            kind: 'logical-target',
            logicalSymbol: callee.logical!,
            declarations: [callee.symbol!.declaration],
            path: [],
          },
          'upstream',
        )

        expect(impact.coveringSpecs.map((spec) => spec.specId)).toContain('spec:covers-caller')
        rmSync(project, { recursive: true, force: true })
        await store.close()
      })

      it('retains matching import provenance on imported hierarchy relations', async () => {
        if (fixture.hierarchy === undefined) {
          expect(fixture.boundarySupport.importedHierarchy).toBe(false)
          return
        }
        expect(fixture.boundarySupport.importedHierarchy).toBe(true)
        const project = writeProject(fixture.hierarchy.files)
        const store = new InMemoryGraphStore()
        await store.open()
        await indexProject(store, registry, project)

        const child = (await store.findSymbols({ name: fixture.hierarchy.childName }))[0]
        expect(child, `child class must be indexed in ${lang}`).toBeDefined()
        const hierarchy = store
          .allRelationsForTest()
          .filter(
            (relation) =>
              relation.source === child!.id &&
              (relation.type === RelationType.Extends || relation.type === RelationType.Implements),
          )
        expect(hierarchy).toHaveLength(1)
        expect(hierarchy[0]!.metadata).toMatchObject({
          importProvenance: { kind: 'import', resolvedTargetSymbolId: hierarchy[0]!.target },
        })
        rmSync(project, { recursive: true, force: true })
        await store.close()
      })

      it('performs no filesystem metadata reads in per-file relation analysis after preparation', () => {
        const project = writeProject(fixture.impactFiles)
        const session = new InMemoryIndexSession()
        const analyses = Object.entries(fixture.impactFiles).map(([name, content]) => {
          const filePath = `ws:${name}`
          session.registerFile({
            filePath,
            projectRelativePath: name,
            language: lang,
            contentHash: `hash:${name}`,
            workspace: 'ws',
          })
          const draft = adapter.analyzeFile(filePath, content, {
            session,
            workspaceName: 'ws',
            codeRoot: project,
          })
          return session.registerAnalysis({ filePath, analysis: draft })
        })
        const reads = [nodeFs.readFileSync, nodeFs.statSync, nodeFs.existsSync, nodeFs.readdirSync]
        for (const spy of reads) vi.mocked(spy).mockClear()

        for (const analysis of analyses) {
          const resolved = adapter.resolveImports(analysis, {
            session,
            qualifiedNames: new Map(),
            packageToWorkspace: new Map(),
            codeRoot: project,
          })
          adapter.buildRelations(analysis, { session, resolvedImports: resolved })
        }

        for (const spy of reads) {
          expect(
            vi.mocked(spy),
            `${spy.name} must not run in pass 2 for ${lang}`,
          ).not.toHaveBeenCalled()
        }
        rmSync(project, { recursive: true, force: true })
      })

      it('produces the same semantic graph incrementally as from a clean rebuild after an identity-sensitive edit', async () => {
        const project = writeProject(fixture.incremental.files)
        const incremental = new InMemoryGraphStore()
        await incremental.open()
        await indexProject(incremental, registry, project)

        const editPath = join(project, fixture.incremental.editFile)
        const original = readFileSync(editPath, 'utf8')
        expect(original).toContain(fixture.incremental.before)
        writeFileSync(
          editPath,
          original.replace(fixture.incremental.before, fixture.incremental.after),
        )
        await indexProject(incremental, registry, project)

        const clean = new InMemoryGraphStore()
        await clean.open()
        await indexProject(clean, registry, project)

        expect(await semanticState(incremental)).toEqual(await semanticState(clean))
        rmSync(project, { recursive: true, force: true })
        await incremental.close()
        await clean.close()
      })

      it('keeps unresolved import syntax as evidence without guessing a target', () => {
        const session = new InMemoryIndexSession()
        session.registerFile({
          filePath: fixture.fileName,
          projectRelativePath: fixture.fileName,
          language: lang,
          contentHash: 'unresolved-import',
          workspace: 'ws',
        })
        const draft = adapter.analyzeFile(fixture.fileName, fixture.unresolvedImportSnippet, {
          session,
          workspaceName: 'ws',
        })
        const analysis = session.registerAnalysis({ filePath: fixture.fileName, analysis: draft })
        const resolved = adapter.resolveImports(analysis, {
          session,
          qualifiedNames: new Map(),
          packageToWorkspace: new Map(),
        })
        expect(resolved.importMap.size).toBe(0)
        expect(resolved.fileImports).toEqual([])
      })
    })
  }

  describe('Non-conformant adapter rejection', () => {
    it('fails conformance when an adapter uses nearest-preceding caller fallback', () => {
      // Create a mock non-conformant adapter that attributes uncontained calls to preceding function
      const nonConformantAdapter: LanguageAdapter = {
        languages: () => ['pseudo'],
        extensions: () => ({ '.pseudo': 'pseudo' }),
        resolutionManifests: () => [],
        declarationPolicy: () => ({
          languageIds: ['pseudo'],
          callableContainerKinds: new Set([SymbolKind.Function]),
          supportsLogicalDeclarationGroups: false,
          supportsPhysicalOnlyDeclarations: true,
          structuralFactsAreParserAuthoritative: true,
        }),
        analyzeFile: (filePath: string, content: string) => {
          // Nearest preceding simulation: assigns callerSymbolId to preceding function
          return {
            language: 'pseudo',
            symbols: [
              {
                id: `${filePath}:function:doWork:1:0`,
                name: 'doWork',
                kind: SymbolKind.Function,
                filePath,
                line: 1,
                column: 0,
                endLine: 3,
                endColumn: 1,
              } as SymbolNode,
            ],
            imports: [],
            bindingFacts: [],
            callFacts: [
              {
                filePath,
                scopeId: filePath,
                form: 'free',
                name: 'externalCall',
                receiverName: undefined,
                targetName: 'externalCall',
                arity: 0,
                expression: 'externalCall()',
                location: { filePath, line: 4, column: 0 },
                metadata: undefined,
                // Non-conformant: assigns doWork even though call is at line 4 (outside [1, 3])
                callerSymbolId: `${filePath}:function:doWork:1:0`,
              },
            ],
          }
        },
        resolveImports: () => ({ importMap: new Map(), fileImports: [] }),
        buildRelations: () => [],
      }

      const session = new InMemoryIndexSession()
      const draft = nonConformantAdapter.analyzeFile(
        'test.pseudo',
        'function doWork() {}\nexternalCall()',
        {
          session,
          workspaceName: 'ws',
        },
      )

      // The same detector that passes every real adapter must reject this one.
      expect(draft.callFacts).toHaveLength(1)
      expect(
        attributesCallOutsideCallerRange(
          nonConformantAdapter,
          'test.pseudo',
          'function doWork() {}\nexternalCall()',
        ),
        'non-conformant nearest-preceding adapter must be detected and rejected',
      ).toBe(true)
    })
  })
})
