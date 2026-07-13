// Fixture for maninak/prefer-concise-async-arrow.
// Each case has a `// @case <name>` anchor used by tests to locate lines.

// @case basic
before(async () => { await initGitRepo() })

// @case return-type
// The return-type annotation must survive the fix (body-only replacement, not reconstruction).
onReady(async (): Promise<void> => { await teardown() })

// @case typed-param
// Typed params must survive too.
onValue(async (count: number): Promise<void> => { await consume(count) })

// @case comment-inside
// A comment inside the block: reported but NOT fixed (a fix would drop the comment).
onStart(async () => {
  // keep this note
  await boot()
})

// @case multi-statement
// More than one statement in the body: must not fire.
before(async () => {
  const x = 1
  await initGitRepo(x)
})
