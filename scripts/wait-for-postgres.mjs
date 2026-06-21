#!/usr/bin/env node
import { spawn } from 'node:child_process';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const checkPostgres = () =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'root', '-d', 'utils_db'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr.trim() || `pg_isready exited with code ${code}`));
    });
  });

async function main() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      const output = await checkPostgres();
      if (output) {
        console.log(output);
      }
      process.exit(0);
    } catch (error) {
      if (attempt === 60) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }

      await delay(1000);
    }
  }
}

main();
