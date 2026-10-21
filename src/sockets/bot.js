/**
 * Bot Game WebSocket Handler — PvE with calibrated Stockfish bots
 */
const { Chess } = require('chess.js');
const { verifyToken } = require('../middleware/auth');
const { getBotMove, getBotByElo, getBotRoster } = require('../engine/bots');
const db = require('../db');

const BOT_LOW_ELO_REWARD = parseInt(process.env.BOT_LOW_ELO_REWARD) || 5;

// Active bot games
const activeBotGames = new Map();

function register(io) {
  const botNamespace = io.of('/bot');

  botNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      const decoded = verifyToken(token);
      if (decoded) {
        socket.user = decoded;
        return next();
      }
    }
    next(new Error('Authentication required'));
  });

  botNamespace.on('connection', (socket) => {
    console.log(`[Bot] User connected: ${socket.user.username}`);

    // Get bot roster
    socket.on('get_roster', () => {
      socket.emit('roster', getBotRoster());
    });

    // Start a bot game
    socket.on('start_game', async (data) => {
      const { bot_elo, color_preference } = data;
      const bot = getBotByElo(bot_elo);

      const chess = new Chess();
      const playerIsWhite = color_preference === 'white' || 
        (color_preference === 'random' && Math.random() > 0.5) ||
        color_preference !== 'black';

      const gameId = `bot_${socket.user.id}_${Date.now()}`;
      const gameState = {
        chess,
        gameId,
        playerId: socket.user.id,
        botElo: bot.elo,
        botName: bot.name,
        playerIsWhite,
        moveCount: 0,
        startTime: Date.now()
      };

      activeBotGames.set(gameId, gameState);

      // Create game record in DB
      try {
        const inviteCode = gameId;
        await db.insert(
          'INSERT INTO games (invite_code, white_id, black_id, game_type, bot_elo) VALUES (?, ?, ?, ?, ?)',
          [
            inviteCode,
            playerIsWhite ? socket.user.id : null,
            playerIsWhite ? null : socket.user.id,
            'bot',
            bot.elo
          ]
        );
      } catch (err) {
        console.error('[Bot] Failed to create game record:', err);
      }

      socket.join(gameId);

      socket.emit('game_started', {
        gameId,
        fen: chess.fen(),
        playerColor: playerIsWhite ? 'white' : 'black',
        botName: bot.name,
        botElo: bot.elo,
        botAvatar: bot.avatar,
        botDescription: bot.description
      });

      // If player is black, bot makes first move
      if (!playerIsWhite) {
        setTimeout(async () => {
          await makeBotMove(socket, gameState);
        }, 500 + Math.random() * 1000);
      }
    });

    // Player makes a move
    socket.on('move', async (data) => {
      const { game_id, move } = data;
      const game = activeBotGames.get(game_id);
      if (!game || game.playerId !== socket.user.id) return;

      // Verify it's player's turn
      const isWhiteTurn = game.chess.turn() === 'w';
      if ((isWhiteTurn && !game.playerIsWhite) || (!isWhiteTurn && game.playerIsWhite)) {
        return socket.emit('error', { message: 'Not your turn' });
      }

      try {
        const result = game.chess.move(move);
        if (!result) {
          return socket.emit('error', { message: 'Illegal move' });
        }

        game.moveCount++;

        socket.emit('move_made', {
          move: result,
          fen: game.chess.fen(),
          pgn: game.chess.pgn(),
          turn: game.chess.turn() === 'w' ? 'white' : 'black',
          moveCount: game.moveCount,
          isCheck: game.chess.isCheck(),
          history: game.chess.history({ verbose: true })
        });

        // Check for game end
        if (game.chess.isCheckmate()) {
          const winner = game.chess.turn() === 'w' ? 'black' : 'white';
          const playerWon = (winner === 'white' && game.playerIsWhite) || (winner === 'black' && !game.playerIsWhite);
          await endBotGame(socket, game, playerWon ? 'player' : 'bot', 'checkmate');
          return;
        } else if (game.chess.isDraw()) {
          await endBotGame(socket, game, 'draw', getDenominateReason(game.chess));
          return;
        }

        // Bot responds after a realistic delay
        const thinkTime = 300 + Math.random() * 1500 + (game.botElo > 1200 ? Math.random() * 1000 : 0);
        setTimeout(async () => {
          await makeBotMove(socket, game);
        }, thinkTime);

      } catch (err) {
        socket.emit('error', { message: 'Invalid move' });
      }
    });

    // Resign against bot
    socket.on('resign', async (data) => {
      const { game_id } = data;
      const game = activeBotGames.get(game_id);
      if (!game) return;
      await endBotGame(socket, game, 'bot', 'resignation');
    });

    socket.on('disconnect', () => {
      console.log(`[Bot] User disconnected: ${socket.user.username}`);
    });
  });
}

