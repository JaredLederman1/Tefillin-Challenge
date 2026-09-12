// Temporary compatibility fix for @expo/apple-utils 2.2.0 / EAS CLI 24.3.0.
// Apple's former /olympus/v1/app/config endpoint returns HTTP 404.
// This is Apple's PUBLIC production login widget key, not an account credential.
// Verified from Apple's login page and its referenced configuration on 2026-09-11:
// https://unpkg.apple.com/@maison/preauthorization-container@0.2.1/umd/chunks/ASC.BRGDgul9.js
const { spawnSync } = require('node:child_process');
const result = spawnSync('npx', ['eas-cli@24.3.0', 'build', '--profile', 'development', '--platform', 'ios'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_APP_STORE_AUTH_SERVICE_KEY: process.env.EXPO_APP_STORE_AUTH_SERVICE_KEY || 'e0b80c3bf78523bfe80974d320935bfa30add02e1bff88ec2166c6bd5a706c42',
  },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
