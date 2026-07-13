// Test: async arrow concise body
before(async () => { await initGitRepo() })
after(async () => { await teardown() })

// Multi-statement must keep block body
before(async () => {
  const x = 1
  await initGitRepo(x)
})