async function makeBotMove(socket, game) {
  if (game.chess.isGameOver()) return;

  try {
    const fen = game.chess.fen();
    const moves = game.chess.history().length > 0 ? '' : ''; // Use FEN directly
    const result = await getBotMove(fen, '', game.botElo);

    if (!result.move) {
      // Fallback: pick a random legal move
      const legalMoves = game.chess.moves({ verbose: true });
      if (legalMoves.length === 0) return;
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      game.chess.move(randomMove);
      game.moveCount++;

      socket.emit('bot_move', {
        move: randomMove,
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        turn: game.chess.turn() === 'w' ? 'white' : 'black',
        moveCount: game.moveCount,
        isCheck: game.chess.isCheck(),
        history: game.chess.history({ verbose: true })
      });
    } else {
      // Convert UCI move to chess.js format
      const from = result.move.substring(0, 2);
      const to = result.move.substring(2, 4);
      const promotion = result.move.length > 4 ? result.move[4] : undefined;

      const moveResult = game.chess.move({ from, to, promotion });
      if (!moveResult) {
        // UCI move failed, try as SAN
        const sanResult = game.chess.move(result.move);
        if (!sanResult) {
          // Last resort: random move
          const legalMoves = game.chess.moves({ verbose: true });
          if (legalMoves.length === 0) return;
          const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
          game.chess.move(randomMove);
        }
      }
      game.moveCount++;

      socket.emit('bot_move', {
        move: moveResult || game.chess.history({ verbose: true }).slice(-1)[0],
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        turn: game.chess.turn() === 'w' ? 'white' : 'black',
        moveCount: game.moveCount,
        isCheck: game.chess.isCheck(),
        history: game.chess.history({ verbose: true })
      });
    }

    // Check for game end after bot move
    if (game.chess.isCheckmate()) {
      const winner = game.chess.turn() === 'w' ? 'black' : 'white';
      const playerWon = (winner === 'white' && game.playerIsWhite) || (winner === 'black' && !game.playerIsWhite);
      await endBotGame(socket, game, playerWon ? 'player' : 'bot', 'checkmate');
    } else if (game.chess.isDraw()) {
      await endBotGame(socket, game, 'draw', getDenominateReason(game.chess));
    }
  } catch (err) {
    console.error('[Bot] Error making bot move:', err);
    // Fallback to random move
    const legalMoves = game.chess.moves({ verbose: true });
    if (legalMoves.length > 0) {
      const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
      game.chess.move(randomMove);
      game.moveCount++;
      socket.emit('bot_move', {
        move: randomMove,
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        turn: game.chess.turn() === 'w' ? 'white' : 'black',
        moveCount: game.moveCount,
        isCheck: game.chess.isCheck(),
        history: game.chess.history({ verbose: true })
      });
    }
  }
}

