/**
 * Auto-Updater Module — Checks for repository and database updates on server startup
 */
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');

/**
 * Locate git executable across Windows and Linux/Unix environments
 */
function findGitBinary() {
  if (process.env.GIT_PATH && fs.existsSync(process.env.GIT_PATH)) {
    return process.env.GIT_PATH;
  }

  // 1. Try standard 'git' from PATH
  try {
    execSync('git --version', { stdio: 'ignore', timeout: 3000 });
    return 'git';
  } catch (e) {
    // Continue searching known paths
  }

  // 2. Known Windows paths
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files\\Git\\bin\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\bin\\git.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'cmd', 'git.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'git.exe')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  }

  return null;
}

/**
 * Locate npm executable
 */
function findNpmBinary() {
  if (process.platform === 'win32') {
    try {
      execSync('npm.cmd -v', { stdio: 'ignore', timeout: 3000 });
      return 'npm.cmd';
    } catch (e) {}
    try {
      execSync('npm -v', { stdio: 'ignore', timeout: 3000 });
      return 'npm';
    } catch (e) {}
    const p = path.join(process.env.APPDATA || '', 'npm', 'npm.cmd');
    if (fs.existsSync(p)) return p;
  }
  return 'npm';
}

/**
 * Execute a git command synchronously with timeout
 */
function runGit(gitBin, args, options = {}) {
  const cmd = `"${gitBin}" ${args.join(' ')}`;
  return execSync(cmd, {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    timeout: options.timeout || 30000,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...options
  });
}

/**
 * Main update check and execution function
 * Called when starting the server
 */
async function checkAndApplyUpdates() {
  // Check if auto-update is disabled
  if (process.env.AUTO_UPDATE === 'false' || process.env.AUTO_UPDATE === '0') {
    console.log('[Updater] Auto-updates disabled via AUTO_UPDATE=false');
    return false;
  }

  // Avoid restart loops
  if (process.env.JUST_UPDATED === '1') {
    delete process.env.JUST_UPDATED;
    console.log('[Updater] ✓ Server successfully restarted with latest updates');
    return false;
  }

  const gitDir = path.join(ROOT_DIR, '.git');
  if (!fs.existsSync(gitDir)) {
    console.log('[Updater] Notice: No .git directory found. Skipping repository update check');
    return false;
  }

  const gitBin = findGitBinary();
  if (!gitBin) {
    console.log('[Updater] Notice: Git binary not found in system PATH. Skipping update check');
    return false;
  }

  console.log('[Updater] Checking for updates on remote repository...');

  try {
    // 1. Get current branch (default to main)
    let branch = 'main';
    try {
      const b = runGit(gitBin, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
      if (b && b !== 'HEAD') branch = b;
    } catch (e) {}

    // 2. Fetch remote branch
    runGit(gitBin, ['fetch', 'origin', branch, '--quiet'], { timeout: 20000 });

    // 3. Compare local HEAD and remote tracking branch
    const localHash = runGit(gitBin, ['rev-parse', 'HEAD']).trim();
    let remoteHash = '';
    try {
      remoteHash = runGit(gitBin, ['rev-parse', `origin/${branch}`]).trim();
    } catch (e) {
      // Remote branch ref might not exist or match
      remoteHash = localHash;
    }

    if (!remoteHash || localHash === remoteHash) {
      console.log(`[Updater] ✓ Server is up to date (commit ${localHash.substring(0, 7)} on ${branch})`);
      return false;
    }

    // 4. Updates available!
    let commitCount = '?';
    try {
      commitCount = runGit(gitBin, ['rev-list', '--count', `HEAD..origin/${branch}`]).trim();
    } catch (e) {}

    console.log(`[Updater] ⬇ New updates available! Local: ${localHash.substring(0, 7)} -> Remote: ${remoteHash.substring(0, 7)} (${commitCount} new commit(s))`);
    console.log(`[Updater] Pulling latest changes from origin/${branch}...`);

    // 5. Pull updates
    runGit(gitBin, ['pull', 'origin', branch, '--ff-only']);
    console.log(`[Updater] ✓ Code updated to commit ${remoteHash.substring(0, 7)}`);

    // 6. Check if dependencies changed
    let pkgChanged = false;
    try {
      const diffFiles = runGit(gitBin, ['diff', '--name-only', localHash, 'HEAD']);
      pkgChanged = diffFiles.includes('package.json');
    } catch (e) {}

    if (pkgChanged) {
      console.log('[Updater] package.json was updated. Installing new dependencies via npm install...');
      const npmBin = findNpmBinary();
      try {
        execSync(`"${npmBin}" install --production --no-audit`, {
          cwd: ROOT_DIR,
          stdio: 'inherit',
          timeout: 120000,
          windowsHide: true
        });
        console.log('[Updater] ✓ Dependencies installed successfully');
      } catch (npmErr) {
        console.warn('[Updater] npm install warning:', npmErr.message);
      }
    }

    // 7. Ensure engine binary permissions on Linux
    if (process.platform !== 'win32') {
      const sfPath = path.join(ROOT_DIR, 'engine', 'stockfish');
      if (fs.existsSync(sfPath)) {
        try {
          fs.chmodSync(sfPath, 0o755);
        } catch (e) {}
      }
    }

    // 8. Restart process with newly updated files
    console.log('[Updater] Restarting server process to execute updated code...');
    const child = spawn(process.argv[0], process.argv.slice(1), {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env, JUST_UPDATED: '1' }
    });

    child.on('error', (spawnErr) => {
      console.error('[Updater] Failed to restart child process:', spawnErr);
    });

    // Exit old process cleanly so child takes over
    process.exit(0);
    return true;
  } catch (err) {
    console.warn(`[Updater] Update check warning: ${err.message || err}. Continuing normal server boot.`);
    return false;
  }
}

// Allow running standalone: node src/updater.js
if (require.main === module) {
  checkAndApplyUpdates().then(() => {
    console.log('[Updater] Standalone update check finished');
  });
}

module.exports = { checkAndApplyUpdates, findGitBinary };
