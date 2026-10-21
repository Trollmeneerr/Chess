/**
 * PvP WebSocket Handler — Real-time chess matches
 */
const { Chess } = require('chess.js');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const db = require('../db');

// Active games: inviteCode -> gameState
// Active games: inviteCode -> gameState
const activeGames = new Map();

/**
 * Parse time control strings into milliseconds and increments.
 * Supports presets (bullet, blitz, rapid) and custom formats (e.g. "blitz_3_2", "custom_3_2", "5+3", "10+0")
 */
function parseTimeControl(tc) {
  if (!tc) return { time: 600000, increment: 0, label: '10 min' };
  if (typeof tc === 'object' && tc.time !== undefined) return tc;

  const presets = {
    'bullet': { time: 60000, increment: 0, label: '1 min' },
    'bullet_1_1': { time: 60000, increment: 1000, label: '1|1' },
    'blitz': { time: 180000, increment: 2000, label: '3|2' },
    'blitz_3_2': { time: 180000, increment: 2000, label: '3|2' },
    'blitz_5_3': { time: 300000, increment: 3000, label: '5|3' },
    'rapid': { time: 600000, increment: 0, label: '10 min' },
    'rapid_10_0': { time: 600000, increment: 0, label: '10 min' },
    'rapid_15_10': { time: 900000, increment: 10000, label: '15|10' },
    'untimed': { time: null, increment: 0, label: 'Untimed' }
  };

  if (presets[tc]) return presets[tc];

  // Try parsing custom format: "custom_M_S" or "M+S" or "M|S"
  const customMatch = String(tc).match(/^(?:custom_)?(\d+)[+|_\-](\d+)$/i);
  if (customMatch) {
    const min = Math.max(1, Math.min(180, parseInt(customMatch[1])));
    const incSec = Math.max(0, Math.min(60, parseInt(customMatch[2])));
    return {
      time: min * 60000,
      increment: incSec * 1000,
      label: `${min}|${incSec}`
    };
  }

  return presets.rapid;
}

function startClockTicker(namespace, game) {
  if (game.tickerInterval || game.timeControl === 'untimed' || !game.whiteTime) return;

  game.tickerInterval = setInterval(() => {
    if (game.result || !game.lastMoveTime) return;

    const isWhiteTurn = game.chess.turn() === 'w';
    const now = Date.now();
    const elapsed = now - game.lastMoveTime;

    if (isWhiteTurn) {
      const remaining = game.whiteTime - elapsed;
      if (remaining <= 0) {
        clearInterval(game.tickerInterval);
        game.tickerInterval = null;
        game.whiteTime = 0;
        endGame(namespace, game, 'black', 'timeout');
      }
    } else {
      const remaining = game.blackTime - elapsed;
      if (remaining <= 0) {
        clearInterval(game.tickerInterval);
        game.tickerInterval = null;
        game.blackTime = 0;
        endGame(namespace, game, 'white', 'timeout');
      }
    }
  }, 1000);
}

