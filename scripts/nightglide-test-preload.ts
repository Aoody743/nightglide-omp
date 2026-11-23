/**
 * Test preload: the upstream suites assert the inline renderer (native
 * scrollback), so they keep it through a test-only switch. Glide is the only
 * user-facing layout and has its own tests.
 */
process.env.NIGHTGLIDE_TEST_CLASSIC ??= "1";
