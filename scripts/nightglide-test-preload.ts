/**
 * Test preload: the upstream suites exercise the classic inline layout.
 * Glide (the Nightglide default) has its own tests that set it explicitly.
 */
process.env.NIGHTGLIDE_LAYOUT ??= "classic";
