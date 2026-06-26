import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerProjectStatus } from '../../src/commands/project/status.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('project status', () => {
  it('command name is status', async () => {
    const { kernel } = setup()
    kernel.project.listWorkspaces.execute.mockResolvedValue([])
    kernel.changes.list.execute.mockResolvedValue([])
    kernel.changes.listDrafts.execute.mockResolvedValue([])
    kernel.changes.listDiscarded.execute.mockResolvedValue([])

    const program = makeProgram()
    const projectCmd = program.command('project')
    registerProjectStatus(projectCmd)

    const statusCmd = projectCmd.commands.find((c) => c.name() === 'status')
    expect(statusCmd).toBeDefined()
  })

  describe('--context', () => {
    it('prefers optimized project context when fresh', async () => {
      const { config, kernel, stdout } = setup()
      Object.assign(config, {
        llmOptimizedContext: true,
      })
      kernel.project.listWorkspaces.execute.mockResolvedValue([])
      kernel.changes.list.execute.mockResolvedValue([])
      kernel.changes.listDrafts.execute.mockResolvedValue([])
      kernel.changes.listDiscarded.execute.mockResolvedValue([])

      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: ['**Optimized Context**'],
        specs: [],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      const out = stdout()
      expect(out).toContain('context:')
      expect(out).toContain('**Optimized Context**')
    })

    it('emits warning when optimized context is missing', async () => {
      const { config, kernel, stderr } = setup()
      Object.assign(config, {
        llmOptimizedContext: true,
      })
      kernel.project.listWorkspaces.execute.mockResolvedValue([])
      kernel.changes.list.execute.mockResolvedValue([])
      kernel.changes.listDrafts.execute.mockResolvedValue([])
      kernel.changes.listDiscarded.execute.mockResolvedValue([])

      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: ['Raw instructions'],
        specs: [],
        warnings: [
          {
            type: 'stale-optimization',
            message:
              'Project-level optimized context is missing. Launch specd-project-context-optimizer agent to generate it.',
          },
        ],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      expect(stderr()).toContain('warning: Project-level optimized context is missing')
      expect(stderr()).toContain('specd-project-context-optimizer')
    })

    it('displays full context in text mode', async () => {
      const { config, kernel, stdout } = setup()
      kernel.project.listWorkspaces.execute.mockResolvedValue([])
      kernel.changes.list.execute.mockResolvedValue([])
      kernel.changes.listDrafts.execute.mockResolvedValue([])
      kernel.changes.listDiscarded.execute.mockResolvedValue([])

      const longContext = 'Line 1\nLine 2\nLine 3\nLine 4'
      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: [longContext],
        specs: [],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      const out = stdout()
      expect(out).toContain('Line 1')
      expect(out).toContain('Line 2')
      expect(out).toContain('Line 3')
      expect(out).toContain('Line 4')
    })

    it('does not pass inline CompileContextConfig on getProjectContext.execute', async () => {
      const { kernel } = setup()
      kernel.project.listWorkspaces.execute.mockResolvedValue([])
      kernel.changes.list.execute.mockResolvedValue([])
      kernel.changes.listDrafts.execute.mockResolvedValue([])
      kernel.changes.listDiscarded.execute.mockResolvedValue([])
      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: [],
        specs: [],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      for (const call of kernel.project.getProjectContext.execute.mock.calls) {
        expect(call[0]).not.toHaveProperty('config')
      }
    })

    it('calls getProjectContext.execute({}) for primary context assembly', async () => {
      const { kernel } = setup()
      kernel.project.listWorkspaces.execute.mockResolvedValue([])
      kernel.changes.list.execute.mockResolvedValue([])
      kernel.changes.listDrafts.execute.mockResolvedValue([])
      kernel.changes.listDiscarded.execute.mockResolvedValue([])
      kernel.project.getProjectContext.execute.mockResolvedValue({
        contextEntries: ['Raw'],
        specs: [
          {
            specId: 'default:a',
            title: 'A',
            description: '',
            source: 'includePattern',
            mode: 'summary',
          },
        ],
        warnings: [],
      })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      expect(kernel.project.getProjectContext.execute.mock.calls[0]![0]).toEqual({})
    })

    it('calls getProjectContext.execute({ llmOptimizedContext: false }) for raw spec catalogue when optimized context is fresh', async () => {
      const { config, kernel } = setup()
      Object.assign(config, { llmOptimizedContext: true })
      kernel.project.listWorkspaces.execute.mockResolvedValue([])
      kernel.changes.list.execute.mockResolvedValue([])
      kernel.changes.listDrafts.execute.mockResolvedValue([])
      kernel.changes.listDiscarded.execute.mockResolvedValue([])

      kernel.project.getProjectContext.execute
        .mockResolvedValueOnce({
          contextEntries: ['**Optimized**'],
          specs: [],
          warnings: [],
        })
        .mockResolvedValueOnce({
          contextEntries: [],
          specs: [
            {
              specId: 'default:auth/login',
              title: 'Login',
              description: '',
              source: 'includePattern' as const,
              mode: 'summary' as const,
            },
          ],
          warnings: [],
        })

      const program = makeProgram()
      registerProjectStatus(program.command('project'))
      await program.parseAsync(['node', 'specd', 'project', 'status', '--context'])

      expect(kernel.project.getProjectContext.execute).toHaveBeenCalledTimes(2)
      expect(kernel.project.getProjectContext.execute.mock.calls[1]![0]).toEqual({
        llmOptimizedContext: false,
      })
    })
  })
})
