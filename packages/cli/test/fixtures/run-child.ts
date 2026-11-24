import { registerCliCleanup } from '../../src/helpers/cli-cleanup.js'
import { run } from '../../src/run.js'

// `clean`: the process ends by itself after cleanup.
// `leak`: a cleanup leaves a ref'd interval behind, so only the exit grace period ends the run.
if (process.argv[2] === 'leak') {
  registerCliCleanup(() => {
    setInterval(() => {}, 1000)
  })
}

await run(['node', 'specd', 'guide', '--format', 'toon'])
