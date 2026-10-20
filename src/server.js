/**
 * Refrigerator Chess — Main Server
 * Self-hosted chess platform for isyourrefrigerator.online
 */
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

// Parse CLI args
const args = process.argv.slice(2);
let port = parseInt(process.env.SERVER_PORT || process.env.P_SERVER_PORT) || 3080;
let domain = process.env.SUBDOMAIN || 'chess.isyourrefrigerator.online';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1]);
  if (args[i] === '--domain' && args[i + 1]) domain = args[i + 1];
}

const updater = require('./updater');
const db = require('./db');
const stockfish = require('./engine/stockfish');

// Express app
const app = express();
const server = http.createServer(app);

// CORS & Origins
const allowedOrigins = [
  `https://${domain}`,
  `http://${domain}`,
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  'http://localhost:3080',
  'http://127.0.0.1:3080'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes(domain)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
};

// Socket.io
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      workerSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "*", `wss://${domain}`, `ws://${domain}`, `ws://localhost:${port}`, `wss://localhost:${port}`]
    }
  }
}));
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/img', express.static(path.join(__dirname, '..', 'public', 'img')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/.source/img', express.static(path.join(__dirname, '..', '.source', 'img')));
app.use('/source/img', express.static(path.join(__dirname, '..', '.source', 'img')));

// API routes
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const puzzleRoutes = require('./routes/puzzles');
const userRoutes = require('./routes/users');
const analysisRoutes = require('./routes/analysis');

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/puzzles', puzzleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analysis', analysisRoutes);

// SPA fallback — serve index.html for all non-API routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Socket handlers
const pvpSocket = require('./sockets/pvp');
const botSocket = require('./sockets/bot');
pvpSocket.register(io);
botSocket.register(io);

// Start server sequence with update check
async function startServer() {
  console.log('[Server] Starting Refrigerator Chess initialization...');

  // 1. Check for repository and code updates
  try {
    const updated = await updater.checkAndApplyUpdates();
    if (updated) {
      // If code was updated, the process has restarted or will exit
      return;
    }
  } catch (err) {
    console.warn('[Updater] Pre-flight update check note:', err.message);
  }

  // 2. Initialize database and run schema migrations
  try {
    await db.initialize();
    console.log('[DB] Database initialized successfully');
  } catch (err) {
    console.error('[DB] Failed to initialize database:', err);
    process.exit(1);
  }

  // 3. Initialize Stockfish engine pool
  stockfish.initialize();

  // 4. Start HTTP & Socket.IO server
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Server] Refrigerator Chess running on port ${port}`);
    console.log(`[Server] Domain: ${domain}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();
