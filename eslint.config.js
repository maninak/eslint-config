import maninak from './src/index.js'

export default maninak({
  ignores: ['*.md'],
  typescript: { tsconfigPath: 'tsconfig.json' },
})
