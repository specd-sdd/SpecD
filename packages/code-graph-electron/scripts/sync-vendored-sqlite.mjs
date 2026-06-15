import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(scriptDir, '..')
const repoRoot = path.resolve(packageRoot, '..', '..')
const vendorRoot = path.resolve(packageRoot, 'vendor/better-sqlite3')
const vendorNodeModulesRoot = path.resolve(vendorRoot, 'node_modules')
const vendorBinaryPath = path.resolve(vendorRoot, 'build/Release/better_sqlite3.node')
const vendorMetadataPath = path.resolve(vendorRoot, '.electron-build.json')

function resolvePackageRoot(packageName, searchFrom) {
  let packageJsonPath
  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`, {
      paths: [searchFrom],
    })
  } catch {
    packageJsonPath = path.resolve(
      repoRoot,
      `node_modules/.pnpm/node_modules/${packageName}/package.json`,
    )
  }
  return path.dirname(packageJsonPath)
}

function copyPackage(sourceRoot, targetRoot) {
  rmSync(targetRoot, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  })
  cpSync(sourceRoot, targetRoot, {
    recursive: true,
    dereference: true,
    force: true,
    errorOnExist: false,
    filter(sourcePath) {
      return path.basename(sourcePath) !== 'node_modules'
    },
  })
}

function readPreservedElectronBuild() {
  if (!existsSync(vendorMetadataPath) || !existsSync(vendorBinaryPath)) {
    return undefined
  }

  return {
    binary: readFileSync(vendorBinaryPath),
    metadata: readFileSync(vendorMetadataPath, 'utf8'),
  }
}

const canonicalSqliteRoot = resolvePackageRoot('better-sqlite3', packageRoot)
const bindingsRoot = resolvePackageRoot('bindings', canonicalSqliteRoot)
const fileUriToPathRoot = resolvePackageRoot('file-uri-to-path', bindingsRoot)
const preservedElectronBuild = readPreservedElectronBuild()

copyPackage(canonicalSqliteRoot, vendorRoot)
mkdirSync(vendorNodeModulesRoot, { recursive: true })
copyPackage(bindingsRoot, path.resolve(vendorNodeModulesRoot, 'bindings'))
copyPackage(fileUriToPathRoot, path.resolve(vendorNodeModulesRoot, 'file-uri-to-path'))

const vendorPackageJsonPath = path.resolve(vendorRoot, 'package.json')
const vendorPackageJson = JSON.parse(readFileSync(vendorPackageJsonPath, 'utf8'))
vendorPackageJson.private = true
vendorPackageJson.scripts = {
  install: 'node-gyp rebuild --release',
  'build-release': 'node-gyp rebuild --release',
  'build-debug': 'node-gyp rebuild --debug',
}

writeFileSync(vendorPackageJsonPath, `${JSON.stringify(vendorPackageJson, null, 2)}\n`, 'utf8')

if (preservedElectronBuild !== undefined) {
  mkdirSync(path.dirname(vendorBinaryPath), { recursive: true })
  writeFileSync(vendorBinaryPath, preservedElectronBuild.binary)
  writeFileSync(vendorMetadataPath, preservedElectronBuild.metadata, 'utf8')
}
