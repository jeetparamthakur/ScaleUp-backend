import { spawn } from 'child_process';
import { ensureLocalDatabase } from './local-db';

function withHeapLimit(
  nodeOptions: string | undefined,
  sizeMb: number,
): string {
  if (nodeOptions?.includes('--max-old-space-size=')) {
    return nodeOptions;
  }

  return [nodeOptions, `--max-old-space-size=${sizeMb}`]
    .filter(Boolean)
    .join(' ');
}

async function runDev() {
  let shuttingDown = false;

  if (process.env.SKIP_DB !== 'true') {
    try {
      await ensureLocalDatabase();
    } catch (error: unknown) {
      console.error('Failed to start local database:', error);
      process.exit(1);
    }
  }

  const nest = spawn('nest', ['start', '--watch'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: process.env.PORT ?? '3008',
      NODE_OPTIONS: withHeapLimit(process.env.NODE_OPTIONS, 4096),
    },
  });

  const shutdown = async (exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    if (!nest.killed) {
      nest.kill('SIGTERM');
    }

    // Keep embedded Postgres running across dev restarts (persistent data in
    // .local/postgres). Stopping here races with a newly started dev process
    // that detects the DB as ready and then loses its connection.

    process.exit(exitCode);
  };

  process.on('SIGINT', () => {
    void shutdown(0);
  });

  process.on('SIGTERM', () => {
    void shutdown(0);
  });

  nest.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitCode =
      code ?? (signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
    void shutdown(exitCode);
  });
}

void runDev();
