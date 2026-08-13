import maninak from './src/index.js'

export default maninak({
  ignores: ['test/fixtures/**'],
  typescript: { tsconfigPath: 'tsconfig.json' },
  // `tailwindcss` is a devDependency here only so the test suite can actually RUN the Tailwind
  // rules (the plugin disables them when it cannot resolve Tailwind). This repo writes no
  // Tailwind classes of its own, so switch the rules off rather than field the reminder.
  tailwind: false,
})
