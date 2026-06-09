import maninak from './src/index.js'

export default maninak({
  ignores: ['test/fixtures/**'],
  typescript: { tsconfigPath: 'tsconfig.json' },
})
