/**
 * Closed vocabulary for syntactic import declaration forms.
 */
export const ImportDeclarationKind = {
  Named: 'named',
  Namespace: 'namespace',
  Default: 'default',
  SideEffect: 'side-effect',
  Dynamic: 'dynamic',
  Require: 'require',
  Blank: 'blank',
} as const

/**
 * Union type of valid import declaration kinds.
 */
export type ImportDeclarationKind =
  (typeof ImportDeclarationKind)[keyof typeof ImportDeclarationKind]
