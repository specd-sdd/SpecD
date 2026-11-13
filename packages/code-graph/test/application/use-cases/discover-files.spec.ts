import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createDiscoveryEvaluator,
  discoverFiles,
  DEFAULT_EXCLUDE_PATHS,
} from '../../../src/application/use-cases/discover-files.js'

/** Creates a file at the given path, creating parent directories as needed. */
function touch(root: string, relPath: string, content = ''): void {
  const full = join(root, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}

/** A hasAdapter predicate that accepts all `.ts` files. */
const allTs = (filePath: string): boolean => filePath.endsWith('.ts')
const noVcs = { vcsRoot: null } as const

describe('discoverFiles', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'discover-files-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('DEFAULT_EXCLUDE_PATHS applied when no options', () => {
    it('excludes node_modules/ by default', () => {
      touch(root, 'src/index.ts')
      touch(root, 'node_modules/dep/index.ts')

      const files = discoverFiles(root, allTs)

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('node_modules/dep/index.ts')
    })

    it('excludes .specd/ by default', () => {
      touch(root, 'src/index.ts')
      touch(root, '.specd/metadata/spec.ts')

      const files = discoverFiles(root, allTs)

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('.specd/metadata/spec.ts')
    })

    it('excludes dist/ by default', () => {
      touch(root, 'src/index.ts')
      touch(root, 'dist/index.ts')

      const files = discoverFiles(root, allTs)

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('dist/index.ts')
    })
  })

  describe('custom excludePaths replaces defaults', () => {
    it('node_modules/ is discovered when not in custom excludePaths', () => {
      touch(root, 'src/index.ts')
      touch(root, 'node_modules/dep/index.ts')

      const files = discoverFiles(root, allTs, {
        ...noVcs,
        excludePaths: ['custom-exclude/'],
      })

      expect(files).toContain('src/index.ts')
      expect(files).toContain('node_modules/dep/index.ts')
    })

    it('custom dir is excluded when listed in excludePaths', () => {
      touch(root, 'src/index.ts')
      touch(root, 'fixtures/helper.ts')

      const files = discoverFiles(root, allTs, {
        ...noVcs,
        excludePaths: ['fixtures/'],
      })

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('fixtures/helper.ts')
    })
  })

  describe('negation re-includes subdirectory', () => {
    it('!.specd/metadata/ re-includes metadata subdir when .specd/* is excluded', () => {
      touch(root, 'src/index.ts')
      touch(root, '.specd/internal/config.ts')
      touch(root, '.specd/metadata/spec.ts')

      const files = discoverFiles(root, allTs, {
        ...noVcs,
        excludePaths: ['.specd/*', '!.specd/metadata/'],
      })

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('.specd/internal/config.ts')
      expect(files).toContain('.specd/metadata/spec.ts')
    })
  })

  describe('respectGitignore: false ignores .gitignore', () => {
    it('discovers .gitignore-excluded files when respectGitignore is false', () => {
      touch(root, 'src/index.ts')
      touch(root, 'src/generated.ts')
      writeFileSync(join(root, '.gitignore'), 'generated.ts\n')

      const filesWithGitignore = discoverFiles(root, allTs)
      const filesWithout = discoverFiles(root, allTs, {
        ...noVcs,
        respectGitignore: false,
      })

      expect(filesWithGitignore).not.toContain('src/generated.ts')
      expect(filesWithout).toContain('src/generated.ts')
    })
  })

  describe('gitignore has absolute priority over excludePaths', () => {
    it('!generated/ in excludePaths cannot re-include a gitignored directory', () => {
      touch(root, 'src/index.ts')
      touch(root, 'generated/output.ts')
      writeFileSync(join(root, '.gitignore'), 'generated/\n')

      const files = discoverFiles(root, allTs, {
        ...noVcs,
        excludePaths: ['node_modules/', '!generated/'],
      })

      expect(files).toContain('src/index.ts')
      expect(files).not.toContain('generated/output.ts')
    })
  })

  describe('empty excludePaths excludes nothing', () => {
    it('discovers node_modules/ when excludePaths is an empty array', () => {
      touch(root, 'src/index.ts')
      touch(root, 'node_modules/dep/index.ts')

      const files = discoverFiles(root, allTs, {
        ...noVcs,
        excludePaths: [],
      })

      expect(files).toContain('src/index.ts')
      expect(files).toContain('node_modules/dep/index.ts')
    })
  })

  describe('binary file filtering', () => {
    it('skips known binary extensions even without hasAdapter', () => {
      touch(root, 'src/main.ts')
      touch(root, 'assets/logo.png')
      touch(root, 'docs/manual.pdf')
      touch(root, 'data/dump.sql')

      const files = discoverFiles(root)

      expect(files).toContain('src/main.ts')
      expect(files).not.toContain('assets/logo.png')
      expect(files).not.toContain('docs/manual.pdf')
      expect(files).not.toContain('data/dump.sql')
    })
  })

  describe('DEFAULT_EXCLUDE_PATHS export', () => {
    it('includes expected built-in paths', () => {
      expect(DEFAULT_EXCLUDE_PATHS).toContain('node_modules/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('.git/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('.specd/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('dist/')
      expect(DEFAULT_EXCLUDE_PATHS).toContain('build/')
    })
  })

  describe('project-relative path semantics', () => {
    const find = (
      options: Parameters<typeof discoverFiles>[2],
      hasAdapter: (file: string) => boolean = () => true,
    ): string[] => discoverFiles(root, hasAdapter, options).sort()

    beforeEach(() => {
      touch(root, 'vendors/iccms/utils.php')
      touch(root, 'vendors/other/x.php')
      touch(root, 'tmp/c.dat')
      touch(root, 'webroot/js/astrack/a.js')
      touch(root, 'gen/keep.php')
      touch(root, 'gen/other.php')
    })

    it('Given an anchored global pattern and pathBase app, then it excludes inside the nested workspace', () => {
      const files = find({
        vcsRoot: null,
        pathBase: 'app',
        excludePaths: ['/app/vendors/*', '!/app/vendors/iccms', '!/app/vendors/iccms/**'],
      })
      expect(files).toContain('vendors/iccms/utils.php')
      expect(files).not.toContain('vendors/other/x.php')
    })

    it('Given the code-root-relative form, then it no longer matches', () => {
      const files = find({ vcsRoot: null, pathBase: 'app', excludePaths: ['/vendors/*'] })
      expect(files).toContain('vendors/iccms/utils.php')
      expect(files).toContain('vendors/other/x.php')
    })

    it('Given a directory excluded by a project-relative pattern, then the walk never reads it', () => {
      const seen: string[] = []
      const files = discoverFiles(root, () => true, {
        vcsRoot: null,
        pathBase: 'app',
        excludePaths: ['app/tmp/'],
        onInspectionError: (_error, path) => seen.push(path),
      })
      expect(files).not.toContain('tmp/c.dat')
      expect(seen).toEqual([])
    })

    it('Given a global exclusion and a workspace negation, then the global layer wins', () => {
      const files = find({
        vcsRoot: null,
        pathBase: 'app',
        excludePaths: ['app/vendors/*'],
        workspaceExcludePaths: ['!app/vendors/iccms'],
      })
      expect(files).not.toContain('vendors/iccms/utils.php')
    })

    it('Given workspace patterns with a negation, then it only reverses earlier workspace patterns', () => {
      const files = find({
        vcsRoot: null,
        pathBase: 'app',
        excludePaths: [],
        workspaceExcludePaths: ['app/gen/**', '!app/gen/keep.php'],
      })
      expect(files).toContain('gen/keep.php')
      expect(files).not.toContain('gen/other.php')
    })

    it('Given allowedPaths, then they are matched against the project-relative subject', () => {
      const files = find({
        vcsRoot: null,
        pathBase: 'packages/core',
        excludePaths: [],
        allowedPaths: ['packages/core/gen/**'],
      })
      expect(files.every((file) => file.startsWith('gen/'))).toBe(true)
      expect(files).toContain('gen/keep.php')
    })

    it('Given a nested pathBase, then the same project-relative pattern applies', () => {
      const files = find({
        vcsRoot: null,
        pathBase: 'app/webroot',
        excludePaths: ['app/webroot/js/astrack/'],
      })
      expect(files).not.toContain('webroot/js/astrack/a.js'.replace('webroot/', ''))
      expect(files).toContain('vendors/other/x.php')
    })

    it('Given a .gitignore, then it keeps absolute priority over negations in both layers', () => {
      touch(root, '.gitignore', 'build.log\n')
      touch(root, 'build.log')
      const files = find({
        vcsRoot: null,
        pathBase: 'app',
        excludePaths: ['!app/build.log'],
        workspaceExcludePaths: ['!app/build.log'],
      })
      expect(files).not.toContain('build.log')
    })

    it('Given a code root outside the project, then anchored patterns do not match and unanchored do', () => {
      touch(root, 'out.log')
      const files = find({
        vcsRoot: null,
        pathBase: '../shared',
        excludePaths: ['shared/gen/**', '*.log'],
      })
      expect(files).toContain('gen/other.php')
      expect(files).not.toContain('out.log')
    })

    it('Given default excludes, then they still exclude node_modules at depth', () => {
      touch(root, 'node_modules/x/index.ts')
      const files = find({ vcsRoot: null, pathBase: 'packages/core' })
      expect(files).not.toContain('node_modules/x/index.ts')
    })
  })

  describe('createDiscoveryEvaluator', () => {
    it('Given a gitignore match, then the decision carries the project-relative file and line', () => {
      touch(root, '.gitignore', '# comment\n*.log\nbuild.log\n')
      touch(root, 'sub/build.log')
      const evaluator = createDiscoveryEvaluator(root, { vcsRoot: null, pathBase: 'app' })
      const decision = evaluator.evaluatePath('sub/build.log')
      expect(decision).toMatchObject({
        kind: 'excluded',
        stage: 'gitignore',
        gitignoreSource: { file: 'app/.gitignore', line: 2 },
      })
    })

    it('Given an excluded ancestor directory, then the decision names it as viaDirectory', () => {
      touch(root, 'tmp/deep/a.ts')
      const evaluator = createDiscoveryEvaluator(root, {
        vcsRoot: null,
        pathBase: 'app',
        excludePaths: ['app/tmp/'],
      })
      expect(evaluator.evaluatePath('tmp/deep/a.ts')).toMatchObject({
        kind: 'excluded',
        stage: 'global-exclude',
        viaDirectory: 'app/tmp',
      })
    })

    it('Given allowedPaths that do not match, then the decision is allowed-paths with no rule', () => {
      touch(root, 'src/a.ts')
      const evaluator = createDiscoveryEvaluator(root, {
        vcsRoot: null,
        excludePaths: [],
        allowedPaths: ['lib/**'],
      })
      expect(evaluator.evaluatePath('src/a.ts')).toEqual({
        kind: 'excluded',
        stage: 'allowed-paths',
        rule: null,
      })
    })

    it('Given a workspace negation of a workspace pattern, then the file is included', () => {
      touch(root, 'gen/keep.php')
      const evaluator = createDiscoveryEvaluator(root, {
        vcsRoot: null,
        excludePaths: [],
        workspaceExcludePaths: ['gen/**', '!gen/keep.php'],
      })
      expect(evaluator.evaluatePath('gen/keep.php')).toEqual({ kind: 'included' })
    })
  })
})

