#!/usr/bin/env node
import { createProgram } from './program.js'
import { handleError } from './handle-error.js'

export { createProgram } from './program.js'

const program = createProgram()
program.parseAsync(process.argv).catch((err: unknown) => {
  handleError(err)
})
