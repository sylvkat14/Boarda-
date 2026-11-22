INSERT INTO listings (
  slug, title, description, location, monthly_price, currency,
  room_type, contact_name, contact_phone, contact_email, status
)
VALUES
  ('lubansa-boarding-house', 'Lubansa Boarding House', NULL, 'Kalewa Barrack Kalewa Road', 1200, 'ZMW', NULL, 'Mrs. Mwansa L.', '+260973456789', 'mwansaL@gmail.com', 'published'),
  ('katanda-boarding-house', 'Katanda Boarding House', NULL, 'Mwatayamvo Road Northrise', 900, 'ZMW', NULL, 'Mr Ng''andu M.', '+260776934509', 'Ng''anduM@gmail.com', 'published'),
  ('sunset-boarding-house', 'Sunset Boarding House', NULL, 'Breweries Road', 1500, 'ZMW', NULL, 'Mr Chibale A.', '+260765438900', 'chibaleA@gmail.com', 'published'),
  ('mandonna-boarding-house', 'Mandonna Boarding House', NULL, NULL, NULL, 'ZMW', NULL, 'Mr Sikanyika P.', '+260954894320', 'SikanyikaP@gmail.com', 'published'),
  ('chani-boarding-house', 'Chani Boarding House', NULL, NULL, NULL, 'ZMW', NULL, 'Mrs. Kaira S.', '+260764209732', 'kairaS@gmail.com', 'published'),
  ('balendo-boarding-house', 'Balendo Boarding House', NULL, NULL, NULL, 'ZMW', NULL, 'Mrs. Lishanji M.', '+260765890432', 'lishanjiM@gamil.com', 'published')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO listing_photos (listing_id, image_url, alt_text, display_order)
SELECT listings.id, photos.image_url, photos.alt_text, photos.display_order
FROM (VALUES
  ('lubansa-boarding-house', '/Images/gdflubansaBH.jpg', 'Lubansa Boarding House exterior', 0),
  ('lubansa-boarding-house', '/Images/gdfR1.jpg', 'Lubansa bedroom 1', 1),
  ('lubansa-boarding-house', '/Images/gdfR2.jpg', 'Lubansa bedroom 2', 2),
  ('lubansa-boarding-house', '/Images/gdfR3.jpg', 'Lubansa bathroom', 3),
  ('katanda-boarding-house', '/Images/katandaBH.jpeg', 'Katanda Boarding House exterior', 0),
  ('katanda-boarding-house', '/Images/katandaR1.jpg', 'Katanda bedroom 1', 1),
  ('katanda-boarding-house', '/Images/katandaR2.jpg', 'Katanda bedroom 2', 2),
  ('sunset-boarding-house', '/Images/sunsetBH.jpg', 'Sunset Boarding House exterior', 0),
  ('sunset-boarding-house', '/Images/sunsetR1.jpg', 'Sunset bedroom 1', 1),
  ('sunset-boarding-house', '/Images/sunsetR2.jpg', 'Sunset bedroom 2', 2),
  ('sunset-boarding-house', '/Images/sunsetR3.jpg', 'Sunset bathroom', 3),
  ('mandonna-boarding-house', '/Images/mandonnaBH.jpg', 'Mandonna Boarding House exterior', 0),
  ('mandonna-boarding-house', '/Images/mandonnaR1.jpg', 'Mandonna bedroom 1', 1),
  ('mandonna-boarding-house', '/Images/mandonnaR2.jpg', 'Mandonna bedroom 2', 2),
  ('mandonna-boarding-house', '/Images/mandonnaR3.jpg', 'Mandonna bedroom 3', 3),
  ('chani-boarding-house', '/Images/chaniBH.jpg', 'Chani Boarding House exterior', 0),
  ('chani-boarding-house', '/Images/chaniR1.jpg', 'Chani bedroom 1', 1),
  ('chani-boarding-house', '/Images/chaniR2.jpg', 'Chani bedroom 2', 2),
  ('chani-boarding-house', '/Images/chaniR3.jpg', 'Chani bedroom 3', 3),
  ('balendo-boarding-house', '/Images/balendoBH.jpg', 'Balendo Boarding House exterior', 0),
  ('balendo-boarding-house', '/Images/balendoR1.jpg', 'Balendo bedroom 1', 1),
  ('balendo-boarding-house', '/Images/balendoR2.jpg', 'Balendo bedroom 2', 2)
) AS photos(slug, image_url, alt_text, display_order)
JOIN listings ON listings.slug = photos.slug
ON CONFLICT (listing_id, display_order) DO NOTHING;

INSERT INTO listing_amenities (listing_id, amenity_id)
SELECT listings.id, amenities.id
FROM (VALUES
  ('lubansa-boarding-house', 'wifi'),
  ('lubansa-boarding-house', 'water'),
  ('lubansa-boarding-house', 'furnished'),
  ('lubansa-boarding-house', 'security-24-7'),
  ('katanda-boarding-house', 'wifi'),
  ('katanda-boarding-house', 'water'),
  ('katanda-boarding-house', 'furnished'),
  ('katanda-boarding-house', 'security-24-7'),
  ('sunset-boarding-house', 'wifi'),
  ('sunset-boarding-house', 'water'),
  ('sunset-boarding-house', 'security-24-7'),
  ('mandonna-boarding-house', 'water'),
  ('mandonna-boarding-house', 'security-24-7'),
  ('chani-boarding-house', 'wifi'),
  ('chani-boarding-house', 'water'),
  ('chani-boarding-house', 'furnished'),
  ('chani-boarding-house', 'security-24-7'),
  ('balendo-boarding-house', 'wifi'),
  ('balendo-boarding-house', 'water'),
  ('balendo-boarding-house', 'security-24-7')
) AS assignments(slug, amenity_slug)
JOIN listings ON listings.slug = assignments.slug
JOIN amenities ON amenities.slug = assignments.amenity_slug
ON CONFLICT DO NOTHING;