function register(io) {
  const pvpNamespace = io.of('/pvp');

  pvpNamespace.use((socket, next) => {
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

  pvpNamespace.on('connection', (socket) => {
    console.log(`[PvP] User connected: ${socket.user.username}`);

    // Join a game room
    socket.on('join_game', async (data) => {
      const { invite_code } = data;
      if (!invite_code) return socket.emit('error', { message: 'Invite code required' });

      socket.join(invite_code);
      let game = activeGames.get(invite_code);

      if (!game) {
        // Load from DB
        const dbGame = await db.get('SELECT * FROM games WHERE invite_code = ?', [invite_code]);
        if (!dbGame) return socket.emit('error', { message: 'Game not found' });

        const tc = parseTimeControl(dbGame.time_control);
        game = {
          chess: new Chess(),
          inviteCode: invite_code,
          whiteId: dbGame.white_id,
          blackId: dbGame.black_id,
          timeControl: dbGame.time_control,
          whiteTime: tc.time,
          blackTime: tc.time,
          increment: tc.increment,
          lastMoveTime: null,
          tickerInterval: null,
          players: new Map(),
          spectators: new Set(),
          chat: [],
          result: dbGame.result || null,
          moveCount: 0
        };
        activeGames.set(invite_code, game);
      }

      // Assign player role
      let role = 'spectator';
      if (socket.user.id === game.whiteId) {
        role = 'white';
        game.players.set('white', { socket, user: socket.user });
      } else if (socket.user.id === game.blackId) {
        role = 'black';
        game.players.set('black', { socket, user: socket.user });
      } else if (!game.whiteId || !game.blackId) {
        // Join open slot
        if (!game.whiteId) {
          game.whiteId = socket.user.id;
          role = 'white';
          game.players.set('white', { socket, user: socket.user });
          await db.run('UPDATE games SET white_id = ? WHERE invite_code = ?', [socket.user.id, invite_code]);
        } else if (!game.blackId) {
          game.blackId = socket.user.id;
          role = 'black';
          game.players.set('black', { socket, user: socket.user });
          await db.run('UPDATE games SET black_id = ? WHERE invite_code = ?', [socket.user.id, invite_code]);
        }
      } else {
        game.spectators.add(socket.id);
      }

      // Fetch player info
      const whiteUser = game.whiteId ? await db.get('SELECT username, avatar_id, elo_rating FROM users WHERE id = ?', [game.whiteId]) : null;
      const blackUser = game.blackId ? await db.get('SELECT username, avatar_id, elo_rating FROM users WHERE id = ?', [game.blackId]) : null;

      socket.emit('game_state', {
        fen: game.chess.fen(),
        pgn: game.chess.pgn(),
        role,
        whitePlayer: whiteUser,
        blackPlayer: blackUser,
        whiteTime: game.whiteTime,
        blackTime: game.blackTime,
        increment: game.increment,
        timeControl: game.timeControl,
        turn: game.chess.turn() === 'w' ? 'white' : 'black',
        result: game.result,
        history: game.chess.history({ verbose: true }),
        moveCount: game.moveCount
      });

      // Notify room that player joined
      pvpNamespace.to(invite_code).emit('player_joined', {
        role,
        username: socket.user.username,
        whitePlayer: whiteUser,
        blackPlayer: blackUser
      });
    });

    // Make a move
    socket.on('move', (data) => {
      const { invite_code, move } = data;
      const game = activeGames.get(invite_code);
      if (!game || game.result) return;

      // Verify it's this player's turn
      const isWhiteTurn = game.chess.turn() === 'w';
      if ((isWhiteTurn && socket.user.id !== game.whiteId) ||
          (!isWhiteTurn && socket.user.id !== game.blackId)) {
        return socket.emit('error', { message: 'Not your turn' });
      }

      // Update clock
      if (game.timeControl !== 'untimed' && game.whiteTime !== null) {
        if (game.lastMoveTime) {
          const elapsed = Date.now() - game.lastMoveTime;
          if (isWhiteTurn) {
            game.whiteTime -= elapsed;
            if (game.whiteTime <= 0) {
              game.whiteTime = 0;
              endGame(pvpNamespace, game, 'black', 'timeout');
              return;
            }
          } else {
            game.blackTime -= elapsed;
            if (game.blackTime <= 0) {
              game.blackTime = 0;
              endGame(pvpNamespace, game, 'white', 'timeout');
              return;
            }
          }
        }

        // Apply Fischer increment (+2s, +1s, etc.)
        if (isWhiteTurn) {
          game.whiteTime += game.increment;
        } else {
          game.blackTime += game.increment;
        }

        game.lastMoveTime = Date.now();
        startClockTicker(pvpNamespace, game);
      }

      // Try to make the move
      try {
        const result = game.chess.move(move);
        if (!result) {
          return socket.emit('error', { message: 'Illegal move' });
        }

        game.moveCount++;

        // Broadcast the move
        pvpNamespace.to(invite_code).emit('move_made', {
          move: result,
          fen: game.chess.fen(),
          pgn: game.chess.pgn(),
          whiteTime: game.whiteTime,
          blackTime: game.blackTime,
          turn: game.chess.turn() === 'w' ? 'white' : 'black',
          moveCount: game.moveCount,
          isCheck: game.chess.isCheck(),
          history: game.chess.history({ verbose: true })
        });

        // Check for game end
        if (game.chess.isCheckmate()) {
          const winner = game.chess.turn() === 'w' ? 'black' : 'white';
          endGame(pvpNamespace, game, winner, 'checkmate');
        } else if (game.chess.isDraw()) {
          let reason = 'draw';
          if (game.chess.isStalemate()) reason = 'stalemate';
          else if (game.chess.isThreefoldRepetition()) reason = 'threefold';
          else if (game.chess.isInsufficientMaterial()) reason = 'insufficient';
          endGame(pvpNamespace, game, 'draw', reason);
        }
      } catch (err) {
        socket.emit('error', { message: 'Invalid move format' });
      }
    });

    // Resign
    socket.on('resign', (data) => {
      const { invite_code } = data;
      const game = activeGames.get(invite_code);
      if (!game || game.result) return;

      const winner = socket.user.id === game.whiteId ? 'black' : 'white';
      endGame(pvpNamespace, game, winner, 'resignation');
    });

    // Offer draw
    socket.on('offer_draw', (data) => {
      const { invite_code } = data;
      const game = activeGames.get(invite_code);
      if (!game || game.result) return;

      const offeredBy = socket.user.id === game.whiteId ? 'white' : 'black';
      pvpNamespace.to(invite_code).emit('draw_offered', { by: offeredBy });
    });

    // Accept draw
    socket.on('accept_draw', (data) => {
      const { invite_code } = data;
      const game = activeGames.get(invite_code);
      if (!game || game.result) return;

      endGame(pvpNamespace, game, 'draw', 'agreement');
    });

    // Chat
    socket.on('chat_message', (data) => {
      const { invite_code, message } = data;
      const game = activeGames.get(invite_code);
      if (!game) return;

      const chatMsg = {
        username: socket.user.username,
        message: message.substring(0, 200),
        timestamp: Date.now()
      };
      game.chat.push(chatMsg);

      pvpNamespace.to(invite_code).emit('chat_message', chatMsg);
    });

    // Premove acknowledgement
    socket.on('premove', (data) => {
      const { move } = data;
      socket.emit('premove_set', { move });
    });

    socket.on('disconnect', () => {
      console.log(`[PvP] User disconnected: ${socket.user.username}`);
    });
  });
}

async function endGame(namespace, game, winner, reason) {
  if (game.tickerInterval) {
    clearInterval(game.tickerInterval);
    game.tickerInterval = null;
  }

  game.result = winner === 'draw' ? '1/2-1/2' : (winner === 'white' ? '1-0' : '0-1');

  // Calculate ELO changes
  let whiteEloChange = 0;
  let blackEloChange = 0;
  let newWhiteElo = null;
  let newBlackElo = null;

  try {
    if (game.whiteId && game.blackId && game.whiteId !== game.blackId) {
      const whiteUser = await db.get('SELECT elo_rating FROM users WHERE id = ?', [game.whiteId]);
      const blackUser = await db.get('SELECT elo_rating FROM users WHERE id = ?', [game.blackId]);

      if (whiteUser && blackUser) {
        const rWhite = whiteUser.elo_rating || 800;
        const rBlack = blackUser.elo_rating || 800;

        const expectedWhite = 1 / (1 + Math.pow(10, (rBlack - rWhite) / 400));
        const actualWhite = winner === 'white' ? 1 : (winner === 'draw' ? 0.5 : 0);

        // K = 32
        whiteEloChange = Math.round(32 * (actualWhite - expectedWhite));
        blackEloChange = -whiteEloChange;

        newWhiteElo = Math.max(100, rWhite + whiteEloChange);
        newBlackElo = Math.max(100, rBlack + blackEloChange);

        await db.run('UPDATE users SET elo_rating = ? WHERE id = ?', [newWhiteElo, game.whiteId]);
        await db.run('UPDATE users SET elo_rating = ? WHERE id = ?', [newBlackElo, game.blackId]);
      }
    }
  } catch (err) {
    console.error('[PvP] Failed to calculate and update Elo:', err);
  }

  namespace.to(game.inviteCode).emit('game_over', {
    result: game.result,
    winner,
    reason,
    pgn: game.chess.pgn(),
    fen: game.chess.fen(),
    whiteEloChange,
    blackEloChange,
    newWhiteElo,
    newBlackElo
  });

  // Save to DB
  try {
    await db.run(
      'UPDATE games SET pgn = ?, result = ? WHERE invite_code = ?',
      [game.chess.pgn(), game.result, game.inviteCode]
    );
  } catch (err) {
    console.error('[PvP] Failed to save game result:', err);
  }

  // Clean up after 5 minutes
  setTimeout(() => {
    activeGames.delete(game.inviteCode);
  }, 5 * 60 * 1000);
}

module.exports = { register };
