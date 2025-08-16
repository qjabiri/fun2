require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

// ─────────────────────────────────────────────────────────────────────────────
// Core setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false });

// email transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

// ─────────────────────────────────────────────────────────────────────────────
// DB bootstrap
// ─────────────────────────────────────────────────────────────────────────────
async function bootstrap() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`create table if not exists users (
      id text primary key,
      email text unique not null,
      display_name text,
      email_verified_at timestamptz,
      created_at timestamptz not null default now()
    )`);
    await client.query(`create table if not exists magic_tokens (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token text not null,
      purpose text not null,
      expires_at timestamptz not null,
      used boolean not null default false,
      created_at timestamptz not null default now()
    )`);
    await client.query(`create table if not exists games (
      id text primary key,
      owner_id text not null references users(id) on delete cascade,
      code text unique not null,
      name text not null,
      status text not null default 'lobby',
      created_at timestamptz not null default now()
    )`);
    await client.query(`create table if not exists game_members (
      game_id text not null references games(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      role text not null default 'player',
      joined_at timestamptz not null default now(),
      primary key (game_id, user_id)
    )`);
    await client.query(`create table if not exists invitations (
      id text primary key,
      game_id text not null references games(id) on delete cascade,
      email text not null,
      token text not null,
      expires_at timestamptz not null,
      accepted_at timestamptz
    )`);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('DB bootstrap failed', e);
    process.exit(1);
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function signJWT(user) {
  return jwt.sign({ uid: user.id, email: user.email, name: user.display_name }, JWT_SECRET, { expiresIn: '30d' });
}

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !!process.env.RENDER, // truthy on Render
    maxAge: 1000 * 60 * 60 * 24 * 30
  });
}

function genToken(len = 24) {
  return crypto.randomBytes(len).toString('hex');
}

function slug(n = 6) {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
}

async function sendMagicLink(email, userId) {
  const token = genToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await pool.query('insert into magic_tokens (id, user_id, token, purpose, expires_at) values ($1,$2,$3,$4,$5)', [uuidv4(), userId, token, 'login', expiresAt]);
  const url = `${APP_URL}/auth/verify?token=${token}&uid=${encodeURIComponent(userId)}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: 'Your Git Game sign-in link',
    text: `Click to sign in: ${url}\nThis link expires in 15 minutes.`,
    html: `<p>Click to sign in:</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`
  });
}

async function sendInviteEmail(email, game, token) {
  const url = `${APP_URL}/join/${encodeURIComponent(game.code)}?inv=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: `You're invited to play "${game.name}"`,
    text: `Join the game here: ${url}`,
    html: `<p>You've been invited to <b>${game.name}</b>.</p><p><a href="${url}">Join the game</a></p>`
  });
}

// Attach req.user if JWT present
function authOptional(req, _res, next) {
  const token = req.cookies.token;
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET); } catch (_) {}
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.use(authOptional);

// ─────────────────────────────────────────────────────────────────────────────
// Auth routes (passwordless email)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/auth/magic-link', async (req, res) => {
  let { email, name } = req.body || {};
  if (!email || typeof email !== 'string') return res.status(400).json({ error: 'email required' });
  email = email.trim().toLowerCase();
  name = (name || '').toString().trim().slice(0, 40) || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let user = (await client.query('select * from users where email=$1', [email])).rows[0];
    if (!user) {
      user = (await client.query(
        'insert into users (id, email, display_name) values ($1,$2,$3) returning *',
        [uuidv4(), email, name]
      )).rows[0];
    }
    await client.query('COMMIT');
    await sendMagicLink(email, user.id);
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'failed_to_send_link' });
  } finally {
    client.release();
  }
});

app.get('/auth/verify', async (req, res) => {
  const { token, uid } = req.query;
  if (!token || !uid) return res.status(400).send('Invalid link');
  const now = new Date();
  const row = (await pool.query(
    'select * from magic_tokens where user_id=$1 and token=$2 and purpose=$3 and used=false and expires_at > $4',
    [uid, token, 'login', now]
  )).rows[0];
  if (!row) return res.status(400).send('Link expired or invalid');

  await pool.query('update magic_tokens set used=true where id=$1', [row.id]);
  await pool.query('update users set email_verified_at=coalesce(email_verified_at, now()) where id=$1', [uid]);
  const user = (await pool.query('select * from users where id=$1', [uid])).rows[0];
  const jwtToken = signJWT(user);
  setAuthCookie(res, jwtToken);
  res.redirect('/');
});

