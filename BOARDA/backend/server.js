const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { Pool } = require('pg');
const createListingRouter = require('./listing-routes');

const BACKEND_DIR = __dirname;
require('dotenv').config({ path: path.join(BACKEND_DIR, '.env') });

const APP = express();
const SCRYPT = promisify(crypto.scrypt);
const PROJECT_DIR = path.resolve(BACKEND_DIR, '..');
const SCHEMA_PATH = path.join(BACKEND_DIR, 'database', 'schema.sql');
const SEED_PATH = path.join(BACKEND_DIR, 'database', 'seed-listings.sql');
const DATABASE_URL = process.env.DATABASE_URL;
const COOKIE_NAME = 'boarda_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DUMMY_SALT = Buffer.alloc(16, 0xa0);

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and add your PostgreSQL connection details.');
  process.exit(1);
}

const PG_POOL = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : undefined,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

PG_POOL.on('error', (ERROR) => {
  console.error('Unexpected PostgreSQL pool error:', ERROR.message);
});

APP.disable('x-powered-by');
APP.use(express.json({ limit: '16kb' }));
APP.use((REQUEST, RESPONSE, NEXT) => {
  RESPONSE.set('X-Content-Type-Options', 'nosniff');
  RESPONSE.set('Cache-Control', 'no-store');
  NEXT();
});

function publicUser(USER) {
  return { id: USER.id, name: USER.name, email: USER.email, role: USER.role };
}

function createPasswordHash(PASSWORD, SALT = crypto.randomBytes(16)) {
  return SCRYPT(PASSWORD, SALT, 64, {
    N: 2 ** 14,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).then((HASH) => ({ salt: SALT.toString('hex'), hash: HASH.toString('hex') }));
}

function tokenHash(TOKEN) {
  return crypto.createHash('sha256').update(TOKEN).digest('hex');
}

function readSessionToken(REQUEST) {
  const COOKIE_HEADER = REQUEST.headers.cookie || '';
  const COOKIE_PAIR = COOKIE_HEADER.split(';').map((PART) => PART.trim()).find((PART) => PART.startsWith(`${COOKIE_NAME}=`));
  return COOKIE_PAIR ? COOKIE_PAIR.slice(COOKIE_NAME.length + 1) : null;
}

function setSessionCookie(RESPONSE, TOKEN) {
  RESPONSE.cookie(COOKIE_NAME, TOKEN, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.BOARDA_COOKIE_SECURE === '1',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });
}

function clearSessionCookie(RESPONSE) {
  RESPONSE.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.BOARDA_COOKIE_SECURE === '1',
    path: '/',
  });
}

async function issueSession(CLIENT, USER_ID) {
  const TOKEN = crypto.randomBytes(32).toString('base64url');
  const EXPIRES_AT = new Date(Date.now() + SESSION_TTL_MS);
  await CLIENT.query('DELETE FROM sessions WHERE expires_at <= NOW()');
  await CLIENT.query(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash(TOKEN), USER_ID, EXPIRES_AT],
  );
  return TOKEN;
}

function sameOrigin(REQUEST, RESPONSE, NEXT) {
  const ORIGIN = REQUEST.get('origin');
  if (!ORIGIN) return NEXT();
  try {
    const ORIGIN_URL = new URL(ORIGIN);
    if (ORIGIN_URL.host === REQUEST.get('host') && ['http:', 'https:'].includes(ORIGIN_URL.protocol)) {
      return NEXT();
    }
  } catch (ERROR) {
    // Reject malformed origins below.
  }
  return RESPONSE.status(403).json({ error: 'This request was not accepted.' });
}

