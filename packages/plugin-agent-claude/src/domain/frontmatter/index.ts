import type { Frontmatter } from '../types/frontmatter.js'

/**
 * Frontmatter map keyed by skill id.
 */
export const skillFrontmatter: Readonly<Record<string, Frontmatter>> = {
  specd: {
    name: 'specd',
    description: 'Entry point for specd lifecycle orientation and next-step guidance.',
    allowed_tools: 'Bash(node *), Read',
    argument_hint: '<change-name>',
  },
  'specd-archive': {
    name: 'specd-archive',
    description: 'Archive a specd change by merging validated deltas into workspace specs.',
    allowed_tools: 'Bash(node *), Read, TaskCreate, TaskUpdate',
    argument_hint: '<change-name>',
  },
  'specd-design': {
    name: 'specd-design',
    description: 'Write or revise specd design artifacts for an active change.',
    allowed_tools:
      'Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate',
    argument_hint: '<change-name>',
  },
  'specd-implement': {
    name: 'specd-implement',
    description: 'Implement code for a specd change and advance task checklist progress.',
    allowed_tools:
      'Bash(node *), Bash(pnpm *), Read, Write, Edit, Grep, Glob, Agent, TaskCreate, TaskUpdate, TaskList, TaskGet',
    argument_hint: '<change-name>',
  },
  'specd-new': {
    name: 'specd-new',
    description: 'Create a new specd change from intent discovery.',
    allowed_tools: 'Bash(node *), Read, Grep, Glob, Agent, TaskCreate, TaskUpdate',
    argument_hint: '<change-name>',
  },
  'specd-metadata': {
    name: 'specd-metadata',
    description: 'Generate and maintain spec metadata artifacts.',
    allowed_tools: 'Bash(node *), Bash(cat *), Bash(rm *), Bash(shasum *), Read, Agent',
    argument_hint: '<change-name>',
  },
  'specd-compliance': {
    name: 'specd-compliance',
    description: 'Run specs-compliance review between implementation and specs.',
    allowed_tools:
      'Bash(git *), Bash(gh *), Bash(mkdir *), Bash(date *), Bash(npx gitnexus *), Bash(cat *), Read, Grep, Glob, Write, Agent, mcp__gitnexus__query, mcp__gitnexus__context, mcp__gitnexus__impact, mcp__gitnexus__cypher, ReadMcpResourceTool, ListMcpResourcesTool',
    argument_hint: '[spec area | --changed | --pr <number> | leave empty for full audit]',
  },
  'specd-verify': {
    name: 'specd-verify',
    description: 'Verify implementation against spec scenarios for a change.',
    allowed_tools: 'Bash(node *), Bash(pnpm *), Read, Grep, Glob, TaskCreate, TaskUpdate',
    argument_hint: '<change-name>',
  },
}
