#!/usr/bin/env bun

import { runInfraCliAsync } from './runInfraCliAsync.js';

if (import.meta.main) {
  const result = await runInfraCliAsync(process.argv.slice(2));
  process.exit(result.exitCode);
}
