const express = require('express');

const USER_ROLES = new Set(['student', 'landlord', 'admin']);
const LISTING_STATUSES = new Set(['draft', 'published', 'archived']);

module.exports = function createAdminRouter({ pool, requireAuthenticated, requireRole, sameOrigin }) {
  const router = express.Router();
  router.use(requireAuthenticated, requireRole('admin'));

  router.get('/overview', async (_request, response, next) => {
    try {
      const [users, listings, inquiries] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE role = 'student')::int AS students,
            COUNT(*) FILTER (WHERE role = 'landlord')::int AS landlords,
            COUNT(*) FILTER (WHERE role = 'admin')::int AS admins
          FROM users
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'published')::int AS published,
            COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
            COUNT(*) FILTER (WHERE status = 'archived')::int AS archived
          FROM listings
        `),
        pool.query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'new')::int AS new
          FROM listing_inquiries
        `),
      ]);
      response.json({
        users: users.rows[0],
        listings: listings.rows[0],
        inquiries: inquiries.rows[0],
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/users', async (request, response, next) => {
    try {
      const role = typeof request.query.role === 'string' ? request.query.role : '';
      const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
      const values = [];
      const filters = [];

      if (role && USER_ROLES.has(role)) {
        values.push(role);
        filters.push(`role = $${values.length}`);
      }
      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        filters.push(`(LOWER(name) LIKE $${values.length} OR LOWER(email) LIKE $${values.length})`);
      }

      const result = await pool.query(
        `SELECT id, name, email, role, created_at
         FROM users
         ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
         ORDER BY created_at DESC, id DESC
         LIMIT 500`,
        values,
      );
      response.json({ users: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id/role', sameOrigin, async (request, response, next) => {
    const userId = Number(request.params.id);
    const role = request.body?.role;
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return response.status(400).json({ error: 'Invalid user.' });
    }
    if (!USER_ROLES.has(role)) {
      return response.status(400).json({ error: 'Choose student, landlord, or admin.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        'SELECT id, role FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!current.rows[0]) {
        await client.query('ROLLBACK');
        return response.status(404).json({ error: 'User not found.' });
      }
      if (current.rows[0].role === 'admin' && role !== 'admin') {
        const adminCount = await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'");
        if (adminCount.rows[0].count <= 1) {
          await client.query('ROLLBACK');
          return response.status(409).json({ error: 'At least one administrator account is required.' });
        }
      }
      if (request.user.id === String(userId) || request.user.id === userId) {
        if (role !== 'admin') {
          await client.query('ROLLBACK');
          return response.status(409).json({ error: 'You cannot remove your own administrator role.' });
        }
      }
      const result = await client.query(
        `UPDATE users SET role = $1 WHERE id = $2
         RETURNING id, name, email, role, created_at`,
        [role, userId],
      );
      await client.query('COMMIT');
      response.json({ user: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  router.get('/listings', async (request, response, next) => {
    try {
      const status = typeof request.query.status === 'string' ? request.query.status : '';
      const search = typeof request.query.search === 'string' ? request.query.search.trim() : '';
      const values = [];
      const filters = [];
      if (status && LISTING_STATUSES.has(status)) {
        values.push(status);
        filters.push(`listing.status = $${values.length}`);
      }
      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        filters.push(`(LOWER(listing.title) LIKE $${values.length} OR LOWER(COALESCE(listing.location, '')) LIKE $${values.length})`);
      }
      const result = await pool.query(
        `SELECT listing.id, listing.title, listing.location, listing.monthly_price,
                listing.currency, listing.status, listing.created_at, listing.updated_at,
                owner.id AS owner_id, owner.name AS owner_name, owner.email AS owner_email
         FROM listings AS listing
         LEFT JOIN users AS owner ON owner.id = listing.owner_user_id
         ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
         ORDER BY listing.updated_at DESC, listing.id DESC
         LIMIT 500`,
        values,
      );
      response.json({ listings: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/listings/:id/status', sameOrigin, async (request, response, next) => {
    const listingId = Number(request.params.id);
    const status = request.body?.status;
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
      return response.status(400).json({ error: 'Invalid listing.' });
    }
    if (!LISTING_STATUSES.has(status)) {
      return response.status(400).json({ error: 'Choose draft, published, or archived.' });
    }
    try {
      const result = await pool.query(
        `UPDATE listings SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, title, location, monthly_price, currency, status, updated_at`,
        [status, listingId],
      );
      if (!result.rows[0]) return response.status(404).json({ error: 'Listing not found.' });
      response.json({ listing: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  router.get('/inquiries', async (_request, response, next) => {
    try {
      const result = await pool.query(`
        SELECT inquiry.id, inquiry.message, inquiry.status, inquiry.created_at,
               listing.id AS listing_id, listing.title AS listing_title,
               student.id AS student_id, student.name AS student_name, student.email AS student_email,
               owner.id AS owner_id, owner.name AS owner_name, owner.email AS owner_email
        FROM listing_inquiries AS inquiry
        JOIN listings AS listing ON listing.id = inquiry.listing_id
        JOIN users AS student ON student.id = inquiry.student_user_id
        LEFT JOIN users AS owner ON owner.id = listing.owner_user_id
        ORDER BY inquiry.created_at DESC, inquiry.id DESC
        LIMIT 500
      `);
      response.json({ inquiries: result.rows });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
