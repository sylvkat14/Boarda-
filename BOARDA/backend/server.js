const express = require('express');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { Pool } = require('pg');
const { SMTPClient } = require('emailjs');
const createListingRouter = require('./listing-routes');
const createAdminRouter = require('./admin-routes');

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
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_REQUEST_MAX = 5;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DUMMY_SALT = Buffer.alloc(16, 0xa0);
const APP_BASE_URL = new URL(process.env.APP_BASE_URL || 'http://localhost:8000').origin;
const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_CONFIG_PRESENT = [SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM].some(Boolean);
const SMTP_OPTIONS = SMTP_HOST && SMTP_FROM
  ? {
      host: SMTP_HOST,
      port: SMTP_PORT,
      ssl: SMTP_SECURE,
      tls: !SMTP_SECURE,
      timeout: 10000,
      ...(SMTP_USER && SMTP_PASS ? { user: SMTP_USER, password: SMTP_PASS } : {}),
    }
  : null;
const PASSWORD_RESET_REQUESTS = new Map();

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Copy .env.example to .env and add your PostgreSQL connection details.');
  process.exit(1);
}

const APP_BASE_PROTOCOL = new URL(APP_BASE_URL).protocol;
if (!['http:', 'https:'].includes(APP_BASE_PROTOCOL)
  || (process.env.NODE_ENV === 'production' && APP_BASE_PROTOCOL !== 'https:')) {
  throw new Error('APP_BASE_URL must use HTTP or HTTPS, and HTTPS in production.');
}
if (SMTP_CONFIG_PRESENT && (
  !SMTP_HOST
  || !SMTP_FROM
  || !Number.isInteger(SMTP_PORT)
  || SMTP_PORT < 1
  || SMTP_PORT > 65535
  || Boolean(SMTP_USER) !== Boolean(SMTP_PASS)
)) {
  throw new Error('Configure SMTP_HOST, SMTP_FROM, a valid SMTP_PORT, and both SMTP_USER/SMTP_PASS when authentication is required.');
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
  RESPONSE.set('Referrer-Policy', 'no-referrer');
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

async function sendEmail({ to, replyTo, subject, text }) {
  const MAIL_CLIENT = new SMTPClient(SMTP_OPTIONS);
  try {
    await MAIL_CLIENT.sendAsync({
      from: SMTP_FROM,
      to,
      subject,
      text,
      'Reply-To': replyTo,
    });
  } finally {
    MAIL_CLIENT.smtp.close();
  }
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

function limitPasswordResetRequests(REQUEST, RESPONSE, NEXT) {
  const NOW = Date.now();
  const KEY = REQUEST.ip;
  const ENTRY = PASSWORD_RESET_REQUESTS.get(KEY);
  if (!ENTRY || ENTRY.resetAt <= NOW) {
    PASSWORD_RESET_REQUESTS.set(KEY, { count: 1, resetAt: NOW + PASSWORD_RESET_REQUEST_WINDOW_MS });
  } else if (ENTRY.count >= PASSWORD_RESET_REQUEST_MAX) {
    RESPONSE.set('Retry-After', String(Math.ceil((ENTRY.resetAt - NOW) / 1000)));
    return RESPONSE.status(429).json({ error: 'Too many recovery requests. Please try again later.' });
  } else {
    ENTRY.count += 1;
  }

  if (PASSWORD_RESET_REQUESTS.size > 1000) {
    for (const [ADDRESS, REQUEST_ENTRY] of PASSWORD_RESET_REQUESTS) {
      if (REQUEST_ENTRY.resetAt <= NOW) PASSWORD_RESET_REQUESTS.delete(ADDRESS);
    }
  }
  NEXT();
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

APP.post('/api/auth/password-reset/request', sameOrigin, limitPasswordResetRequests, async (REQUEST, RESPONSE, NEXT) => {
  const EMAIL = REQUEST.body?.email;
  if (typeof EMAIL !== 'string' || EMAIL.trim().length > 254 || !EMAIL_PATTERN.test(EMAIL.trim())) {
    return RESPONSE.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!SMTP_OPTIONS) {
    return RESPONSE.status(503).json({ error: 'Password recovery is not configured. Please contact support.' });
  }

  try {
    const RESULT = await PG_POOL.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [EMAIL.trim()],
    );
    if (!RESULT.rows[0]) {
      return RESPONSE.status(202).json({
        message: 'If an account exists for that email, a password reset link will be sent shortly.',
      });
    }

    const USER_ID = RESULT.rows[0].id;
    const RESET_TOKEN = crypto.randomBytes(32).toString('hex');
    const RESET_TOKEN_HASH = tokenHash(RESET_TOKEN);
    const EXPIRES_AT = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await PG_POOL.query(
      `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [RESET_TOKEN_HASH, USER_ID, EXPIRES_AT],
    );

    const RESET_URL = new URL('/Frontend/reset-password.html', APP_BASE_URL);
    RESET_URL.searchParams.set('token', RESET_TOKEN);
    let MAIL_CLIENT;
    try {
      MAIL_CLIENT = new SMTPClient(SMTP_OPTIONS);
      await MAIL_CLIENT.sendAsync({
        from: SMTP_FROM,
        to: EMAIL.trim(),
        subject: 'Reset your Boarda password',
        text: `Use this link within one hour to reset your Boarda password: ${RESET_URL.href}\n\nIf you did not request a reset, you can ignore this email.`,
        attachment: [{
          data: `<p>Use the link below within one hour to reset your Boarda password.</p><p><a href="${RESET_URL.href}">Reset your password</a></p><p>If you did not request a reset, you can ignore this email.</p>`,
          alternative: true,
          contentType: 'text/html',
        }],
      });
    } catch (ERROR) {
      try {
        await PG_POOL.query(
          'DELETE FROM password_reset_tokens WHERE token_hash = $1',
          [RESET_TOKEN_HASH],
        );
      } catch (DELETE_ERROR) {
        console.error('Could not revoke an undelivered password reset token:', DELETE_ERROR.code || DELETE_ERROR.name);
      }
      const SAFE_ERROR_MESSAGE = String(ERROR.message || '')
        .split(RESET_TOKEN).join('[redacted token]')
        .split(EMAIL.trim()).join('[redacted email]');
      console.error('Password reset email delivery failed:', ERROR.code || ERROR.name, SAFE_ERROR_MESSAGE);
    } finally {
      MAIL_CLIENT?.smtp.close();
    }

    RESPONSE.status(202).json({
      message: 'If an account exists for that email, a password reset link will be sent shortly.',
    });
  } catch (ERROR) {
    NEXT(ERROR);
  }
});

APP.post('/api/auth/password-reset/complete', sameOrigin, async (REQUEST, RESPONSE, NEXT) => {
  const { token, password } = REQUEST.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return RESPONSE.status(400).json({ error: 'This password reset link is invalid or expired.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return RESPONSE.status(400).json({ error: 'Use a password between 8 and 128 characters.' });
  }

  let CLIENT;
  let TRANSACTION_STARTED = false;
  try {
    CLIENT = await PG_POOL.connect();
    await CLIENT.query('BEGIN');
    TRANSACTION_STARTED = true;
    const RESULT = await CLIENT.query(
      `SELECT user_id
       FROM password_reset_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash(token)],
    );
    if (!RESULT.rows[0]) {
      await CLIENT.query('ROLLBACK');
      TRANSACTION_STARTED = false;
      return RESPONSE.status(400).json({ error: 'This password reset link is invalid or expired.' });
    }

    const PASSWORD_DATA = await createPasswordHash(password);
    const USER_ID = RESULT.rows[0].user_id;
    await CLIENT.query(
      'UPDATE users SET password_salt = $1, password_hash = $2 WHERE id = $3',
      [PASSWORD_DATA.salt, PASSWORD_DATA.hash, USER_ID],
    );
    await CLIENT.query('DELETE FROM sessions WHERE user_id = $1', [USER_ID]);
    await CLIENT.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [USER_ID]);
    await CLIENT.query('COMMIT');
    TRANSACTION_STARTED = false;
    RESPONSE.json({ message: 'Your password has been reset. Sign in with your new password.' });
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

APP.get('/api/admin/overview', requireAuthenticated, requireRole('admin'), async (_REQUEST, RESPONSE, NEXT) => {
  try {
    const [USERS, LISTINGS, INQUIRIES] = await Promise.all([
      PG_POOL.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE role = 'student')::int AS students,
               COUNT(*) FILTER (WHERE role = 'landlord')::int AS landlords,
               COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
        FROM users
      `),
      PG_POOL.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'published')::int AS published,
               COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
               COUNT(*) FILTER (WHERE status = 'archived')::int AS archived
        FROM listings
      `),
      PG_POOL.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'new')::int AS new
        FROM listing_inquiries
      `),
    ]);
    RESPONSE.json({
      users: USERS.rows[0],
      listings: LISTINGS.rows[0],
      inquiries: INQUIRIES.rows[0],
    });
  } catch (ERROR) {
    NEXT(ERROR);
  }
});

APP.use('/api/admin', createAdminRouter({
  pool: PG_POOL,
  requireAuthenticated,
  requireRole,
  sameOrigin,
}));
APP.use('/api', createListingRouter({
  pool: PG_POOL,
  requireAuthenticated,
  requireRole,
  sameOrigin,
  sendEmail: SMTP_OPTIONS ? sendEmail : null,
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
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (!EMAIL_PATTERN.test(ADMIN_EMAIL) || ADMIN_PASSWORD.length < 8) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be valid.');
    }
    const PASSWORD_DATA = await createPasswordHash(ADMIN_PASSWORD);
    const EXISTING_ADMIN = await PG_POOL.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [ADMIN_EMAIL],
    );
    if (EXISTING_ADMIN.rows[0]) {
      await PG_POOL.query(
        `UPDATE users
         SET name = $1, role = 'admin', password_salt = $2, password_hash = $3
         WHERE id = $4`,
        [process.env.ADMIN_NAME?.trim() || 'Boarda Admin', PASSWORD_DATA.salt, PASSWORD_DATA.hash, EXISTING_ADMIN.rows[0].id],
      );
    } else {
      await PG_POOL.query(
        `INSERT INTO users (name, email, role, password_salt, password_hash)
         VALUES ($1, $2, 'admin', $3, $4)`,
        [process.env.ADMIN_NAME?.trim() || 'Boarda Admin', ADMIN_EMAIL, PASSWORD_DATA.salt, PASSWORD_DATA.hash],
      );
    }
  }
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