app.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/me', requireAuth, async (req, res) => {
  // include my games list
  const games = (await pool.query(
    `select g.id, g.code, g.name, g.status,
            (case when g.owner_id=$1 then 'owner' else gm.role end) as role
       from games g
       join game_members gm on gm.game_id=g.id
      where gm.user_id=$1
      order by g.created_at desc`, [req.user.uid]
  )).rows;
  res.json({ user: req.user, games });
});

// ─────────────────────────────────────────────────────────────────────────────
// Games & invites
// ─────────────────────────────────────────────────────────────────────────────
app.post('/games', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').toString().trim() || 'My Game';
  const code = slug();
  const gameId = uuidv4();
  await pool.query('insert into games (id, owner_id, code, name) values ($1,$2,$3,$4)', [gameId, req.user.uid, code, name]);
  await pool.query('insert into game_members (game_id, user_id, role) values ($1,$2,$3)', [gameId, req.user.uid, 'owner']);
  res.json({ id: gameId, code, name, role: 'owner' });
});

app.post('/games/:code/invite', requireAuth, async (req, res) => {
  const code = req.params.code;
  const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const game = (await pool.query('select * from games where code=$1', [code])).rows[0];
  if (!game) return res.status(404).json({ error: 'not_found' });
  if (game.owner_id !== req.user.uid) return res.status(403).json({ error: 'forbidden' });

  const now = Date.now();
  for (const raw of emails) {
    const email = (raw || '').toString().trim().toLowerCase();
    if (!email) continue;
    const token = genToken();
    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000);
    await pool.query('insert into invitations (id, game_id, email, token, expires_at) values ($1,$2,$3,$4,$5)', [uuidv4(), game.id, email, token, expiresAt]);
    await sendInviteEmail(email, game, token);
  }
  res.json({ ok: true });
});

// Accept invite & join (email-less path via link)
app.post('/games/:code/join', requireAuth, async (req, res) => {
  const code = req.params.code;
  const inv = (req.query?.inv || '').toString();
  const game = (await pool.query('select * from games where code=$1', [code])).rows[0];
  if (!game) return res.status(404).json({ error: 'not_found' });

  // If invite token provided, mark accepted
  if (inv) {
    const row = (await pool.query(
      'select * from invitations where game_id=$1 and token=$2 and expires_at > now()', [game.id, inv]
    )).rows[0];
    if (row && !row.accepted_at) {
      await pool.query('update invitations set accepted_at=now() where id=$1', [row.id]);
    }
  }

  // Add membership if missing
  const mem = (await pool.query('select * from game_members where game_id=$1 and user_id=$2', [game.id, req.user.uid])).rows[0];
  if (!mem) await pool.query('insert into game_members (game_id, user_id, role) values ($1,$2,$3)', [game.id, req.user.uid, 'player']);

  res.json({ ok: true, game: { id: game.id, code: game.code, name: game.name } });
});

// ─────────────────────────────────────────────────────────────────────────────
// Socket.IO — authenticated, per‑game rooms, ephemeral rounds
// ─────────────────────────────────────────────────────────────────────────────
// Simple cookie parser for socket handshakes
function parseCookie(str='') {
  return Object.fromEntries(str.split(';').map(v => v.trim().split('=').map(decodeURIComponent)).filter(p => p[0]));
}

io.use((socket, next) => {
  try {
    const cookies = parseCookie(socket.request.headers.cookie || '');
    if (!cookies.token) return next(new Error('unauthorized'));
    socket.user = jwt.verify(cookies.token, JWT_SECRET);
    next();
  } catch (e) {
    next(new Error('unauthorized'));
  }
});

// In‑memory per‑game state (questions/answers NEVER touch the DB)
/**
 * gameState[code] = {
 *   players: Map<userId, { id, name, score, connected }>,
 *   turn: string[] (userIds in order),
 *   current: number,
 *   question: string|null,
 *   questionerId: string|null,
 *   responses: Array<{ id: string, text: string, userId: string }>,
 * }
 */
const gameState = new Map();

