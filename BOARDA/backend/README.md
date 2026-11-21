# Boarda backend

The API uses Node.js, Express, and PostgreSQL. `database/schema.sql` defines the account and session tables; the server applies it at startup. Passwords are stored as scrypt hashes, and session tokens are stored as hashes in PostgreSQL.

## Connect PostgreSQL with SQLTools

1. Make sure a PostgreSQL server is running and install the SQLTools extension plus its PostgreSQL/CockroachDB driver in VS Code.
2. In SQLTools, add a PostgreSQL connection using your server host, port (`5432` by default), username, and password. Connect to the default `postgres` database first if the `boarda` database does not exist.
3. Create the app database with `CREATE DATABASE boarda;`, then add a SQLTools connection to the `boarda` database.
4. Open `database/schema.sql` on that connection and run it. The Express server also applies this schema when it starts.

SQLTools is the VS Code client for inspecting and querying the database; the Express app connects through the Node `pg` driver. Keep the database password in `.env` or SQLTools' saved credentials, not in source files.

## Run the app

Copy `.env.example` to `.env`, then set `DATABASE_URL` to the same host, port, database, username, and password used by SQLTools. Keep `PGSSL=false` for local PostgreSQL; set it to `true` when your database provider requires SSL.

From this folder, run:

```sh
npm install
npm start
```

Open <http://127.0.0.1:8000/>. Express serves the frontend and API from the same origin. The server requires Node.js 18 or newer. Set `HOST=0.0.0.0` if the development server needs to be reached from another device.

## Account API

- `POST /api/auth/register` accepts `name`, `email`, `password`, and `role` (`student` or `landlord`); it creates an account and session.
- `POST /api/auth/login` accepts `email` and `password`.
- `GET /api/auth/me` returns the signed-in user, or `401` when there is no valid session.
- `POST /api/auth/logout` invalidates the current session.
