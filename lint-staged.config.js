/**
 * `lint-staged` appends staged paths to string commands. Returning
 * `pnpm typecheck` from a function runs it once, without those paths,
 * so Turbo does not treat them as task names. No shell is required.
 */
export default {
  '*.ts': ['eslint --fix', 'prettier --write', () => 'pnpm typecheck'],
  '*.{json,yaml,yml,md}': ['prettier --write'],
}