async function isMember(userId, code) {
  const game = (await pool.query('select * from games where code=$1', [code])).rows[0];
  if (!game) return { ok: false };
  const mem = (await pool.query('select role from game_members where game_id=$1 and user_id=$2', [game.id, userId])).rows[0];
  if (!mem) return { ok: false };
  return { ok: true, game, role: mem.role };
}

function publishRoster(code) {
  const gs = gameState.get(code);
  if (!gs) return;
  const roster = [...gs.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected }));
  io.to(`game:${code}`).emit('roster', roster);
}

function currentAsker(gs) {
  if (!gs || !gs.turn.length) return null;
  const uid = gs.turn[gs.current % gs.turn.length];
  return gs.players.get(uid) || null;
}

io.on('connection', (socket) => {
  // Join a game room
  socket.on('joinGame', async ({ code }) => {
    const { ok, game, role } = await isMember(socket.user.uid, code);
    if (!ok) return socket.emit('errorMsg', 'Not a member of this game');

    socket.join(`game:${code}`);

    if (!gameState.has(code)) {
      gameState.set(code, {
        players: new Map(),
        turn: [],
        current: 0,
        question: null,
        questionerId: null,
        responses: []
      });
    }
    const gs = gameState.get(code);

    if (!gs.players.has(socket.user.uid)) {
      gs.players.set(socket.user.uid, { id: socket.user.uid, name: socket.user.name || socket.user.email, score: 0, connected: true });
      gs.turn.push(socket.user.uid);
    } else {
      gs.players.get(socket.user.uid).connected = true;
    }

    publishRoster(code);
    socket.emit('gameMeta', { code, name: game.name, role, asker: currentAsker(gs) });

    // owner can start
    socket.on('startGame', async () => {
      if (game.owner_id !== socket.user.uid) return;
      io.to(`game:${code}`).emit('gameStarted', { asker: currentAsker(gs) });
    });

    // question submit (only current asker)
    socket.on('submitQuestion', (text) => {
      const isAsker = currentAsker(gs)?.id === socket.user.uid;
      if (!isAsker || !text || gs.question) return;
      gs.question = String(text).slice(0, 500);
      gs.questionerId = socket.user.uid;
      gs.responses = [];
      io.to(`game:${code}`).emit('newQuestion', gs.question);
    });

    // response submit (not asker, once)
    socket.on('submitResponse', (resp) => {
      if (!gs.question) return;
      if (socket.user.uid === gs.questionerId) return;
      const already = gs.responses.find(r => r.userId === socket.user.uid);
      if (already) return;
      const text = String(resp || '').trim();
      if (!text) return;
      gs.responses.push({ id: uuidv4(), text: text.slice(0, 300), userId: socket.user.uid });
      // broadcast anonymously
      io.to(`game:${code}`).emit('newResponse', { id: gs.responses[gs.responses.length - 1].id, text });
    });

    // pick winner (only asker)
    socket.on('awardPoints', (responseId) => {
      const isAsker = currentAsker(gs)?.id === socket.user.uid;
      if (!isAsker || !gs.question) return;
      const chosen = gs.responses.find(r => r.id === responseId);
      if (!chosen) return;
      const p = gs.players.get(chosen.userId);
      if (p) p.score += 1;
      io.to(`game:${code}`).emit('scores', [...gs.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score })));
      // Wipe ephemeral content immediately for privacy
      gs.question = null;
      gs.responses = [];
      gs.questionerId = null;
      // next turn
      gs.current = (gs.current + 1) % gs.turn.length;
      io.to(`game:${code}`).emit('newAsker', currentAsker(gs));
    });

    // owner/asker can skip
    socket.on('forceNext', () => {
      const isOwner = game.owner_id === socket.user.uid;
      const isAsker = currentAsker(gs)?.id === socket.user.uid;
      if (!isOwner && !isAsker) return;
      gs.question = null;
      gs.responses = [];
      gs.questionerId = null;
      gs.current = (gs.current + 1) % gs.turn.length;
      io.to(`game:${code}`).emit('newAsker', currentAsker(gs));
    });

    socket.on('disconnect', () => {
      if (gs.players.has(socket.user.uid)) {
        gs.players.get(socket.user.uid).connected = false;
        publishRoster(code);
      }
    });
  });
});

// Healthcheck for Render
app.get('/healthz', (_req, res) => res.send('ok'));

bootstrap().then(() => {
  server.listen(PORT, () => console.log(`✅ Server listening on ${PORT}`));
});
