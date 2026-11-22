const IMAGE_VIEWER = document.querySelector('#listing-image-viewer');
const VIEWER_IMAGE = document.querySelector('#listing-viewer-image');
const VIEWER_CAPTION = document.querySelector('#listing-viewer-caption');
const VIEWER_COUNT = document.querySelector('#listing-viewer-count');
const VIEWER_CLOSE = IMAGE_VIEWER.querySelector('.image-viewer-close');
const VIEWER_PREVIOUS = IMAGE_VIEWER.querySelector('.image-viewer-previous');
const VIEWER_NEXT = IMAGE_VIEWER.querySelector('.image-viewer-next');
let ACTIVE_PHOTOS = [];
let ACTIVE_INDEX = 0;
let ACTIVE_LISTING_TITLE = '';

function listingGalleryPhotos(ARTICLE) {
  const FRAME = ARTICLE.querySelector('.listing-photo');
  if (!FRAME) return [];

  const PHOTOS = [{
    url: FRAME.dataset.galleryUrl || FRAME.querySelector('img')?.src,
    altText: FRAME.dataset.galleryAlt || FRAME.querySelector('img')?.alt || 'Property photo',
  }];
  ARTICLE.querySelectorAll('.listing-thumbnails button').forEach((BUTTON) => {
    PHOTOS.push({ url: BUTTON.dataset.photoUrl, altText: BUTTON.dataset.photoAlt });
  });
  return PHOTOS.filter((PHOTO) => PHOTO.url);
}

function showActivePhoto() {
  const PHOTO = ACTIVE_PHOTOS[ACTIVE_INDEX];
  if (!PHOTO) return;
  VIEWER_IMAGE.src = PHOTO.url;
  VIEWER_IMAGE.alt = PHOTO.altText || `${ACTIVE_LISTING_TITLE} photo ${ACTIVE_INDEX + 1}`;
  VIEWER_CAPTION.textContent = `${ACTIVE_LISTING_TITLE} · ${ACTIVE_INDEX + 1} of ${ACTIVE_PHOTOS.length}`;
  VIEWER_COUNT.textContent = `${ACTIVE_INDEX + 1} / ${ACTIVE_PHOTOS.length}`;
  VIEWER_PREVIOUS.disabled = ACTIVE_PHOTOS.length < 2;
  VIEWER_NEXT.disabled = ACTIVE_PHOTOS.length < 2;
}

function openImageViewer(ARTICLE, INDEX) {
  ACTIVE_PHOTOS = listingGalleryPhotos(ARTICLE);
  if (!ACTIVE_PHOTOS.length) return;
  ACTIVE_INDEX = Math.max(0, Math.min(INDEX, ACTIVE_PHOTOS.length - 1));
  ACTIVE_LISTING_TITLE = ARTICLE.querySelector('.listing-photo + figcaption')?.textContent.trim() || 'Property photos';
  showActivePhoto();
  if (!IMAGE_VIEWER.open) IMAGE_VIEWER.showModal();
}

function moveViewer(direction) {
  if (ACTIVE_PHOTOS.length < 2) return;
  ACTIVE_INDEX = (ACTIVE_INDEX + direction + ACTIVE_PHOTOS.length) % ACTIVE_PHOTOS.length;
  showActivePhoto();
}

document.addEventListener('click', (EVENT) => {
  const ARTICLE = EVENT.target.closest('.listing-entry');
  if (!ARTICLE) return;

  const THUMBNAIL_BUTTON = EVENT.target.closest('.listing-thumbnails button');
  if (THUMBNAIL_BUTTON) {
    const FRAME = ARTICLE.querySelector('.listing-photo');
    const MAIN_PHOTO = FRAME?.querySelector('img');
    if (!FRAME || !MAIN_PHOTO) return;

    MAIN_PHOTO.src = THUMBNAIL_BUTTON.dataset.photoUrl;
    MAIN_PHOTO.alt = THUMBNAIL_BUTTON.dataset.photoAlt;
    FRAME.dataset.photoIndex = THUMBNAIL_BUTTON.dataset.photoIndex;
    ARTICLE.querySelectorAll('.listing-thumbnails button').forEach((BUTTON) => {
      BUTTON.setAttribute('aria-pressed', String(BUTTON === THUMBNAIL_BUTTON));
    });
    openImageViewer(ARTICLE, Number(THUMBNAIL_BUTTON.dataset.photoIndex));
    return;
  }

  const PHOTO_FRAME = EVENT.target.closest('.listing-photo[role="button"]');
  if (PHOTO_FRAME) openImageViewer(ARTICLE, Number(PHOTO_FRAME.dataset.photoIndex || 0));
});

document.addEventListener('keydown', (EVENT) => {
  const PHOTO_FRAME = EVENT.target.closest('.listing-photo[role="button"]');
  if (!PHOTO_FRAME || !['Enter', ' '].includes(EVENT.key)) return;
  EVENT.preventDefault();
  const ARTICLE = PHOTO_FRAME.closest('.listing-entry');
  if (ARTICLE) openImageViewer(ARTICLE, Number(PHOTO_FRAME.dataset.photoIndex || 0));
});

VIEWER_CLOSE.addEventListener('click', () => IMAGE_VIEWER.close());
VIEWER_PREVIOUS.addEventListener('click', () => moveViewer(-1));
VIEWER_NEXT.addEventListener('click', () => moveViewer(1));
IMAGE_VIEWER.addEventListener('click', (EVENT) => {
  if (EVENT.target === IMAGE_VIEWER) IMAGE_VIEWER.close();
});
IMAGE_VIEWER.addEventListener('keydown', (EVENT) => {
  if (EVENT.key === 'ArrowLeft') moveViewer(-1);
  if (EVENT.key === 'ArrowRight') moveViewer(1);
});
