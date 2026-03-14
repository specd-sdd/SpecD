export const RelationType = {
  Imports: 'IMPORTS',
  Defines: 'DEFINES',
  Calls: 'CALLS',
  Exports: 'EXPORTS',
  DependsOn: 'DEPENDS_ON',
  Covers: 'COVERS',
} as const

/**
 * Union type of all valid relation type string literals.
 */
export type RelationType = (typeof RelationType)[keyof typeof RelationType]

const RELATION_TYPE_VALUES = new Set<string>(Object.values(RelationType))

/**
 * Checks whether a string is a valid RelationType value.
 * @param value - The string to validate.
 * @returns True if the value is a recognized relation type.
 */
export function isRelationType(value: string): value is RelationType {
  return RELATION_TYPE_VALUES.has(value)
}
