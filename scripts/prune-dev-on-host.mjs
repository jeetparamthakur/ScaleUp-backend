#!/usr/bin/env node
import { execSync } from 'node:child_process';

if (process.env.RENDER !== 'true' && process.env.PRUNE_DEV !== 'true') {
  process.exit(0);
}

execSync('npm prune --omit=dev', { stdio: 'inherit' });
