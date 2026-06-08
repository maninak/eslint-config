#!/usr/bin/env node

// To be run as the `preinstall` lifecycle hook in a repo.
// Enforces that contributors use pnpm so the lockfile stays in sync. Exits silently
// when the package is being installed as a dependency in someone else's project,
// so we never block consumers who happen to use npm or yarn.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const isDevInstall = existsSync(join(repoRoot, '.git'))

if (!isDevInstall) {
  process.exit(0)
}

if (!process.env.npm_config_user_agent?.startsWith('pnpm')) {
  process.stderr.write('\nError: This repo uses `pnpm` for package management.\n\n')
  process.exit(1)
}
