// Installs simple-git-hooks via the `prepare` lifecycle. Skips silently in any context
// where hooks should not or cannot be installed:
//   - No .git folder: sandboxed CI, consumer's node_modules, pnpm pack step.
//   - Binary absent: devDependencies not installed yet, pnpm publish's pack environment,
//     or any other context where the package isn't available locally.
// Using the local binary directly (instead of `npx simple-git-hooks`) avoids npx trying
// to download the package when it isn't cached, which fails in restricted environments.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const binary = 'node_modules/.bin/simple-git-hooks'

if (existsSync('.git') && existsSync(binary)) {
  execSync(binary, { stdio: 'inherit' })
}
