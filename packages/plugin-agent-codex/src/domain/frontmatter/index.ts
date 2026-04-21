import type { Frontmatter } from '../types/frontmatter.js'

/**
 * Frontmatter map keyed by skill id.
 */
export const skillFrontmatter: Readonly<Record<string, Frontmatter>> = {
  specd: {
    name: 'specd',
    description: 'Entry point for specd lifecycle orientation and next-step guidance.',
  },
  'specd-archive': {
    name: 'specd-archive',
    description: 'Archive a specd change by merging validated deltas into workspace specs.',
  },
  'specd-design': {
    name: 'specd-design',
    description: 'Write or revise specd design artifacts for an active change.',
  },
  'specd-implement': {
    name: 'specd-implement',
    description: 'Implement code for a specd change and advance task checklist progress.',
  },
  'specd-new': {
    name: 'specd-new',
    description: 'Create a new specd change from intent discovery.',
  },
  'specd-metadata': {
    name: 'specd-metadata',
    description: 'Generate and maintain spec metadata artifacts.',
  },
  'specd-compliance': {
    name: 'specd-compliance',
    description: 'Run specs-compliance review between implementation and specs.',
  },
  'specd-verify': {
    name: 'specd-verify',
    description: 'Verify implementation against spec scenarios for a change.',
  },
}
