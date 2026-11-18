require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { pool, initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(express.json());

app.use(
  session({
    store: new pgSession({
      pool: pool,
      tableName: 'session'
    }),
    secret: process.env.SESSION_SECRET || 'fallback-dev-secret-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days persistent login
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax'
    }
  })
);

// Middleware: Require logged-in user
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'You must be signed in to perform this action.' });
  }
  next();
}

// Middleware: Require moderator role (verified fresh from database)
async function requireModerator(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'You must be signed in.' });
  }
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0 || result.rows[0].role !== 'moderator') {
      return res.status(403).json({ error: 'Moderator privileges required.' });
    }
    next();
  } catch (err) {
    console.error('Moderator check error:', err);
    res.status(500).json({ error: 'Server error verifying permissions.' });
  }
}

// --- AUTH ROUTES ---

// Register new account
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUsername = username.trim();
  if (cleanUsername.length < 3 || cleanUsername.length > 30) {
    return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and hyphens.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role',
      [cleanUsername, passwordHash, 'user']
    );

    const user = result.rows[0];
    req.session.userId = user.id;
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

// Sign in
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, username, password_hash, role FROM users WHERE LOWER(username) = LOWER($1)',
      [username.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.userId = user.id;
    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to sign in.' });
  }
});

// Sign out
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Signed out successfully.' });
  });
});

// Check current session user
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ user: null });
  }

  try {
    const result = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [req.session.userId]);
    if (result.rows.length === 0) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Session check error:', err);
    res.status(500).json({ error: 'Failed to verify session.' });
  }
});

// Activate moderator role with secret environment variable
app.post('/api/auth/activate-moderator', requireAuth, async (req, res) => {
  const { code } = req.body;
  const serverModCode = process.env.MODERATOR_CODE;

  if (!serverModCode) {
    return res.status(500).json({ error: 'Moderator activation is not configured on the server.' });
  }

  if (!code || code.trim() !== serverModCode) {
    return res.status(403).json({ error: 'Invalid moderator activation code.' });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET role = 'moderator' WHERE id = $1 RETURNING id, username, role",
      [req.session.userId]
    );
    res.json({
      message: 'Moderator status permanently unlocked!',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Moderator activation error:', err);
    res.status(500).json({ error: 'Failed to update role.' });
  }
});

// --- PRINTS ROUTES ---

// Get all prints
app.get('/api/prints', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, added_by, status, created_at, picked_up_at, picked_up_by FROM prints ORDER BY created_at DESC'
    );
    res.json({ prints: result.rows });
  } catch (err) {
    console.error('Fetch prints error:', err);
    res.status(500).json({ error: 'Failed to load prints.' });
  }
});

// Add new print (Normal users & Moderators)
app.post('/api/prints', requireAuth, async (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Print name is required.' });
  }

  try {
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.session.userId]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found.' });
    }

    const username = userResult.rows[0].username;
    const result = await pool.query(
      `INSERT INTO prints (name, description, added_by, status)
       VALUES ($1, $2, $3, 'waiting')
       RETURNING id, name, description, added_by, status, created_at, picked_up_at, picked_up_by`,
      [name.trim().slice(0, 120), (description || '').trim().slice(0, 500), username]
    );

    res.status(201).json({ print: result.rows[0] });
  } catch (err) {
    console.error('Add print error:', err);
    res.status(500).json({ error: 'Failed to add print.' });
  }
});

// Mark print as picked up (Moderators only)
app.patch('/api/prints/:id/pickup', requireModerator, async (req, res) => {
  const printId = parseInt(req.params.id, 10);
  if (isNaN(printId)) {
    return res.status(400).json({ error: 'Invalid print ID.' });
  }

  try {
    const modResult = await pool.query('SELECT username FROM users WHERE id = $1', [req.session.userId]);
    const modUsername = modResult.rows[0].username;

    const result = await pool.query(
      `UPDATE prints
       SET status = 'picked_up', picked_up_at = NOW(), picked_up_by = $1
       WHERE id = $2
       RETURNING id, name, description, added_by, status, created_at, picked_up_at, picked_up_by`,
      [modUsername, printId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Print not found.' });
    }

    res.json({ print: result.rows[0] });
  } catch (err) {
    console.error('Pickup print error:', err);
    res.status(500).json({ error: 'Failed to mark print as picked up.' });
  }
});

// Delete print (Moderators only)
app.delete('/api/prints/:id', requireModerator, async (req, res) => {
  const printId = parseInt(req.params.id, 10);
  if (isNaN(printId)) {
    return res.status(400).json({ error: 'Invalid print ID.' });
  }

  try {
    const result = await pool.query('DELETE FROM prints WHERE id = $1 RETURNING id', [printId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Print not found.' });
    }
    res.json({ message: 'Print deleted.', id: printId });
  } catch (err) {
    console.error('Delete print error:', err);
    res.status(500).json({ error: 'Failed to delete print.' });
  }
});

// Fallback to frontend
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Print Pickups server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
