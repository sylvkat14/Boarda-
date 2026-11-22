# Boarda backend

The API uses Node.js, Express, and PostgreSQL. `database/schema.sql` defines the account, session, housing listing, listing photo, amenity, saved listing, and listing inquiry tables. The server applies the schema and idempotent sample listing data at startup. Passwords are stored as scrypt hashes, and session tokens are stored as hashes in PostgreSQL.

## Connect PostgreSQL with SQLTools

1. Make sure a PostgreSQL server is running and install the SQLTools extension plus its PostgreSQL/CockroachDB driver in VS Code.
2. In SQLTools, add a PostgreSQL connection using your server host, port (`5432` by default), username, and password. Connect to the default `postgres` database first if the `boarda` database does not exist.
3. Create the app database with `CREATE DATABASE boarda;`, then add a SQLTools connection to the `boarda` database.
4. Open `database/schema.sql` on that connection and run it. The Express server also applies this schema when it starts. The script uses `IF NOT EXISTS`, so it can be run again to add missing tables safely.

SQLTools is the VS Code client for inspecting and querying the database; the Express app connects through the Node `pg` driver. Keep the database password in `.env` or SQLTools' saved credentials, not in source files.

## Run the app

Copy `.env.example` to `.env`, then set `DATABASE_URL` to the same host, port, database, username, and password used by SQLTools. Keep `PGSSL=false` for local PostgreSQL; set it to `true` when your database provider requires SSL.

From this folder, run:

```sh
npm install
npm start
```

Open <http://localhost:8000/>. Express serves the frontend and API from the same origin. The server requires Node.js 18 or newer. Set `HOST=0.0.0.0` if the development server needs to be reached from another device.

## Password recovery

Password recovery emails a one-time link that expires after one hour. Reset tokens are stored as hashes, and a successful reset invalidates all active sessions for that account. The request response does not reveal whether the email address is registered. Requests are limited to five per IP address every 15 minutes.

Configure SMTP in `.env` to enable delivery:

```env
APP_BASE_URL=http://localhost:8000
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=Boarda <noreply@example.com>
```

Use the SMTP host, port, TLS mode, username, and password from your email provider. For example, Gmail requires an app password and uses `smtp.gmail.com`; set port `465` with `SMTP_SECURE=true`, or port `587` with `SMTP_SECURE=false`. Set `APP_BASE_URL` to the public Boarda origin when deploying. Recovery endpoints are `POST /api/auth/password-reset/request` and `POST /api/auth/password-reset/complete`. If SMTP is not configured, the request endpoint returns a configuration error rather than pretending an email was sent.

## Account API

- `POST /api/auth/register` accepts `name`, `email`, `password`, and `role` (`student` or `landlord`); it creates an account and session.
- `POST /api/auth/login` accepts `email` and `password`.
- `POST /api/auth/password-reset/request` accepts an email address and sends a reset link when an account exists.
- `POST /api/auth/password-reset/complete` accepts the reset `token` and new `password`; the token expires after one hour.
- `GET /api/auth/me` returns the signed-in user, or `401` when there is no valid session.
- `POST /api/auth/logout` invalidates the current session.

## Listing API

- `GET /api/listings` returns published listings. Optional filters are `location`, `min_price`, `max_price`, `room_type`, and repeated `amenity` values.
- `GET /api/listings/:id-or-slug` returns one published listing.
- `GET /api/landlord/listings` returns the signed-in landlord's listings, including drafts and archived listings.
- `GET /api/landlord/inquiries` returns student inquiries for the signed-in landlord's listings.
- `POST /api/landlord/inquiries/:inquiryId/reply` emails a reply to the student who sent an inquiry. It accepts a `message` of up to 4000 characters and requires SMTP configuration.
- `PATCH /api/landlord/inquiries/:inquiryId/status` marks an owned inquiry as `read` or `closed`. Reading a new inquiry notifies the student.
- `POST /api/listings` creates a listing for the signed-in landlord. It accepts `title`, `location`, and numeric `monthly_price`, plus optional `description`, `room_type`, `contact_name`, `contact_phone`, `contact_email`, `photos`, and `amenities`.
- `PATCH /api/listings/:id` updates only a listing owned by the signed-in landlord.
- `DELETE /api/listings/:id` archives only a listing owned by the signed-in landlord.
- `GET /api/student/dashboard` returns the signed-in student's saved homes and inquiry history.
- `POST /api/student/saved-listings` saves a published listing for the signed-in student; send `listingId`.
- `DELETE /api/student/saved-listings/:id` removes a saved listing owned by the signed-in student.
- `POST /api/student/inquiries` sends an inquiry about a published listing; send `listingId` and `message`.

## Notifications

- `GET /api/notifications` returns the signed-in user's latest notifications and unread count, for either account role.
- `POST /api/notifications/read` marks the signed-in user's unread notifications as read. When a landlord reads an inquiry, the student also receives a notification.

The existing six sample boarding houses are loaded from `database/seed-listings.sql`. Unknown price, location, and room type values remain empty instead of being guessed. The static frontend's listings page reads from the listing API and supports the same filters as the home-page search.

## Dashboards

After registration or sign-in, students are sent to `Frontend/student-dashboard.html` to manage saved homes and review inquiries. Landlords are sent to `Frontend/landlord-dashboard.html` to create, edit, publish, draft, or archive their own listings, and to review, email, mark read, or close student inquiries. Email replies use the configured SMTP account, with the landlord set as the reply-to address. Dashboard endpoints use the account session cookie and enforce the matching account role.
