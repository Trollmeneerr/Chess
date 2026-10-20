/**
 * Stockfish Engine Manager
 * Manages a single persistent Stockfish UCI process with FIFO request queue
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const MAX_DEPTH = parseInt(process.env.STOCKFISH_MAX_DEPTH) || 8;
const HASH_MB = parseInt(process.env.STOCKFISH_HASH_MB) || 256;
const THREADS = parseInt(process.env.STOCKFISH_THREADS) || 1;

let stockfishProcess = null;
let isReady = false;
let requestQueue = [];
let currentRequest = null;
let outputBuffer = '';

function isValidExecutable(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    if (stats.isDirectory() || stats.size < 100000) return false;

    // Check ELF header on Linux (0x7F 'E' 'L' 'F') or MZ header on Windows (0x4D 0x5A)
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);

    if (process.platform === 'win32') {
      return buf[0] === 0x4D && buf[1] === 0x5A;
    } else {
      return buf[0] === 0x7F && buf[1] === 0x45 && buf[2] === 0x4C && buf[3] === 0x46;
    }
  } catch (e) {
    return false;
  }
}

function getStockfishPath() {
  const localBin = path.join(__dirname, '..', '..', 'engine', 'stockfish');
  const localExe = path.join(__dirname, '..', '..', 'engine', 'stockfish.exe');

  if (isValidExecutable(localBin)) {
    try { fs.chmodSync(localBin, 0o755); } catch (e) {}
    return localBin;
  }
  if (isValidExecutable(localExe)) return localExe;

  // System candidates (Debian/Ubuntu installs to /usr/games/stockfish)
  const candidates = [
    '/usr/games/stockfish',
    '/usr/local/bin/stockfish',
    '/usr/bin/stockfish'
  ];
  for (const p of candidates) {
    if (isValidExecutable(p)) return p;
  }

  // On Linux, attempt auto-download / auto-install
  if (process.platform === 'linux') {
    try {
      const { execSync } = require('child_process');
      const engineDir = path.join(__dirname, '..', '..', 'engine');
      if (!fs.existsSync(engineDir)) fs.mkdirSync(engineDir, { recursive: true });

      try {
        const whichOut = execSync('which stockfish 2>/dev/null || true').toString().trim();
        if (whichOut && isValidExecutable(whichOut)) return whichOut;
      } catch (e) {}

      console.log('[Stockfish] Binary missing or invalid. Downloading official Stockfish binary...');
      const url = 'https://github.com/official-stockfish/Stockfish/releases/download/sf_16.1/stockfish-ubuntu-x86-64-sse41-popcnt.tar';
      execSync(`mkdir -p /tmp/sf_extract && curl -sL --connect-timeout 15 "${url}" -o /tmp/sf_pkg.tar && tar -xf /tmp/sf_pkg.tar -C /tmp/sf_extract && mv $(find /tmp/sf_extract -type f ! -name "*.tar" ! -name "*.gz" | head -n 1) "${localBin}" && chmod +x "${localBin}" && rm -rf /tmp/sf_*`, { stdio: 'inherit' });

      if (isValidExecutable(localBin)) {
        console.log('[Stockfish] Successfully downloaded and verified Stockfish binary!');
        return localBin;
      }
    } catch (err) {
      console.warn('[Stockfish] Auto-download failed:', err.message);
    }
  }

  return null;
}

function initialize() {
  const sfPath = getStockfishPath();
  if (!sfPath) {
    console.warn('[Stockfish] Engine binary not found — using built-in simulation engine');
    isReady = false;
    return;
  }

  console.log(`[Stockfish] Starting engine from: ${sfPath}`);
  console.log(`[Stockfish] Config: Threads=${THREADS}, Hash=${HASH_MB}MB, MaxDepth=${MAX_DEPTH}`);

  try {
    stockfishProcess = spawn(sfPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let binaryFailed = false;

    stockfishProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      processOutput();
    });

    stockfishProcess.stderr.on('data', (data) => {
      console.error('[Stockfish STDERR]', data.toString());
    });

    stockfishProcess.on('error', (err) => {
      binaryFailed = true;
      console.error('[Stockfish] Process error:', err.message);
      console.warn('[Stockfish] Engine not available — using built-in simulation fallback');
      isReady = false;
    });

    stockfishProcess.on('exit', (code) => {
      const wasRunning = isReady;
      isReady = false;
      if (!binaryFailed && wasRunning) {
        console.warn(`[Stockfish] Process exited with code ${code}. Restarting in 3s...`);
        setTimeout(() => initialize(), 3000);
      }
    });

    // Initialize UCI
    sendCommand('uci');
    sendCommand(`setoption name Threads value ${THREADS}`);
    sendCommand(`setoption name Hash value ${HASH_MB}`);
    sendCommand('setoption name Ponder value false');
    sendCommand('setoption name Move Overhead value 10');
    sendCommand('isready');
  } catch (err) {
    console.error('[Stockfish] Failed to start:', err.message);
    console.warn('[Stockfish] Bot and analysis features will be unavailable');
  }
}

function sendCommand(cmd) {
  if (stockfishProcess && stockfishProcess.stdin.writable) {
    stockfishProcess.stdin.write(cmd + '\n');
  }
}

function processOutput() {
  const lines = outputBuffer.split('\n');
  outputBuffer = lines.pop(); // Keep incomplete line in buffer

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'readyok') {
      isReady = true;
      console.log('[Stockfish] Engine ready');
      processNextRequest();
    }

    if (currentRequest) {
      if (currentRequest.type === 'bestmove' && trimmed.startsWith('bestmove')) {
        const parts = trimmed.split(' ');
        const bestmove = parts[1];
        const ponder = parts[3] || null;
        currentRequest.resolve({
          bestmove,
          ponder,
          info: currentRequest.infoLines
        });
        currentRequest = null;
        processNextRequest();
      } else if (currentRequest.type === 'multipv' && trimmed.startsWith('bestmove')) {
        currentRequest.resolve({
          bestmove: trimmed.split(' ')[1],
          pvLines: currentRequest.pvLines,
          info: currentRequest.infoLines
        });
        currentRequest = null;
        processNextRequest();
      } else if (currentRequest.type === 'eval' && trimmed.startsWith('bestmove')) {
        currentRequest.resolve({
          bestmove: trimmed.split(' ')[1],
          evaluations: currentRequest.infoLines
        });
        currentRequest = null;
        processNextRequest();
      }

      if (trimmed.startsWith('info')) {
        if (currentRequest) {
          currentRequest.infoLines.push(trimmed);
          // Parse MultiPV lines
          if (trimmed.includes('multipv') && currentRequest.type === 'multipv') {
            const pvMatch = trimmed.match(/multipv (\d+)/);
            const scoreMatch = trimmed.match(/score (cp|mate) (-?\d+)/);
            const pvMoveMatch = trimmed.match(/ pv (.+)/);
            if (pvMatch && scoreMatch && pvMoveMatch) {
              const pvNum = parseInt(pvMatch[1]);
              const scoreType = scoreMatch[1];
              const scoreVal = parseInt(scoreMatch[2]);
              const moves = pvMoveMatch[1].split(' ');
              currentRequest.pvLines[pvNum - 1] = {
                pvNum,
                score: scoreType === 'cp' ? scoreVal / 100 : (scoreVal > 0 ? 999 : -999),
                scoreType,
                scoreRaw: scoreVal,
                bestMove: moves[0],
                pv: moves
              };
            }
          }
        }
      }
    }
  }
}

function processNextRequest() {
  if (currentRequest || requestQueue.length === 0 || !isReady) return;
  currentRequest = requestQueue.shift();

  sendCommand('ucinewgame');
  sendCommand('isready');
  // We need to wait for readyok before sending position, but since
  // we process synchronously, we'll queue the commands
  // Actually let's do it differently — send all at once and rely on UCI protocol ordering
  setTimeout(() => {
    if (currentRequest) {
      sendCommand(currentRequest.positionCmd);
      sendCommand(currentRequest.goCmd);
    }
  }, 10);
}

/**
 * Get best move for a position
 */
