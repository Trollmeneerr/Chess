/**
 * Bulk Puzzle Importer & Seeder
 * Fetches verified official Lichess puzzles and bulk-inserts them into SQLite/MySQL
 * Ensures at least 1,000+ puzzles per tier:
 *   - Easy: 400 - 999
 *   - Medium: 1000 - 1399
 *   - Hard: 1400 - 1899
 *   - Master: 1900+
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'chess.sqlite');
const SEED_FILE = path.join(DATA_DIR, 'puzzles-seed.json');

const TIERS = {
  easy:   { min: 400,  max: 999,  target: 1000 },
  medium: { min: 1000, max: 1399, target: 1000 },
  hard:   { min: 1400, max: 1899, target: 1000 },
  master: { min: 1900, max: 3500, target: 1000 }
};

function getTier(rating) {
  if (rating < 1000) return 'easy';
  if (rating < 1400) return 'medium';
  if (rating < 1900) return 'hard';
  return 'master';
}

async function fetchHuggingFaceRows(offset, limit = 100) {
  const url = `https://datasets-server.huggingface.co/rows?dataset=Lichess%2Fchess-puzzles&config=default&split=train&offset=${offset}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API HTTP ${res.status}: ${res.statusText}`);
  }
  const data = await res.json();
  return (data.rows || []).map(r => r.row);
}

async function runImport(targetPerTier = 1000) {
  console.log('='.repeat(60));
  console.log('  CHESS PUZZLE BULK IMPORTER');
  console.log(`  Target per tier: ${targetPerTier} puzzles (Easy, Medium, Hard, Master)`);
  console.log('='.repeat(60));

  const tierBuckets = {
    easy: [],
    medium: [],
    hard: [],
    master: []
  };

  const seenIds = new Set();
  const startTime = Date.now();

  // If local seed file exists, load existing puzzles first
  if (fs.existsSync(SEED_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
      console.log(`[Import] Found existing seed file with ${existing.length} puzzles. Loading...`);
      for (const p of existing) {
        if (!p.puzzle_id || seenIds.has(p.puzzle_id)) continue;
        seenIds.add(p.puzzle_id);
        const t = getTier(p.rating);
        if (tierBuckets[t].length < targetPerTier) {
          tierBuckets[t].push(p);
        }
      }
      console.log(`[Import] Existing tier counts: Easy=${tierBuckets.easy.length}, Medium=${tierBuckets.medium.length}, Hard=${tierBuckets.hard.length}, Master=${tierBuckets.master.length}`);
    } catch (e) {
      console.warn('[Import] Error reading seed file, starting fresh:', e.message);
    }
  }

  let offset = 0;
  const BATCH_SIZE = 100;
  const CONCURRENCY = 5;

  function allTargetsMet() {
    return Object.values(tierBuckets).every(arr => arr.length >= targetPerTier);
  }

  console.log('[Import] Fetching verified puzzles from Lichess open dataset...');

  while (!allTargetsMet() && offset < 250000) {
    const promises = [];
    for (let c = 0; c < CONCURRENCY; c++) {
      const batchOffset = offset + (c * BATCH_SIZE);
      promises.push(
        fetchHuggingFaceRows(batchOffset, BATCH_SIZE).catch(err => {
          console.warn(`[Import] Offset ${batchOffset} fetch error:`, err.message);
          return [];
        })
      );
    }

    const batches = await Promise.all(promises);
    offset += (CONCURRENCY * BATCH_SIZE);

    for (const rows of batches) {
      for (const row of rows) {
        const id = row.PuzzleId;
        if (!id || seenIds.has(id)) continue;
        seenIds.add(id);

        const rating = parseInt(row.Rating) || 1200;
        const moves = row.Moves || '';
        const moveCount = moves.trim().split(/\s+/).length;

        // Ensure valid moves and FEN
        if (!row.FEN || moveCount < 2) continue;

        const tier = getTier(rating);
        if (tierBuckets[tier].length < targetPerTier) {
          tierBuckets[tier].push({
            puzzle_id: id,
            fen: row.FEN,
            moves: moves,
            rating: rating,
            themes: Array.isArray(row.Themes) ? row.Themes.join(' ') : (row.Themes || 'tactics'),
            popularity: parseInt(row.Popularity) || 0
          });
        }
      }
    }

    const currentCounts = `Easy: ${tierBuckets.easy.length}/${targetPerTier} | Medium: ${tierBuckets.medium.length}/${targetPerTier} | Hard: ${tierBuckets.hard.length}/${targetPerTier} | Master: ${tierBuckets.master.length}/${targetPerTier}`;
    process.stdout.write(`\r[Import] Scanned ${offset} rows | ${currentCounts}`);
  }

  console.log('\n\n[Import] Fetch complete in ' + ((Date.now() - startTime) / 1000).toFixed(1) + 's');

  const allPuzzles = [
    ...tierBuckets.easy,
    ...tierBuckets.medium,
    ...tierBuckets.hard,
    ...tierBuckets.master
  ];

  console.log(`[Import] Total puzzles collected: ${allPuzzles.length}`);

  // 1. Save to data/puzzles-seed.json
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SEED_FILE, JSON.stringify(allPuzzles, null, 2));
  console.log(`[Import] ✓ Saved ${allPuzzles.length} puzzles to ${SEED_FILE} (${(fs.statSync(SEED_FILE).size / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Insert into SQLite in a single transaction
  if (fs.existsSync(DB_PATH)) {
    console.log(`[Import] Inserting into SQLite database: ${DB_PATH}...`);
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS puzzles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        puzzle_id VARCHAR(20) UNIQUE,
        fen TEXT NOT NULL,
        moves TEXT NOT NULL,
        rating INTEGER DEFAULT 1200,
        themes TEXT,
        popularity INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_puzzles_rating ON puzzles(rating);
    `);

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO puzzles (puzzle_id, fen, moves, rating, themes, popularity)
      VALUES (@puzzle_id, @fen, @moves, @rating, @themes, @popularity)
    `);

    const t0 = Date.now();
    const insertMany = db.transaction((puzzles) => {
      for (const p of puzzles) {
        insertStmt.run(p);
      }
    });

    insertMany(allPuzzles);
    const dbElapsed = Date.now() - t0;

    const counts = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN rating < 1000 THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN rating >= 1000 AND rating < 1400 THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN rating >= 1400 AND rating < 1900 THEN 1 ELSE 0 END) as hard,
        SUM(CASE WHEN rating >= 1900 THEN 1 ELSE 0 END) as master
      FROM puzzles
    `).get();

    console.log(`[Import] ✓ Inserted into SQLite in ${dbElapsed}ms!`);
    console.log('='.repeat(60));
    console.log('  DATABASE PUZZLE COUNTS:');
    console.log(`  Easy (< 1000 ELO):       ${counts.easy}`);
    console.log(`  Medium (1000 - 1399 ELO): ${counts.medium}`);
    console.log(`  Hard (1400 - 1899 ELO):   ${counts.hard}`);
    console.log(`  Master (1900+ ELO):       ${counts.master}`);
    console.log(`  Total Active Puzzles:     ${counts.total}`);
    console.log('='.repeat(60));
    db.close();
  }

  return allPuzzles;
}

if (require.main === module) {
  const targetArg = process.argv.find(a => a.startsWith('--target='));
  const target = targetArg ? parseInt(targetArg.split('=')[1], 10) : 1000;
  runImport(target).catch(err => {
    console.error('[Import] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runImport, TIERS, getTier };
