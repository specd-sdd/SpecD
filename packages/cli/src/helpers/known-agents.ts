import * as os from 'node:os'
import * as path from 'node:path'

/**
 *
 */
export interface AgentDirs {
  readonly projectDir: (root: string) => string
  readonly globalDir: string
}

export const KNOWN_AGENTS: Record<string, AgentDirs> = {
  claude: {
    projectDir: (root) => path.join(root, '.claude', 'commands'),
    globalDir: path.join(os.homedir(), '.claude', 'commands'),
  },
  copilot: {
    projectDir: (root) => path.join(root, '.github'),
    globalDir: path.join(os.homedir(), '.github'),
  },
  codex: {
    projectDir: (root) => path.join(root, '.codex'),
    globalDir: path.join(os.homedir(), '.codex'),
  },
}