async function endBotGame(socket, game, winner, reason) {
  const result = winner === 'draw' ? '1/2-1/2'
    : (winner === 'player'
      ? (game.playerIsWhite ? '1-0' : '0-1')
      : (game.playerIsWhite ? '0-1' : '1-0'));

  // Calculate ELO change
  let eloChange = 0;
  if (winner === 'player' && game.moveCount >= 10) {
    // Get player's current ELO
    const user = await db.get('SELECT elo_rating FROM users WHERE id = ?', [game.playerId]);
    const playerElo = user?.elo_rating || 800;

    // Check anti-farming cooldown
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    const recentWins = await db.all(
      "SELECT COUNT(*) as count FROM bot_win_log WHERE user_id = ? AND bot_elo = ? AND won_at > ?",
      [game.playerId, game.botElo, oneDayAgo]
    );
    const winsToday = recentWins[0]?.count || 0;

    if (game.botElo > playerElo) {
      // Higher-rated boss: scaled bonus
      eloChange = 5 + Math.round((game.botElo - playerElo) * 0.04);
      eloChange = Math.min(eloChange, 25);
      // Diminish on repeat wins
      if (winsToday > 0) eloChange = Math.min(eloChange, 8);
    } else {
      // Lower or equal bot
      eloChange = BOT_LOW_ELO_REWARD;
      // Diminishing returns
      if (winsToday >= 3) eloChange = 0;
      else if (winsToday === 2) eloChange = 1;
      else if (winsToday === 1) eloChange = 2;
    }

    if (eloChange > 0) {
      await db.run('UPDATE users SET elo_rating = elo_rating + ? WHERE id = ?', [eloChange, game.playerId]);
      await db.insert('INSERT INTO bot_win_log (user_id, bot_elo) VALUES (?, ?)', [game.playerId, game.botElo]);

      // Check if this is a first-time boss defeat
      const totalWins = await db.get(
        'SELECT COUNT(*) as count FROM bot_win_log WHERE user_id = ? AND bot_elo = ?',
        [game.playerId, game.botElo]
      );
      if (totalWins?.count === 1) {
        await db.run('UPDATE users SET bots_defeated = bots_defeated + 1 WHERE id = ?', [game.playerId]);
      }
    }
  } else if (winner === 'player' && game.moveCount < 10) {
    // Game too short — no ELO awarded
    eloChange = 0;
  } else if (winner === 'bot') {
    // Player lost against bot — deduct ELO based on expected score against bot rating
    try {
      const user = await db.get('SELECT elo_rating FROM users WHERE id = ?', [game.playerId]);
      const playerElo = user?.elo_rating || 800;
      const expectedPlayer = 1 / (1 + Math.pow(10, (game.botElo - playerElo) / 400));
      // Expected score for player is expectedPlayer, actual score is 0.
      // Standard K=32 matches PvP calculation. Ensure at least -1 deduction.
      eloChange = Math.min(-1, Math.round(32 * (0 - expectedPlayer)));
      const newElo = Math.max(100, playerElo + eloChange);
      await db.run('UPDATE users SET elo_rating = ? WHERE id = ?', [newElo, game.playerId]);
    } catch (err) {
      console.error('[Bot] Failed to calculate and update Elo for bot defeat:', err);
    }
  }

  // Save game
  try {
    await db.run(
      'UPDATE games SET pgn = ?, result = ? WHERE invite_code = ?',
      [game.chess.pgn(), result, game.gameId]
    );
  } catch (err) {
    console.error('[Bot] Failed to save game:', err);
  }

  const updatedUser = await db.get('SELECT elo_rating, bots_defeated FROM users WHERE id = ?', [game.playerId]);

  socket.emit('game_over', {
    result,
    winner,
    reason,
    pgn: game.chess.pgn(),
    fen: game.chess.fen(),
    eloChange,
    newElo: updatedUser?.elo_rating,
    botsDefeated: updatedUser?.bots_defeated,
    moveCount: game.moveCount,
    minMovesRequired: 10
  });

  // Cleanup
  setTimeout(() => {
    activeBotGames.delete(game.gameId);
  }, 60000);
}

function getDenominateReason(chess) {
  if (chess.isStalemate()) return 'stalemate';
  if (chess.isThreefoldRepetition()) return 'threefold';
  if (chess.isInsufficientMaterial()) return 'insufficient';
  return 'draw';
}

module.exports = { register };
