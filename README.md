# Print Pickups

A full-stack 3D-printing pickup management system built with Node.js, Express, PostgreSQL, and a dark-themed responsive frontend.

## Project Structure
- `server.js` — Express backend, authentication, session cookies, and role-protected API routes.
- `db.js` — PostgreSQL connection pool and automatic database table creation (`users`, `prints`, `session`).
- `public/index.html` — Main HTML layout (Login/Register, Add Print, Waiting/Picked Up tabs, Moderator Dashboard).
- `public/style.css` — Modern dark-theme styling for desktop and mobile.
- `public/app.js` — Frontend logic communicating with the backend API.
- `.env.example` — Template for required environment variables.

## Environment Variables Required
- `DATABASE_URL` — PostgreSQL connection string.
- `SESSION_SECRET` — Long random string to encrypt session cookies.
- `MODERATOR_CODE` — Secret code users enter to permanently unlock Moderator permissions.
- `NODE_ENV` — Set to `production` when hosted online.
