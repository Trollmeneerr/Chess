/**
 * Puzzle Seeder CLI Tool
 * Can be run to seed puzzles into the database
 * Usage: node src/cli/seed-puzzles.js [csv_file_path]
 */
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const db = require('../db');
const { STARTER_PUZZLES } = require('../engine/starter-puzzles');

async function main() {
  await db.initialize();
  console.log('[Seed] DB initialized');

  const args = process.argv.slice(2);
  const csvPath = args[0];

  if (csvPath && fs.existsSync(csvPath)) {
    console.log(`[Seed] Streaming puzzles from CSV: ${csvPath}`);
    const fileStream = fs.createReadStream(csvPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let count = 0;
    let isHeader = true;

    for await (const line of rl) {
      if (isHeader) {
        isHeader = false;
        continue;
      }

      // Lichess puzzle CSV format: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
      const parts = line.split(',');
      if (parts.length >= 8) {
        const puzzleId = parts[0];
        const fen = parts[1];
        const moves = parts[2];
        const rating = parseInt(parts[3]) || 1200;
        const themes = parts[7] || '';
        const popularity = parseInt(parts[5]) || 0;

        try {
          await db.insert(
            'INSERT OR IGNORE INTO puzzles (puzzle_id, fen, moves, rating, themes, popularity) VALUES (?, ?, ?, ?, ?, ?)',
            [puzzleId, fen, moves, rating, themes, popularity]
          );
          count++;
          if (count % 5000 === 0) {
            console.log(`[Seed] Seeded ${count} puzzles...`);
          }
        } catch (e) {
          // ignore duplicate
        }
      }
    }
    console.log(`[Seed] Finished seeding ${count} puzzles from CSV.`);
  } else {
    console.log(`[Seed] Seeding ${STARTER_PUZZLES.length} curated starter puzzles...`);
    let count = 0;
    for (const p of STARTER_PUZZLES) {
      try {
        await db.insert(
          'INSERT INTO puzzles (puzzle_id, fen, moves, rating, themes) VALUES (?, ?, ?, ?, ?)',
          [p.puzzle_id, p.fen, p.moves, p.rating, p.themes]
        );
        count++;
      } catch (err) {
        // ignore duplicate
      }
    }
    console.log(`[Seed] Finished seeding ${count} starter puzzles.`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[Seed] Error:', err);
  process.exit(1);
});
