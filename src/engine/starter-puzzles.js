/**
 * Starter Tactical Puzzles
 * Standard curated subset of tactical puzzles across all ratings (Easy, Medium, Hard, Master)
 * Format:
 *  - fen: position before the opponent's setup move
 *  - moves: space-separated UCI moves. First move is opponent's move, followed by solution
 *  - rating: difficulty rating
 *  - themes: tactical theme tags
 */

const STARTER_PUZZLES = [
  // --- EASY (400 - 900) ---
  {
    puzzle_id: 'ez_001',
    fen: '6k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1',
    moves: 'h7h6 e1e8 g8h7',
    rating: 600,
    themes: 'backRankMate mate mateIn1'
  },
  {
    puzzle_id: 'ez_002',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    moves: 'd2d3 e4d6 c4b3',
    rating: 650,
    themes: 'opening short advantage'
  },
  {
    puzzle_id: 'ez_003',
    fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4',
    moves: 'd2d3 d7d6 c1g5',
    rating: 700,
    themes: 'opening pin'
  },
  {
    puzzle_id: 'ez_004',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2',
    moves: 'g2g4 d8h4',
    rating: 720,
    themes: 'mate mateIn1 foolsMate'
  },
  {
    puzzle_id: 'ez_005',
    fen: 'r1bqkb1r/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
    moves: 'g8f6 h5f7',
    rating: 750,
    themes: 'mate mateIn1 scholarsMate'
  },
  {
    puzzle_id: 'ez_006',
    fen: 'r2qkb1r/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R b KQkq - 0 5',
    moves: 'd5c4 f1c4 f8d6 e1g1',
    rating: 800,
    themes: 'development opening'
  },
  {
    puzzle_id: 'ez_007',
    fen: 'r1b1k2r/ppppqppp/2n5/4P3/1bP3n1/4PN2/PP1B1PPP/RN1QKB1R w KQkq - 3 7',
    moves: 'b1c3 g4e5 f3e5 e7e5',
    rating: 850,
    themes: 'advantage short'
  },
  {
    puzzle_id: 'ez_008',
    fen: 'r2qk2r/ppp1bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 1 6',
    moves: 'c4d5 e6d5 f1b5',
    rating: 880,
    themes: 'opening pin'
  },

  // --- MEDIUM (900 - 1400) ---
  {
    puzzle_id: 'med_001',
    fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7',
    moves: 'c1g5 h7h6 g5f6 d8f6 c3d5',
    rating: 950,
    themes: 'pin fork middlegame'
  },
  {
    puzzle_id: 'med_002',
    fen: 'r1b2rk1/ppqn1ppp/2pbpn2/3p4/2PP4/2NBPN2/PPQ2PPP/R1B2RK1 w - - 4 9',
    moves: 'e3e4 d5e4 c3e4 f6e4 d3e4',
    rating: 1020,
    themes: 'advantage middlegame'
  },
  {
    puzzle_id: 'med_003',
    fen: 'r2q1rk1/pb1nbppp/1p1ppn2/8/2PP4/2N2N2/PPQ1BPPP/R1B2RK1 w - - 4 10',
    moves: 'c1f4 d6d5 c4d5 f6d5 c3d5 b7d5',
    rating: 1100,
    themes: 'advantage middlegame quietMove'
  },
  {
    puzzle_id: 'med_004',
    fen: 'r1bqk2r/pppp1ppp/2n5/2b1p3/2B1n3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 0 5',
    moves: 'd2d4 e5d4 c3d4 c5b4 b1c3',
    rating: 1180,
    themes: 'fork center advantage'
  },
  {
    puzzle_id: 'med_005',
    fen: 'r1b1k2r/pppp1ppp/8/4q3/1bP5/2N1P3/PP3PPP/R2QKB1R b KQkq - 1 9',
    moves: 'b4c3 b2c3 e5c3 e1e2',
    rating: 1250,
    themes: 'fork deflection winningMaterial'
  },
  {
    puzzle_id: 'med_006',
    fen: '2r3k1/pp3ppp/8/3p4/8/1P1Q4/P4PPP/2q1R1K1 w - - 0 21',
    moves: 'e1c1 c8c1 d3f1 c1f1 g1f1',
    rating: 1320,
    themes: 'endgame backRankMate deflection'
  },
  {
    puzzle_id: 'med_007',
    fen: 'r1b1qrk1/ppp2ppp/2n1pn2/3p4/2PP4/2N1PN2/PPQ2PPP/R1B1KB1R w KQ - 1 8',
    moves: 'c4d5 e6d5 f1e2',
    rating: 1380,
    themes: 'advantage opening'
  },

  // --- HARD (1400 - 1900) ---
  {
    puzzle_id: 'hrd_001',
    fen: '3r2k1/p4ppp/1p6/8/2P1n3/1P2qN2/P1Q3PP/3R3K b - - 1 25',
    moves: 'd8d1 c2d1 e4f2 h1g1 f2d1',
    rating: 1450,
    themes: 'fork discoveredAttack mate deflection'
  },
  {
    puzzle_id: 'hrd_002',
    fen: 'r2q1rk1/1b1nbppp/pp1p1n2/3P4/P1B2B2/2N2N2/1P3PPP/R2QR1K1 b - - 0 13',
    moves: 'f6h5 f4e3 h5f6 f3d4',
    rating: 1530,
    themes: 'pin outpost middlegame'
  },
  {
    puzzle_id: 'hrd_003',
    fen: 'r1b2rk1/pp1n1ppp/2p1pn2/q2p2B1/2PP4/2PBPN2/P1Q2PPP/R3K2R w KQ - 3 10',
    moves: 'e1g1 d5c4 d3c4 b7b6',
    rating: 1610,
    themes: 'tactics advantage middlegame'
  },
  {
    puzzle_id: 'hrd_004',
    fen: '2r2rk1/1p2bppp/p1q1pn2/3p4/3P1B2/1NPQ3P/PP3PP1/R3R1K1 w - - 2 17',
    moves: 'f4g5 h7h6 g5f6 e7f6 b3c5',
    rating: 1690,
    themes: 'advantage exchange middlegame'
  },
  {
    puzzle_id: 'hrd_005',
    fen: 'r4rk1/2p1qppp/p1np1n2/1p2p1B1/3PP3/1BP2Q1P/P1P2PP1/R4RK1 w - - 0 13',
    moves: 'b3d5 f6d5 g5e7 d5e7',
    rating: 1780,
    themes: 'pin winningMaterial middlegame'
  },
  {
    puzzle_id: 'hrd_006',
    fen: '3r1rk1/ppq2ppp/2n1pn2/8/2NP4/1P3B2/P1Q2PPP/2RR2K1 w - - 3 18',
    moves: 'c4e5 c7b6 e5c6 b7c6 c2c6',
    rating: 1850,
    themes: 'advantage pawnStructure middlegame'
  },

  // --- MASTER (1900+) ---
  {
    puzzle_id: 'mst_001',
    fen: '2r3k1/5p1p/p5p1/1p2Q3/4P3/P6P/1P1q1PP1/4R1K1 w - - 1 28',
    moves: 'e1f1 c8c1 f1c1 d2c1 g1h2',
    rating: 1950,
    themes: 'endgame master conversion'
  },
  {
    puzzle_id: 'mst_002',
    fen: 'r1b2rk1/ppq2ppp/2nbpn2/3p4/3P4/2PB1N2/PPQN1PPP/R1B2RK1 w - - 6 11',
    moves: 'f1e1 c8d7 d2f1 h7h6',
    rating: 2050,
    themes: 'master quietMove strategy'
  },
  {
    puzzle_id: 'mst_003',
    fen: '2r2rk1/1bqnbppp/pp1ppn2/8/2PNP3/1PN1BP2/P3B1PP/2RQ1R1K w - - 0 14',
    moves: 'd1d2 f8e8 f1d1 c7b8',
    rating: 2150,
    themes: 'hedgehog master positional'
  },
  {
    puzzle_id: 'mst_004',
    fen: 'r2q1rk1/1b2bppp/ppnppn2/8/2PNP3/1PN5/P3BPPP/R1BQR1K1 w - - 1 12',
    moves: 'd4c6 b7c6 e2f3 f6d7',
    rating: 2250,
    themes: 'advantage master simplification'
  }
];

module.exports = { STARTER_PUZZLES };
