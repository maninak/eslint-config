import maninak from './dist/index.js'

export default maninak({
  ignores: ['*.md'],
  typescript: { tsconfigPath: 'tsconfig.eslint.json' },
})
