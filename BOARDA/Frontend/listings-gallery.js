const GALLERIES = document.querySelectorAll('.listings-page > .thumbnails');

GALLERIES.forEach((GALLERY) => {
  const FIGURE = GALLERY.previousElementSibling;
  const MAIN_IMAGE = FIGURE?.querySelector('.listing-photo img');
  const BUTTONS = [...GALLERY.querySelectorAll('button')];

  if (!MAIN_IMAGE) return;

  BUTTONS.forEach((BUTTON) => {
    BUTTON.setAttribute('aria-pressed', 'false');

    BUTTON.addEventListener('click', () => {
      const THUMBNAIL = BUTTON.querySelector('img');
      if (!THUMBNAIL) return;

      MAIN_IMAGE.src = THUMBNAIL.src;
      const LISTING_NAME = FIGURE.querySelector('figcaption')?.textContent.trim();
      MAIN_IMAGE.alt = LISTING_NAME
        ? `${LISTING_NAME} — ${THUMBNAIL.alt}`
        : THUMBNAIL.alt;

      BUTTONS.forEach((ITEM) => ITEM.setAttribute('aria-pressed', 'false'));
      BUTTON.setAttribute('aria-pressed', 'true');
    });
  });
});