function getBestMove(fen, moves = '', depth = MAX_DEPTH, movetime = 1500, options = {}) {
  return new Promise((resolve, reject) => {
    if (!stockfishProcess || !isReady) {
      return reject(new Error('Stockfish not available'));
    }

    const clampedDepth = Math.min(depth, MAX_DEPTH);
    let positionCmd = `position fen ${fen}`;
    if (moves) positionCmd += ` moves ${moves}`;

    let goCmd = `go depth ${clampedDepth} movetime ${movetime}`;

    // Apply UCI_LimitStrength if specified
    if (options.limitStrength && options.elo) {
      sendCommand('setoption name UCI_LimitStrength value true');
      sendCommand(`setoption name UCI_Elo value ${options.elo}`);
    } else {
      sendCommand('setoption name UCI_LimitStrength value false');
    }

    const timeout = setTimeout(() => {
      if (currentRequest && currentRequest.id === req.id) {
        sendCommand('stop');
      }
    }, movetime + 500);

    const req = {
      id: Date.now() + Math.random(),
      type: 'bestmove',
      positionCmd,
      goCmd,
      infoLines: [],
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject
    };

    requestQueue.push(req);
    processNextRequest();
  });
}

/**
 * Get multiple principal variations for bot calibration
 */
function getMultiPV(fen, moves = '', numPV = 5, depth = 5, movetime = 800) {
  return new Promise((resolve, reject) => {
    if (!stockfishProcess || !isReady) {
      return reject(new Error('Stockfish not available'));
    }

    const clampedDepth = Math.min(depth, MAX_DEPTH);
    sendCommand(`setoption name MultiPV value ${numPV}`);
    sendCommand('setoption name UCI_LimitStrength value false');

    let positionCmd = `position fen ${fen}`;
    if (moves) positionCmd += ` moves ${moves}`;
    const goCmd = `go depth ${clampedDepth} movetime ${movetime}`;

    const req = {
      id: Date.now() + Math.random(),
      type: 'multipv',
      positionCmd,
      goCmd,
      infoLines: [],
      pvLines: [],
      resolve: (result) => {
        // Reset MultiPV to 1
        sendCommand('setoption name MultiPV value 1');
        resolve(result);
      },
      reject
    };

    requestQueue.push(req);
    processNextRequest();
  });
}

