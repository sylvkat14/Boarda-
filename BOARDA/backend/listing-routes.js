const crypto = require('node:crypto');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const path = require('node:path');

const ROOM_TYPES = new Set(['single', 'shared', 'self-contained']);
const LISTING_STATUSES = new Set(['draft', 'published']);
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_PHOTOS = 10;
const MAX_AMENITIES = 30;
const PHOTO_UPLOAD_DIRECTORY = path.join(__dirname, '..', 'Images', 'uploads');
const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

fs.mkdirSync(PHOTO_UPLOAD_DIRECTORY, { recursive: true });

const PHOTO_UPLOAD = multer({
  storage: multer.diskStorage({
    destination: (_REQUEST, _FILE, CALLBACK) => CALLBACK(null, PHOTO_UPLOAD_DIRECTORY),
    filename: (_REQUEST, FILE, CALLBACK) => CALLBACK(null, `${crypto.randomUUID()}${IMAGE_EXTENSIONS.get(FILE.mimetype)}`),
  }),
  fileFilter: (_REQUEST, FILE, CALLBACK) => {
    if (!IMAGE_EXTENSIONS.has(FILE.mimetype)) return CALLBACK(new Error('Choose JPEG, PNG, or WebP image files.'));
    CALLBACK(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_PHOTOS },
});

function receiveListingPhotos(REQUEST, RESPONSE, NEXT) {
  PHOTO_UPLOAD.array('photos', MAX_PHOTOS)(REQUEST, RESPONSE, (ERROR) => {
    if (!ERROR) return NEXT();
    if (ERROR instanceof multer.MulterError) {
      const MESSAGE = ERROR.code === 'LIMIT_FILE_SIZE'
        ? 'Each photo must be 5 MB or smaller.'
        : ERROR.code === 'LIMIT_FILE_COUNT' || ERROR.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Choose up to ${MAX_PHOTOS} photos.`
          : 'Could not upload those photos.';
      return RESPONSE.status(400).json({ error: MESSAGE });
    }
    RESPONSE.status(400).json({ error: ERROR.message || 'Could not upload those photos.' });
  });
}

const LISTING_SELECT = `
  SELECT
    listing.id,
    listing.slug,
    listing.title,
    listing.description,
    listing.location,
    listing.monthly_price AS "monthlyPrice",
    listing.currency,
    listing.room_type AS "roomType",
    listing.status,
    listing.contact_phone AS "contactPhone",
    listing.contact_name AS "contactName",
    COALESCE(listing.contact_name, owner.name) AS "landlordName",
    COALESCE(listing.contact_email, owner.email) AS "contactEmail",
    listing.created_at AS "createdAt",
    listing.updated_at AS "updatedAt",
    COALESCE((
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT('url', photo.image_url, 'altText', photo.alt_text)
        ORDER BY photo.display_order
      )
      FROM listing_photos AS photo
      WHERE photo.listing_id = listing.id
    ), '[]'::json) AS photos,
    COALESCE((
      SELECT JSON_AGG(
        JSON_BUILD_OBJECT('slug', amenity.slug, 'name', amenity.name)
        ORDER BY amenity.name
      )
      FROM listing_amenities AS link
      JOIN amenities AS amenity ON amenity.id = link.amenity_id
      WHERE link.listing_id = listing.id
    ), '[]'::json) AS amenities
  FROM listings AS listing
  LEFT JOIN users AS owner ON owner.id = listing.owner_user_id
`;

function hasOwn(OBJECT, KEY) {
  return Object.prototype.hasOwnProperty.call(OBJECT, KEY);
}

function parseListingInput(BODY, PARTIAL = false) {
  if (!BODY || typeof BODY !== 'object' || Array.isArray(BODY)) {
    return { error: 'Send listing details as a JSON object.' };
  }

  const INPUT = {};
  const TEXT_FIELDS = [
    ['title', 150, !PARTIAL],
    ['location', 255, !PARTIAL],
    ['contact_name', 100, false],
    ['contact_phone', 32, false],
    ['contact_email', 254, false],
  ];

  for (const [FIELD, MAX_LENGTH, REQUIRED] of TEXT_FIELDS) {
    if (PARTIAL && !hasOwn(BODY, FIELD)) continue;
    if (!PARTIAL && !hasOwn(BODY, FIELD) && !REQUIRED) {
      INPUT[FIELD] = null;
      continue;
    }
    const VALUE = BODY[FIELD];
    if (VALUE === null && !REQUIRED && FIELD !== 'title' && FIELD !== 'location') {
      INPUT[FIELD] = null;
      continue;
    }
    if (typeof VALUE !== 'string') {
      return { error: `Enter ${FIELD.replaceAll('_', ' ')} as text.` };
    }
    const CLEAN_VALUE = VALUE.trim();
    if ((REQUIRED || CLEAN_VALUE) && !CLEAN_VALUE) {
      return { error: `Enter ${FIELD.replaceAll('_', ' ')}.` };
    }
    if (CLEAN_VALUE.length > MAX_LENGTH) {
      return { error: `${FIELD.replaceAll('_', ' ')} must be ${MAX_LENGTH} characters or fewer.` };
    }
    if (FIELD === 'contact_email' && CLEAN_VALUE && !EMAIL_PATTERN.test(CLEAN_VALUE)) {
      return { error: 'Enter a valid landlord contact email.' };
    }
    INPUT[FIELD] = CLEAN_VALUE || null;
  }

  if (!PARTIAL || hasOwn(BODY, 'description')) {
    const DESCRIPTION = BODY.description;
    if (DESCRIPTION !== undefined && DESCRIPTION !== null && typeof DESCRIPTION !== 'string') {
      return { error: 'Enter the listing description as text.' };
    }
    const CLEAN_DESCRIPTION = typeof DESCRIPTION === 'string' ? DESCRIPTION.trim() : '';
    if (CLEAN_DESCRIPTION.length > 5000) {
      return { error: 'The listing description must be 5000 characters or fewer.' };
    }
    INPUT.description = CLEAN_DESCRIPTION || null;
  }

  if (!PARTIAL || hasOwn(BODY, 'monthly_price')) {
    const PRICE = BODY.monthly_price;
    if (typeof PRICE !== 'number' || !Number.isFinite(PRICE) || PRICE <= 0 || PRICE > 100000000) {
      return { error: 'Enter a monthly price greater than zero.' };
    }
    INPUT.monthly_price = PRICE;
  }

  if (!PARTIAL || hasOwn(BODY, 'room_type')) {
    const ROOM_TYPE = BODY.room_type;
    if (ROOM_TYPE !== null && ROOM_TYPE !== undefined && !ROOM_TYPES.has(ROOM_TYPE)) {
      return { error: 'Choose single, shared, or self-contained for the room type.' };
    }
    INPUT.room_type = ROOM_TYPE || null;
  }

  if (hasOwn(BODY, 'status')) {
    if (!LISTING_STATUSES.has(BODY.status)) {
      return { error: 'Listing status must be draft or published.' };
    }
    INPUT.status = BODY.status;
  }

  if (!PARTIAL) INPUT.status = INPUT.status || 'published';

  if (!PARTIAL || hasOwn(BODY, 'photos')) {
    const PHOTOS = BODY.photos === undefined && !PARTIAL ? [] : BODY.photos;
    if (!Array.isArray(PHOTOS) || PHOTOS.length > MAX_PHOTOS) {
      return { error: `Provide up to ${MAX_PHOTOS} listing photos.` };
    }
    INPUT.photos = [];
    for (const PHOTO of PHOTOS) {
      if (!PHOTO || typeof PHOTO !== 'object' || typeof PHOTO.url !== 'string') {
        return { error: 'Each photo needs a URL and descriptive alt text.' };
      }
      const URL = PHOTO.url.trim();
      const ALT_TEXT = typeof PHOTO.altText === 'string' ? PHOTO.altText.trim() : '';
      const IS_LOCAL_PATH = URL.startsWith('/') && !URL.startsWith('//');
      let IS_HTTPS_URL = false;
      try {
        IS_HTTPS_URL = new URL(URL).protocol === 'https:';
      } catch (ERROR) {
        // Local asset paths are accepted below.
      }
      if (!URL || URL.length > 500 || (!IS_LOCAL_PATH && !IS_HTTPS_URL) || !ALT_TEXT || ALT_TEXT.length > 255) {
        return { error: 'Use a local image path or HTTPS URL and provide alt text up to 255 characters.' };
      }
      INPUT.photos.push({ url: URL, altText: ALT_TEXT });
    }
  }

  if (!PARTIAL || hasOwn(BODY, 'amenities')) {
    const AMENITIES = BODY.amenities === undefined && !PARTIAL ? [] : BODY.amenities;
    if (!Array.isArray(AMENITIES) || AMENITIES.length > MAX_AMENITIES
      || AMENITIES.some((SLUG) => typeof SLUG !== 'string' || !/^[a-z0-9-]{1,80}$/.test(SLUG))) {
      return { error: 'Choose valid amenity values.' };
    }
    INPUT.amenities = [...new Set(AMENITIES)];
  }

  return { value: INPUT };
}

function makeSlug(TITLE) {
  const BASE = TITLE.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'listing';
  return `${BASE}-${crypto.randomBytes(5).toString('hex')}`;
}

function buildFilters(QUERY) {
  const FILTERS = { location: null, minPrice: null, maxPrice: null, roomType: null, amenities: [] };
  if (QUERY.location !== undefined) {
    if (typeof QUERY.location !== 'string' || QUERY.location.trim().length > 255) {
      return { error: 'Enter a search location up to 255 characters.' };
    }
    FILTERS.location = QUERY.location.trim() || null;
  }

  for (const [KEY, FILTER_KEY] of [['min_price', 'minPrice'], ['max_price', 'maxPrice']]) {
    if (QUERY[KEY] === undefined || QUERY[KEY] === '') continue;
    const PRICE = Number(QUERY[KEY]);
    if (!Number.isFinite(PRICE) || PRICE < 0 || PRICE > 100000000) {
      return { error: `Enter a valid ${KEY.replace('_', ' ')}.` };
    }
    FILTERS[FILTER_KEY] = PRICE;
  }

  if (FILTERS.minPrice !== null && FILTERS.maxPrice !== null && FILTERS.minPrice > FILTERS.maxPrice) {
    return { error: 'Minimum price cannot be higher than maximum price.' };
  }

  if (QUERY.room_type !== undefined && QUERY.room_type !== '') {
    if (typeof QUERY.room_type !== 'string' || !ROOM_TYPES.has(QUERY.room_type)) {
      return { error: 'Choose single, shared, or self-contained for the room type.' };
    }
    FILTERS.roomType = QUERY.room_type;
  }

  const RAW_AMENITIES = QUERY.amenity ?? QUERY.amenities;
  if (RAW_AMENITIES !== undefined) {
    const AMENITIES = Array.isArray(RAW_AMENITIES) ? RAW_AMENITIES : [RAW_AMENITIES];
    if (AMENITIES.length > MAX_AMENITIES
      || AMENITIES.some((SLUG) => typeof SLUG !== 'string' || !/^[a-z0-9-]{1,80}$/.test(SLUG))) {
      return { error: 'Choose valid amenity values.' };
    }
    FILTERS.amenities = [...new Set(AMENITIES)];
  }

  return { value: FILTERS };
}

async function validateAmenities(CLIENT, AMENITIES) {
  if (!AMENITIES.length) return null;
  const RESULT = await CLIENT.query('SELECT slug FROM amenities WHERE slug = ANY($1::text[])', [AMENITIES]);
  const VALID_SLUGS = new Set(RESULT.rows.map((ROW) => ROW.slug));
  const UNKNOWN = AMENITIES.filter((SLUG) => !VALID_SLUGS.has(SLUG));
  return UNKNOWN.length ? `Unknown amenities: ${UNKNOWN.join(', ')}.` : null;
}

async function replaceListingRelations(CLIENT, LISTING_ID, INPUT) {
  if (hasOwn(INPUT, 'photos')) {
    await CLIENT.query('DELETE FROM listing_photos WHERE listing_id = $1', [LISTING_ID]);
    for (const [INDEX, PHOTO] of INPUT.photos.entries()) {
      await CLIENT.query(
        `INSERT INTO listing_photos (listing_id, image_url, alt_text, display_order)
         VALUES ($1, $2, $3, $4)`,
        [LISTING_ID, PHOTO.url, PHOTO.altText, INDEX],
      );
    }
  }

  if (hasOwn(INPUT, 'amenities')) {
    await CLIENT.query('DELETE FROM listing_amenities WHERE listing_id = $1', [LISTING_ID]);
    if (INPUT.amenities.length) {
      await CLIENT.query(
        `INSERT INTO listing_amenities (listing_id, amenity_id)
         SELECT $1, id FROM amenities WHERE slug = ANY($2::text[])
         ON CONFLICT DO NOTHING`,
        [LISTING_ID, INPUT.amenities],
      );
    }
  }
}

function createListingRouter({ pool: PG_POOL, requireAuthenticated, requireRole, sameOrigin }) {
  const ROUTER = express.Router();

  ROUTER.get('/listings', async (REQUEST, RESPONSE, NEXT) => {
    const FILTER_RESULT = buildFilters(REQUEST.query);
    if (FILTER_RESULT.error) return RESPONSE.status(400).json({ error: FILTER_RESULT.error });
    const FILTERS = FILTER_RESULT.value;
    try {
      const RESULT = await PG_POOL.query(
        `${LISTING_SELECT}
         WHERE listing.status = 'published'
           AND ($1::text IS NULL OR listing.title ILIKE '%' || $1 || '%' OR listing.location ILIKE '%' || $1 || '%')
           AND ($2::numeric IS NULL OR listing.monthly_price >= $2)
           AND ($3::numeric IS NULL OR listing.monthly_price <= $3)
           AND ($4::text IS NULL OR listing.room_type = $4)
           AND (
             CARDINALITY($5::text[]) = 0
             OR (
               SELECT COUNT(DISTINCT amenity.slug)
               FROM listing_amenities AS link
               JOIN amenities AS amenity ON amenity.id = link.amenity_id
               WHERE link.listing_id = listing.id AND amenity.slug = ANY($5::text[])
             ) = CARDINALITY($5::text[])
           )
         ORDER BY listing.created_at DESC, listing.id ASC
         LIMIT 100`,
        [FILTERS.location, FILTERS.minPrice, FILTERS.maxPrice, FILTERS.roomType, FILTERS.amenities],
      );
      RESPONSE.json({ listings: RESULT.rows, total: RESULT.rowCount });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.get('/listings/:identifier', async (REQUEST, RESPONSE, NEXT) => {
    const IDENTIFIER = REQUEST.params.identifier;
    const IS_ID = /^\d+$/.test(IDENTIFIER);
    try {
      const RESULT = await PG_POOL.query(
        `${LISTING_SELECT}
         WHERE listing.status = 'published' AND ${IS_ID ? 'listing.id = $1' : 'listing.slug = $1'}
         LIMIT 1`,
        [IDENTIFIER],
      );
      if (!RESULT.rows[0]) return RESPONSE.status(404).json({ error: 'Listing not found.' });
      RESPONSE.json({ listing: RESULT.rows[0] });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.get('/student/dashboard', requireAuthenticated, requireRole('student'), async (REQUEST, RESPONSE, NEXT) => {
    try {
      const SAVED_RESULT = await PG_POOL.query(
        `SELECT listing_id::text AS "listingId", created_at AS "savedAt"
         FROM saved_listings
         WHERE student_user_id = $1
         ORDER BY created_at DESC`,
        [REQUEST.user.id],
      );
      const SAVED_IDS = SAVED_RESULT.rows.map((ROW) => ROW.listingId);
      let SAVED_LISTINGS = [];
      if (SAVED_IDS.length) {
        const LISTINGS_RESULT = await PG_POOL.query(
          `${LISTING_SELECT}
           WHERE listing.id = ANY($1::bigint[]) AND listing.status = 'published'`,
          [SAVED_IDS],
        );
        const LISTING_BY_ID = new Map(LISTINGS_RESULT.rows.map((LISTING) => [String(LISTING.id), LISTING]));
        SAVED_LISTINGS = SAVED_IDS
          .map((ID) => LISTING_BY_ID.get(ID))
          .filter(Boolean);
      }

      const INQUIRIES_RESULT = await PG_POOL.query(
        `SELECT
           inquiry.id,
           inquiry.listing_id AS "listingId",
           listing.slug AS "listingSlug",
           listing.title AS "listingTitle",
           inquiry.message,
           inquiry.status,
           inquiry.created_at AS "createdAt"
         FROM listing_inquiries AS inquiry
         JOIN listings AS listing ON listing.id = inquiry.listing_id
         WHERE inquiry.student_user_id = $1
         ORDER BY inquiry.created_at DESC
         LIMIT 100`,
        [REQUEST.user.id],
      );
      RESPONSE.json({ savedListings: SAVED_LISTINGS, inquiries: INQUIRIES_RESULT.rows });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.post('/student/saved-listings', sameOrigin, requireAuthenticated, requireRole('student'), async (REQUEST, RESPONSE, NEXT) => {
    const LISTING_ID = String(REQUEST.body?.listingId ?? '');
    if (!/^\d+$/.test(LISTING_ID)) return RESPONSE.status(400).json({ error: 'Choose a valid listing to save.' });
    try {
      const LISTING = await PG_POOL.query(
        `SELECT id FROM listings WHERE id = $1 AND status = 'published'`,
        [LISTING_ID],
      );
      if (!LISTING.rows[0]) return RESPONSE.status(404).json({ error: 'Listing not found.' });
      await PG_POOL.query(
        `INSERT INTO saved_listings (student_user_id, listing_id)
         VALUES ($1, $2)
         ON CONFLICT (student_user_id, listing_id) DO NOTHING`,
        [REQUEST.user.id, LISTING_ID],
      );
      RESPONSE.status(201).json({ saved: true, listingId: LISTING_ID });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.delete('/student/saved-listings/:listingId', sameOrigin, requireAuthenticated, requireRole('student'), async (REQUEST, RESPONSE, NEXT) => {
    const LISTING_ID = REQUEST.params.listingId;
    if (!/^\d+$/.test(LISTING_ID)) return RESPONSE.status(400).json({ error: 'Choose a valid listing to remove.' });
    try {
      await PG_POOL.query(
        'DELETE FROM saved_listings WHERE student_user_id = $1 AND listing_id = $2',
        [REQUEST.user.id, LISTING_ID],
      );
      RESPONSE.json({ saved: false, listingId: LISTING_ID });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.post('/student/inquiries', sameOrigin, requireAuthenticated, requireRole('student'), async (REQUEST, RESPONSE, NEXT) => {
    const LISTING_ID = String(REQUEST.body?.listingId ?? '');
    const MESSAGE = typeof REQUEST.body?.message === 'string' ? REQUEST.body.message.trim() : '';
    if (!/^\d+$/.test(LISTING_ID)) return RESPONSE.status(400).json({ error: 'Choose a valid listing.' });
    if (!MESSAGE || MESSAGE.length > 2000) {
      return RESPONSE.status(400).json({ error: 'Enter a message up to 2000 characters.' });
    }

    let CLIENT;
    let TRANSACTION_STARTED = false;
    try {
      CLIENT = await PG_POOL.connect();
      await CLIENT.query('BEGIN');
      TRANSACTION_STARTED = true;
      const LISTING_RESULT = await CLIENT.query(
        `SELECT id, title, owner_user_id AS "ownerUserId"
         FROM listings
         WHERE id = $1 AND status = 'published'
         FOR SHARE`,
        [LISTING_ID],
      );
      const LISTING = LISTING_RESULT.rows[0];
      if (!LISTING) {
        await CLIENT.query('ROLLBACK');
        TRANSACTION_STARTED = false;
        return RESPONSE.status(404).json({ error: 'Listing not found.' });
      }

      const RESULT = await CLIENT.query(
        `INSERT INTO listing_inquiries (listing_id, student_user_id, message)
         VALUES ($1, $2, $3)
         RETURNING id, listing_id AS "listingId", message, status, created_at AS "createdAt"`,
        [LISTING.id, REQUEST.user.id, MESSAGE],
      );
      const INQUIRY = RESULT.rows[0];
      await CLIENT.query(
        `INSERT INTO notifications (
           user_id, type, title, message, target_url, source_type, source_id
         ) VALUES ($1, 'inquiry_sent', 'Inquiry sent', $2, '/Frontend/student-dashboard.html', 'listing_inquiry_student', $3)`,
        [REQUEST.user.id, `Your inquiry about ${LISTING.title} was sent to the landlord.`, INQUIRY.id],
      );
      if (LISTING.ownerUserId) {
        await CLIENT.query(
          `INSERT INTO notifications (
             user_id, type, title, message, target_url, source_type, source_id
         ) VALUES ($1, 'student_inquiry', 'New student inquiry', $2, '/Frontend/landlord-dashboard.html#landlord-inquiries', 'listing_inquiry_landlord', $3)`,
          [LISTING.ownerUserId, `${REQUEST.user.name} sent an inquiry about ${LISTING.title}.`, INQUIRY.id],
        );
      }
      await CLIENT.query('COMMIT');
      TRANSACTION_STARTED = false;
      RESPONSE.status(201).json({ inquiry: RESULT.rows[0] });
    } catch (ERROR) {
      if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
      NEXT(ERROR);
    } finally {
      CLIENT?.release();
    }
  });

  ROUTER.get('/landlord/listings', requireAuthenticated, requireRole('landlord'), async (REQUEST, RESPONSE, NEXT) => {
    try {
      const RESULT = await PG_POOL.query(
        `${LISTING_SELECT}
         WHERE listing.owner_user_id = $1
         ORDER BY listing.updated_at DESC, listing.id DESC`,
        [REQUEST.user.id],
      );
      RESPONSE.json({ listings: RESULT.rows, total: RESULT.rowCount });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.get('/landlord/inquiries', requireAuthenticated, requireRole('landlord'), async (REQUEST, RESPONSE, NEXT) => {
    try {
      const RESULT = await PG_POOL.query(
        `SELECT
           inquiry.id,
           inquiry.listing_id AS "listingId",
           listing.slug AS "listingSlug",
           listing.title AS "listingTitle",
           student.name AS "studentName",
           student.email AS "studentEmail",
           inquiry.message,
           inquiry.status,
           inquiry.created_at AS "createdAt"
         FROM listing_inquiries AS inquiry
         JOIN listings AS listing ON listing.id = inquiry.listing_id
         JOIN users AS student ON student.id = inquiry.student_user_id
         WHERE listing.owner_user_id = $1
         ORDER BY inquiry.created_at DESC, inquiry.id DESC
         LIMIT 200`,
        [REQUEST.user.id],
      );
      RESPONSE.json({ inquiries: RESULT.rows, total: RESULT.rowCount });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.patch('/landlord/inquiries/:inquiryId/status', sameOrigin, requireAuthenticated, requireRole('landlord'), async (REQUEST, RESPONSE, NEXT) => {
    const INQUIRY_ID = REQUEST.params.inquiryId;
    const STATUS = REQUEST.body?.status;
    if (!/^\d+$/.test(INQUIRY_ID)) return RESPONSE.status(400).json({ error: 'Choose a valid inquiry.' });
    if (!['read', 'closed'].includes(STATUS)) {
      return RESPONSE.status(400).json({ error: 'Choose read or closed as the inquiry status.' });
    }

    let CLIENT;
    let TRANSACTION_STARTED = false;
    try {
      CLIENT = await PG_POOL.connect();
      await CLIENT.query('BEGIN');
      TRANSACTION_STARTED = true;

      const EXISTING_RESULT = await CLIENT.query(
        `SELECT inquiry.id,
                inquiry.student_user_id AS "studentUserId",
                inquiry.status,
                listing.title AS "listingTitle"
         FROM listing_inquiries AS inquiry
         JOIN listings AS listing ON listing.id = inquiry.listing_id
         WHERE inquiry.id = $1 AND listing.owner_user_id = $2
         FOR UPDATE OF inquiry`,
        [INQUIRY_ID, REQUEST.user.id],
      );
      const EXISTING = EXISTING_RESULT.rows[0];
      if (!EXISTING) {
        await CLIENT.query('ROLLBACK');
        TRANSACTION_STARTED = false;
        return RESPONSE.status(404).json({ error: 'Inquiry not found.' });
      }

      if (STATUS === 'read' && !['new', 'read'].includes(EXISTING.status)) {
        await CLIENT.query('ROLLBACK');
        TRANSACTION_STARTED = false;
        return RESPONSE.status(409).json({ error: 'This inquiry can no longer be marked as read.' });
      }

      if (EXISTING.status !== 'closed' && EXISTING.status !== STATUS) {
        await CLIENT.query(
          'UPDATE listing_inquiries SET status = $3 WHERE id = $1 AND student_user_id = $2',
          [INQUIRY_ID, EXISTING.studentUserId, STATUS],
        );
      }
      await CLIENT.query(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, NOW())
         WHERE user_id = $1 AND source_type = 'listing_inquiry_landlord' AND source_id = $2`,
        [REQUEST.user.id, INQUIRY_ID],
      );

      if (EXISTING.status === 'new' && STATUS === 'read') {
        await CLIENT.query(
          `INSERT INTO notifications (
             user_id, type, title, message, target_url, source_type, source_id
           ) VALUES (
             $1, 'inquiry_viewed', 'Your inquiry was viewed',
             $2, '/Frontend/student-dashboard.html', 'listing_inquiry_viewed', $3
           )
           ON CONFLICT (user_id, source_type, source_id) DO NOTHING`,
          [EXISTING.studentUserId, `A landlord viewed your inquiry about ${EXISTING.listingTitle}.`, INQUIRY_ID],
        );
      }

      await CLIENT.query('COMMIT');
      TRANSACTION_STARTED = false;
      RESPONSE.json({ inquiry: { id: INQUIRY_ID, status: EXISTING.status === 'closed' ? 'closed' : STATUS } });
    } catch (ERROR) {
      if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
      NEXT(ERROR);
    } finally {
      CLIENT?.release();
    }
  });

  ROUTER.get('/notifications', requireAuthenticated, async (REQUEST, RESPONSE, NEXT) => {
    try {
      const [COUNT_RESULT, NOTIFICATIONS_RESULT] = await Promise.all([
        PG_POOL.query(
          `SELECT COUNT(*)::integer AS total,
                  COUNT(*) FILTER (WHERE notification.read_at IS NULL)::integer AS unread
           FROM notifications AS notification
           WHERE notification.user_id = $1`,
          [REQUEST.user.id],
        ),
        PG_POOL.query(
          `SELECT
             notification.id,
             notification.type,
             notification.title,
             notification.message,
             notification.target_url AS "targetUrl",
             notification.read_at AS "readAt",
             notification.created_at AS "createdAt"
           FROM notifications AS notification
           WHERE notification.user_id = $1
           ORDER BY notification.created_at DESC, notification.id DESC
           LIMIT 20`,
          [REQUEST.user.id],
        ),
      ]);
      RESPONSE.json({
        unreadCount: COUNT_RESULT.rows[0]?.unread || 0,
        total: COUNT_RESULT.rows[0]?.total || 0,
        notifications: NOTIFICATIONS_RESULT.rows,
      });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  ROUTER.post('/notifications/read', sameOrigin, requireAuthenticated, async (REQUEST, RESPONSE, NEXT) => {
    let CLIENT;
    let TRANSACTION_STARTED = false;
    try {
      CLIENT = await PG_POOL.connect();
      await CLIENT.query('BEGIN');
      TRANSACTION_STARTED = true;
      const RESULT = await CLIENT.query(
        `UPDATE notifications
         SET read_at = NOW()
         WHERE user_id = $1 AND read_at IS NULL
         RETURNING source_type, source_id`,
        [REQUEST.user.id],
      );
      if (REQUEST.user.role === 'landlord') {
        const INQUIRY_IDS = RESULT.rows
          .filter((ROW) => ROW.source_type === 'listing_inquiry_landlord' && ROW.source_id)
          .map((ROW) => ROW.source_id);
        if (INQUIRY_IDS.length) {
          const UPDATED_INQUIRIES = await CLIENT.query(
            `UPDATE listing_inquiries AS inquiry
             SET status = 'read'
             FROM listings AS listing
             WHERE inquiry.listing_id = listing.id
               AND inquiry.id = ANY($2::bigint[])
               AND listing.owner_user_id = $1
               AND inquiry.status = 'new'
             RETURNING inquiry.id`,
            [REQUEST.user.id, INQUIRY_IDS],
          );
          if (UPDATED_INQUIRIES.rowCount) {
            await CLIENT.query(
              `INSERT INTO notifications (
                 user_id, type, title, message, target_url, source_type, source_id
               )
               SELECT
                 inquiry.student_user_id,
                 'inquiry_viewed',
                 'Your inquiry was viewed',
                 'A landlord viewed your inquiry about ' || listing.title || '.',
                 '/Frontend/student-dashboard.html',
                 'listing_inquiry_viewed',
                 inquiry.id
               FROM listing_inquiries AS inquiry
               JOIN listings AS listing ON listing.id = inquiry.listing_id
               WHERE inquiry.id = ANY($1::bigint[])
               ON CONFLICT (user_id, source_type, source_id) DO NOTHING`,
              [UPDATED_INQUIRIES.rows.map((ROW) => ROW.id)],
            );
          }
        }
      }
      await CLIENT.query('COMMIT');
      TRANSACTION_STARTED = false;
      RESPONSE.json({ markedRead: RESULT.rowCount });
    } catch (ERROR) {
      if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
      NEXT(ERROR);
    } finally {
      CLIENT?.release();
    }
  });

  ROUTER.post('/listings/photos', sameOrigin, requireAuthenticated, requireRole('landlord'), receiveListingPhotos, (REQUEST, RESPONSE) => {
    const PHOTOS = (REQUEST.files || []).map((FILE) => {
      const NAME = path.basename(FILE.originalname, path.extname(FILE.originalname))
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 255);
      return {
        url: `/Images/uploads/${FILE.filename}`,
        altText: NAME || 'Property photo',
      };
    });
    RESPONSE.status(201).json({ photos: PHOTOS });
  });

  ROUTER.post('/listings', sameOrigin, requireAuthenticated, requireRole('landlord'), async (REQUEST, RESPONSE, NEXT) => {
    const INPUT_RESULT = parseListingInput(REQUEST.body);
    if (INPUT_RESULT.error) return RESPONSE.status(400).json({ error: INPUT_RESULT.error });
    const INPUT = INPUT_RESULT.value;
    if (!hasOwn(REQUEST.body, 'contact_name')) INPUT.contact_name = REQUEST.user.name;
    if (!hasOwn(REQUEST.body, 'contact_email')) INPUT.contact_email = REQUEST.user.email;

    let CLIENT;
    let TRANSACTION_STARTED = false;
    try {
      CLIENT = await PG_POOL.connect();
      const AMENITY_ERROR = await validateAmenities(CLIENT, INPUT.amenities);
      if (AMENITY_ERROR) return RESPONSE.status(400).json({ error: AMENITY_ERROR });
      await CLIENT.query('BEGIN');
      TRANSACTION_STARTED = true;
      const RESULT = await CLIENT.query(
        `INSERT INTO listings (
           slug, owner_user_id, title, description, location, monthly_price, currency,
           room_type, contact_name, contact_phone, contact_email, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'ZMW', $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          makeSlug(INPUT.title), REQUEST.user.id, INPUT.title, INPUT.description,
          INPUT.location, INPUT.monthly_price, INPUT.room_type, INPUT.contact_name,
          INPUT.contact_phone || null, INPUT.contact_email, INPUT.status,
        ],
      );
      const LISTING_ID = RESULT.rows[0].id;
      await replaceListingRelations(CLIENT, LISTING_ID, INPUT);
      await CLIENT.query('COMMIT');
      TRANSACTION_STARTED = false;
      const LISTING = await PG_POOL.query(
        `${LISTING_SELECT} WHERE listing.id = $1 LIMIT 1`,
        [LISTING_ID],
      );
      RESPONSE.status(201).json({ listing: LISTING.rows[0] });
    } catch (ERROR) {
      if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
      NEXT(ERROR);
    } finally {
      CLIENT?.release();
    }
  });

  ROUTER.patch('/listings/:identifier', sameOrigin, requireAuthenticated, requireRole('landlord'), async (REQUEST, RESPONSE, NEXT) => {
    const IDENTIFIER = REQUEST.params.identifier;
    if (!/^\d+$/.test(IDENTIFIER)) return RESPONSE.status(400).json({ error: 'Use a numeric listing ID to update a listing.' });
    const INPUT_RESULT = parseListingInput(REQUEST.body, true);
    if (INPUT_RESULT.error) return RESPONSE.status(400).json({ error: INPUT_RESULT.error });
    const INPUT = INPUT_RESULT.value;
    const COLUMN_MAP = {
      title: 'title',
      description: 'description',
      location: 'location',
      monthly_price: 'monthly_price',
      room_type: 'room_type',
      contact_name: 'contact_name',
      contact_phone: 'contact_phone',
      contact_email: 'contact_email',
      status: 'status',
    };
    const UPDATES = Object.keys(COLUMN_MAP).filter((FIELD) => hasOwn(INPUT, FIELD));
    const HAS_RELATION_UPDATES = hasOwn(INPUT, 'photos') || hasOwn(INPUT, 'amenities');
    if (!UPDATES.length && !HAS_RELATION_UPDATES) {
      return RESPONSE.status(400).json({ error: 'Provide at least one listing field to update.' });
    }

    let CLIENT;
    let TRANSACTION_STARTED = false;
    try {
      CLIENT = await PG_POOL.connect();
      if (hasOwn(INPUT, 'amenities')) {
        const AMENITY_ERROR = await validateAmenities(CLIENT, INPUT.amenities);
        if (AMENITY_ERROR) return RESPONSE.status(400).json({ error: AMENITY_ERROR });
      }
      await CLIENT.query('BEGIN');
      TRANSACTION_STARTED = true;
      const VALUES = [];
      const SET_CLAUSES = UPDATES.map((FIELD) => {
        VALUES.push(INPUT[FIELD]);
        return `${COLUMN_MAP[FIELD]} = $${VALUES.length}`;
      });
      SET_CLAUSES.push('updated_at = NOW()');
      VALUES.push(IDENTIFIER, REQUEST.user.id);
      const RESULT = await CLIENT.query(
        `UPDATE listings SET ${SET_CLAUSES.join(', ')}
         WHERE id = $${VALUES.length - 1} AND owner_user_id = $${VALUES.length}
         RETURNING id`,
        VALUES,
      );
      if (!RESULT.rows[0]) {
        await CLIENT.query('ROLLBACK');
        TRANSACTION_STARTED = false;
        return RESPONSE.status(404).json({ error: 'Listing not found.' });
      }
      await replaceListingRelations(CLIENT, IDENTIFIER, INPUT);
      await CLIENT.query('COMMIT');
      TRANSACTION_STARTED = false;
      const LISTING = await PG_POOL.query(
        `${LISTING_SELECT} WHERE listing.id = $1 LIMIT 1`,
        [IDENTIFIER],
      );
      RESPONSE.json({ listing: LISTING.rows[0] });
    } catch (ERROR) {
      if (CLIENT && TRANSACTION_STARTED) await CLIENT.query('ROLLBACK').catch(() => {});
      NEXT(ERROR);
    } finally {
      CLIENT?.release();
    }
  });

  ROUTER.delete('/listings/:identifier', sameOrigin, requireAuthenticated, requireRole('landlord'), async (REQUEST, RESPONSE, NEXT) => {
    const IDENTIFIER = REQUEST.params.identifier;
    if (!/^\d+$/.test(IDENTIFIER)) return RESPONSE.status(400).json({ error: 'Use a numeric listing ID to archive a listing.' });
    try {
      const RESULT = await PG_POOL.query(
        `UPDATE listings
         SET status = 'archived', updated_at = NOW()
         WHERE id = $1 AND owner_user_id = $2
         RETURNING id, slug, status`,
        [IDENTIFIER, REQUEST.user.id],
      );
      if (!RESULT.rows[0]) return RESPONSE.status(404).json({ error: 'Listing not found.' });
      RESPONSE.json({ listing: RESULT.rows[0] });
    } catch (ERROR) {
      NEXT(ERROR);
    }
  });

  return ROUTER;
}

module.exports = createListingRouter;