async function requireAuthenticated(REQUEST, RESPONSE, NEXT) {
  const TOKEN = readSessionToken(REQUEST);
  if (!TOKEN) return RESPONSE.status(401).json({ error: 'Sign in to continue.' });

  try {
    const RESULT = await PG_POOL.query(
      `SELECT users.id, users.name, users.email, users.role
       FROM users
       JOIN sessions ON sessions.user_id = users.id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()` ,
      [tokenHash(TOKEN)],
    );
    if (!RESULT.rows[0]) {
      clearSessionCookie(RESPONSE);
      return RESPONSE.status(401).json({ error: 'Your session has expired. Sign in again.' });
    }
    REQUEST.user = RESULT.rows[0];
    NEXT();
  } catch (ERROR) {
    NEXT(ERROR);
  }
}

function requireRole(...ALLOWED_ROLES) {
  return (REQUEST, RESPONSE, NEXT) => {
    if (!REQUEST.user) return RESPONSE.status(401).json({ error: 'Sign in to continue.' });
    if (!ALLOWED_ROLES.includes(REQUEST.user.role)) {
      return RESPONSE.status(403).json({ error: 'Your account does not have permission to do that.' });
    }
    NEXT();
  };
}

function validateRegistration(REQUEST, RESPONSE, NEXT) {
  const { name, email, password, role } = REQUEST.body || {};
  if (![name, email, password, role].every((VALUE) => typeof VALUE === 'string')) {
    return RESPONSE.status(400).json({ error: 'Enter your name, email, password, and account type.' });
  }

  REQUEST.registration = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    role: role.trim().toLowerCase(),
  };
  const INPUT = REQUEST.registration;

  if (!INPUT.name || INPUT.name.length > 100) {
    return RESPONSE.status(400).json({ error: 'Enter a name up to 100 characters long.' });
  }
  if (INPUT.email.length > 254 || !EMAIL_PATTERN.test(INPUT.email)) {
    return RESPONSE.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (INPUT.password.length < 8 || INPUT.password.length > 128) {
    return RESPONSE.status(400).json({ error: 'Use a password between 8 and 128 characters.' });
  }
  if (!['student', 'landlord'].includes(INPUT.role)) {
    return RESPONSE.status(400).json({ error: 'Choose student or landlord as your account type.' });
  }
  NEXT();
}

APP.post('/api/auth/register', sameOrigin, validateRegistration, async (REQUEST, RESPONSE, NEXT) => {
  const INPUT = REQUEST.registration;
  let CLIENT;
  let TRANSACTION_STARTED = false;
  try {
    const PASSWORD_DATA = await createPasswordHash(INPUT.password);
    CLIENT = await PG_POOL.connect();
    await CLIENT.query('BEGIN');
    TRANSACTION_STARTED = true;
    const RESULT = await CLIENT.query(
      `INSERT INTO users (name, email, role, password_salt, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role`,
      [INPUT.name, INPUT.email, INPUT.role, PASSWORD_DATA.salt, PASSWORD_DATA.hash],
    );
    const USER = RESULT.rows[0];
    await CLIENT.query(
      `INSERT INTO notifications (user_id, type, title, message, target_url)
       VALUES ($1, 'welcome', 'Welcome to Boarda', 'Your Boarda account is ready. You can manage your account and explore boarding houses here.', $2)`,
      [USER.id, USER.role === 'landlord' ? '/Frontend/landlord-dashboard.html' : '/Frontend/student-dashboard.html'],
    );
    const TOKEN = await issueSession(CLIENT, USER.id);
    await CLIENT.query('COMMIT');
    TRANSACTION_STARTED = false;
    setSessionCookie(RESPONSE, TOKEN);
    RESPONSE.status(201).json({ user: publicUser(USER) });
  } catch (ERROR) {
    if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
    if (ERROR.code === '23505' && ERROR.constraint === 'users_email_lower_unique') {
      return RESPONSE.status(409).json({ error: 'An account with that email already exists.' });
    }
    NEXT(ERROR);
  } finally {
    CLIENT?.release();
  }
});

