// Loaded only by the deterministic test command. Production processes never
// expose the mock provider unless an operator deliberately sets this flag.
process.env.RELAY_ENABLE_TEST_PROVIDERS = '1';
