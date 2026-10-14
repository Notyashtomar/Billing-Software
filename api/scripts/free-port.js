/**
 * Frees a TCP port by terminating whatever process is currently listening on it.
 *
 * Runs automatically before `start:dev` / `start:debug` (via npm `pre*` hooks) so a
 * stale/orphaned Nest watcher never causes `EADDRINUSE: address already in use`.
 *
 * Usage: node scripts/free-port.js [port]   (defaults to 8080, or PORT env var)
 * Cross-platform: supports Windows (netstat/taskkill) and macOS/Linux (lsof/kill).
 */
'use strict';

const { execSync } = require('child_process');

const port = Number(process.argv[2] || process.env.PORT || 8080);

function collectPids() {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano', { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        // Match :PORT only as the local-address port (avoid matching remote/other ports).
        if (!new RegExp(`[:.]${port}\\b`).test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
        encoding: 'utf8',
      });
      for (const pid of out.split(/\r?\n/)) {
        if (pid && /^\d+$/.test(pid.trim())) pids.add(pid.trim());
      }
    }
  } catch {
    // netstat/lsof returning non-zero (e.g. nothing listening) is expected -> no pids.
  }
  return [...pids];
}

function killPid(pid) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F /T`, { stdio: 'ignore' });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

const pids = collectPids();
if (pids.length === 0) {
  console.log(`[free-port] Port ${port} is free.`);
  process.exit(0);
}

for (const pid of pids) {
  const ok = killPid(pid);
  console.log(
    `[free-port] Port ${port} was held by PID ${pid} -> ${ok ? 'terminated' : 'could not terminate'}.`,
  );
}
