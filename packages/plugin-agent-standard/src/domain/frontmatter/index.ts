import type { Frontmatter } from '../types/frontmatter.js'

export const skillFrontmatter: Readonly<Record<string, Frontmatter>> = {
  specd: {
    name: 'specd',
    description: 'Entry point for specd lifecycle orientation and next-step guidance.',
    'allowed-tools': 'Bash(node:*) Bash(specd:*) Read',
  },
  'specd-archive': {
    name: 'specd-archive',
    description: 'Archive a specd change by merging validated deltas into workspace specs.',
    'allowed-tools': 'Bash(node:*) Bash(specd:*) Read',
  },
  'specd-design': {
    name: 'specd-design',
    description: 'Write or revise specd design artifacts for an active change.',
    'allowed-tools': 'Bash(node:*) Bash(pnpm:*) Bash(specd:*) Read Write Edit Grep Glob',
  },
  'specd-implement': {
    name: 'specd-implement',
    description: 'Implement code for a specd change and advance task checklist progress.',
    'allowed-tools': 'Bash(node:*) Bash(pnpm:*) Bash(specd:*) Read Write Edit Grep Glob',
  },
  'specd-new': {
    name: 'specd-new',
    description: 'Create a new specd change from intent discovery.',
    'allowed-tools': 'Bash(node:*) Bash(specd:*) Read Grep Glob',
  },
  'specd-metadata': {
    name: 'specd-metadata',
    description: 'Generate and maintain spec metadata artifacts.',
    'allowed-tools': 'Bash(node:*) Bash(specd:*) Bash(cat:*) Bash(rm:*) Bash(shasum:*) Read',
  },
  'specd-compliance': {
    name: 'specd-compliance',
    description: 'Run specs-compliance review between implementation and specs.',
    'allowed-tools':
      'Bash(git:*) Bash(gh:*) Bash(mkdir:*) Bash(date:*) Bash(cat:*) Bash(specd:*) Read Grep Glob Write',
  },
  'specd-verify': {
    name: 'specd-verify',
    description: 'Verify implementation against spec scenarios for a change.',
    'allowed-tools': 'Bash(node:*) Bash(pnpm:*) Bash(specd:*) Read Grep Glob',
  },
}