/**
 * Evaluate a position for analysis (returns eval + best line)
 */
function evaluate(fen, depth = MAX_DEPTH, movetime = 800) {
  return new Promise((resolve, reject) => {
    if (!stockfishProcess || !isReady) {
      return reject(new Error('Stockfish not available'));
    }

    const clampedDepth = Math.min(depth, MAX_DEPTH);
    sendCommand('setoption name MultiPV value 1');
    sendCommand('setoption name UCI_LimitStrength value false');

    const positionCmd = `position fen ${fen}`;
    const goCmd = `go depth ${clampedDepth} movetime ${movetime}`;

    const timeout = setTimeout(() => {
      if (currentRequest && currentRequest.id === req.id) {
        sendCommand('stop');
      }
    }, movetime + 500);

    const req = {
      id: Date.now() + Math.random(),
      type: 'eval',
      positionCmd,
      goCmd,
      infoLines: [],
      resolve: (result) => {
        clearTimeout(timeout);
        // Parse the deepest info line for score
        let score = null;
        let scoreType = 'cp';
        for (let i = result.evaluations.length - 1; i >= 0; i--) {
          const match = result.evaluations[i].match(/score (cp|mate) (-?\d+)/);
          if (match) {
            scoreType = match[1];
            score = parseInt(match[2]);
            break;
          }
        }

        // In Stockfish UCI, score is from side to move's perspective.
        // Standard chess evaluation is normalized: positive = White winning, negative = Black winning.
        const turn = fen ? fen.split(' ')[1] : 'w';
        let normalizedScore = 0;
        let mateMoves = null;

        if (scoreType === 'mate') {
          mateMoves = score; // positive means side to move can deliver mate in N
          normalizedScore = score > 0 ? (100 - score) : (-100 - score);
          if (turn === 'b') {
            normalizedScore = -normalizedScore;
            mateMoves = -mateMoves;
          }
        } else {
          normalizedScore = score !== null ? score / 100 : 0;
          if (turn === 'b') {
            normalizedScore = -normalizedScore;
          }
        }

        resolve({
          bestmove: result.bestmove,
          score: normalizedScore,
          scoreType,
          mate: mateMoves,
          scoreRaw: score,
          turn,
          raw: result.evaluations
        });
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      }
    };

    requestQueue.push(req);
    processNextRequest();
  });
}

function isAvailable() {
  return !!stockfishProcess && isReady;
}

module.exports = { initialize, getBestMove, getMultiPV, evaluate, isAvailable };