describe('discoverFiles with a .gitignore above the discovery root', () => {
  let projectRoot: string

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'discover-files-vcs-'))
  })

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true })
  })

  it('Given a repository .gitignore and a codeRoot below the VCS root, then ignored files are excluded', () => {
    touch(projectRoot, '.gitignore', '*.log\nbuild/\n')
    touch(projectRoot, 'packages/core/a.log')
    touch(projectRoot, 'packages/core/b.ts')
    touch(projectRoot, 'packages/core/build/c.ts')
    const root = join(projectRoot, 'packages/core')

    const files = discoverFiles(root, () => true, {
      vcsRoot: projectRoot,
      pathBase: 'packages/core',
      excludePaths: [],
    })

    expect(files).toContain('b.ts')
    expect(files).not.toContain('a.log')
    expect(files).not.toContain('build/c.ts')
  })

  it('Given such a match, then the decision names the repository .gitignore with a project-relative path and line', () => {
    touch(projectRoot, '.gitignore', '# c\n*.log\n')
    touch(projectRoot, 'packages/core/a.log')
    const evaluator = createDiscoveryEvaluator(join(projectRoot, 'packages/core'), {
      vcsRoot: projectRoot,
      pathBase: 'packages/core',
      excludePaths: [],
    })

    expect(evaluator.evaluatePath('a.log')).toMatchObject({
      kind: 'excluded',
      stage: 'gitignore',
      gitignoreSource: { file: '.gitignore', line: 2 },
    })
  })

  it('Given a .gitignore in a directory between the VCS root and the codeRoot, then it applies', () => {
    touch(projectRoot, 'packages/.gitignore', '*.gen.ts\n')
    touch(projectRoot, 'packages/core/a.gen.ts')
    touch(projectRoot, 'packages/core/b.ts')

    const files = discoverFiles(join(projectRoot, 'packages/core'), () => true, {
      vcsRoot: projectRoot,
      pathBase: 'packages/core',
      excludePaths: [],
    })

    expect(files).toContain('b.ts')
    expect(files).not.toContain('a.gen.ts')
  })

  it('Given a nearer .gitignore that negates a farther one, then the nearer rule wins', () => {
    touch(projectRoot, '.gitignore', '*.log\n')
    touch(projectRoot, 'packages/.gitignore', '!keep.log\n')
    touch(projectRoot, 'packages/core/keep.log')
    touch(projectRoot, 'packages/core/drop.log')

    const files = discoverFiles(join(projectRoot, 'packages/core'), () => true, {
      vcsRoot: projectRoot,
      pathBase: 'packages/core',
      excludePaths: [],
    })

    expect(files).toContain('keep.log')
    expect(files).not.toContain('drop.log')
  })

  it('Given a VCS root spelled through a symlink, then the repository .gitignore still applies', () => {
    touch(projectRoot, '.gitignore', '*.log\n')
    touch(projectRoot, 'packages/core/a.log')
    touch(projectRoot, 'packages/core/b.ts')
    const link = `${projectRoot}-link`
    symlinkSync(projectRoot, link)
    try {
      const files = discoverFiles(join(projectRoot, 'packages/core'), () => true, {
        vcsRoot: link,
        pathBase: 'packages/core',
        excludePaths: [],
      })
      expect(files).toContain('b.ts')
      expect(files).not.toContain('a.log')
    } finally {
      rmSync(link, { force: true })
    }
  })

  it('Given projectRoot, then the .gitignore source is relative to it even through symlinks', () => {
    touch(projectRoot, '.gitignore', '*.log\n')
    touch(projectRoot, 'packages/core/a.log')
    const link = `${projectRoot}-codelink`
    symlinkSync(join(projectRoot, 'packages/core'), link)
    try {
      const evaluator = createDiscoveryEvaluator(link, {
        vcsRoot: projectRoot,
        projectRoot,
        pathBase: 'packages/core',
        excludePaths: [],
      })
      expect(evaluator.evaluatePath('a.log')).toMatchObject({
        kind: 'excluded',
        stage: 'gitignore',
        gitignoreSource: { file: '.gitignore', line: 1 },
      })
    } finally {
      rmSync(link, { force: true })
    }
  })

  it('Given a repository .gitignore above the project, then its source is reported in the ../ form', () => {
    const nested = join(projectRoot, 'project')
    touch(projectRoot, '.gitignore', '# c\n*.log\n')
    touch(nested, 'a.log')
    const evaluator = createDiscoveryEvaluator(nested, {
      vcsRoot: projectRoot,
      projectRoot: nested,
      pathBase: '',
      excludePaths: [],
    })
    expect(evaluator.evaluatePath('a.log')).toMatchObject({
      gitignoreSource: { file: '../.gitignore', line: 2 },
    })
  })

  it('Given duplicated patterns, then the first line is the deciding one', () => {
    touch(projectRoot, '.gitignore', '*.log\n# again\n*.log\n')
    touch(projectRoot, 'a.log')
    const evaluator = createDiscoveryEvaluator(projectRoot, {
      vcsRoot: projectRoot,
      excludePaths: [],
    })
    expect(evaluator.evaluatePath('a.log')).toMatchObject({
      gitignoreSource: { line: 1 },
    })
  })

  it('Given a nearer negation below a directory excluded farther up, then the path stays excluded', () => {
    touch(projectRoot, '.gitignore', 'build/\n')
    touch(projectRoot, 'packages/.gitignore', '!build/keep.txt\n')
    touch(projectRoot, 'packages/core/build/keep.txt')
    const root = join(projectRoot, 'packages/core')

    expect(
      discoverFiles(root, () => true, { vcsRoot: projectRoot, excludePaths: [] }),
    ).not.toContain('build/keep.txt')
    expect(
      createDiscoveryEvaluator(root, { vcsRoot: projectRoot, excludePaths: [] }).evaluatePath(
        'build/keep.txt',
      ),
    ).toMatchObject({ kind: 'excluded', stage: 'gitignore', viaDirectory: 'build' })
  })
})