APP.post('/api/auth/login', sameOrigin, async (REQUEST, RESPONSE, NEXT) => {
  const { email, password } = REQUEST.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return RESPONSE.status(400).json({ error: 'Enter your email and password.' });
  }

  let CLIENT;
  let TRANSACTION_STARTED = false;
  try {
    CLIENT = await PG_POOL.connect();
    const RESULT = await CLIENT.query(
      'SELECT id, name, email, role, password_salt, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()],
    );
    const USER = RESULT.rows[0];
    const SALT = USER ? Buffer.from(USER.password_salt, 'hex') : DUMMY_SALT;
    const CANDIDATE = await createPasswordHash(password, SALT);
    const STORED_HASH = USER ? Buffer.from(USER.password_hash, 'hex') : Buffer.alloc(64);
    const PASSWORD_MATCHES = crypto.timingSafeEqual(Buffer.from(CANDIDATE.hash, 'hex'), STORED_HASH) && Boolean(USER);

    if (!PASSWORD_MATCHES) {
      return RESPONSE.status(401).json({ error: 'Email or password is incorrect.' });
    }

    await CLIENT.query('BEGIN');
    TRANSACTION_STARTED = true;
    const TOKEN = await issueSession(CLIENT, USER.id);
    await CLIENT.query('COMMIT');
    TRANSACTION_STARTED = false;
    setSessionCookie(RESPONSE, TOKEN);
    RESPONSE.json({ user: publicUser(USER) });
  } catch (ERROR) {
    if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
    NEXT(ERROR);
  } finally {
    CLIENT?.release();
  }
});

APP.get('/api/auth/me', requireAuthenticated, (REQUEST, RESPONSE) => {
  RESPONSE.json({ user: publicUser(REQUEST.user) });
});

APP.post('/api/auth/logout', sameOrigin, async (REQUEST, RESPONSE, NEXT) => {
  const TOKEN = readSessionToken(REQUEST);
  try {
    if (TOKEN) await PG_POOL.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(TOKEN)]);
    clearSessionCookie(RESPONSE);
    RESPONSE.json({ ok: true });
  } catch (ERROR) {
    NEXT(ERROR);
  }
});

APP.use('/api', createListingRouter({
  pool: PG_POOL,
  requireAuthenticated,
  requireRole,
  sameOrigin,
}));

APP.get('/', (REQUEST, RESPONSE) => RESPONSE.redirect('/Frontend/index.html'));
APP.use((REQUEST, RESPONSE, NEXT) => {
  if (REQUEST.path === '/backend' || REQUEST.path.startsWith('/backend/')) {
    return RESPONSE.sendStatus(404);
  }
  NEXT();
});
APP.use(express.static(PROJECT_DIR, { dotfiles: 'deny', index: false }));
APP.use((REQUEST, RESPONSE) => {
  if (REQUEST.path.startsWith('/api/')) return RESPONSE.status(404).json({ error: 'API route not found.' });
  RESPONSE.status(404).send('Page not found.');
});
APP.use((ERROR, REQUEST, RESPONSE, NEXT) => {
  if (RESPONSE.headersSent) return NEXT(ERROR);
  if (ERROR.type === 'entity.parse.failed') return RESPONSE.status(400).json({ error: 'Invalid JSON request.' });
  if (ERROR.type === 'entity.too.large') return RESPONSE.status(413).json({ error: 'Request body is too large.' });
  console.error('Boarda request failed:', ERROR.message);
  RESPONSE.status(500).json({ error: 'The server could not complete that request.' });
});

async function startServer() {
  const SCHEMA = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const SEED_DATA = fs.readFileSync(SEED_PATH, 'utf8');
  await PG_POOL.query(SCHEMA);
  await PG_POOL.query(SEED_DATA);
  const PORT = Number(process.env.PORT || 8000);
  const HOST = process.env.HOST || '127.0.0.1';
  APP.listen(PORT, HOST, () => {
    console.log(`Boarda is running at http://${HOST}:${PORT}/Frontend/index.html`);
  });
}

startServer().catch((ERROR) => {
  console.error('Could not start Boarda. Check DATABASE_URL and PostgreSQL availability.');
  console.error(ERROR.message);
  process.exitCode = 1;
});
