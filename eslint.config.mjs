// eslint-disable-next-line antfu/no-import-dist
import maninak from './dist/index.js'

export default maninak({
  ignores: ['test/fixtures/**'],
  typescript: { tsconfigPath: 'tsconfig.json' },
})
