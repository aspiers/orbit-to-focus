import { defineConfig } from '@playwright/test';

// Browser tests against the e2e build (npm run test:e2e builds it into dist-e2e). E2E_DIST serves another
// build instead, e.g. one of an older commit to check that a test fails without the fix it guards.
const PORT = 5182;
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'tmp/test-results',
  workers: 1, // timing tests stay honest without other pages competing for the CPU
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    viewport: { width: 1280, height: 800 },
    // The system Chromium, on the real GPU: software WebGL (SwiftShader) draws about 12 frames a second here,
    // too few for the frame-rate and smoothness tests.
    launchOptions: { executablePath: '/usr/bin/chromium', args: ['--enable-gpu', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `vite preview --port ${PORT} --strictPort --host 127.0.0.1 --outDir ${process.env.E2E_DIST ?? 'dist-e2e'}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
});
