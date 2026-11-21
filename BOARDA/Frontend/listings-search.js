const SEARCH_PARAMS = new URLSearchParams(window.location.search);
const LOCATION_QUERY = (SEARCH_PARAMS.get('location') || '').trim().toLocaleLowerCase();
const READ_PRICE = (VALUE) => {
  if (VALUE === null || VALUE.trim() === '') return null;
  const PRICE = Number(VALUE);
  return Number.isFinite(PRICE) ? PRICE : null;
};
const MIN_PRICE = READ_PRICE(SEARCH_PARAMS.get('min_price'));
const MAX_PRICE = READ_PRICE(SEARCH_PARAMS.get('max_price'));
const HAS_PRICE_FILTER = MIN_PRICE !== null || MAX_PRICE !== null;
const LISTING_FIGURES = [...document.querySelectorAll('.listings-page > figure')];
const RESULTS_COUNT = document.querySelector('#listing-results-count');
let VISIBLE_COUNT = 0;

LISTING_FIGURES.forEach((FIGURE) => {
  const CAPTION = FIGURE.querySelector('figcaption')?.textContent || '';
  const SEARCHABLE_LOCATION = `${FIGURE.dataset.location || ''} ${CAPTION}`.toLocaleLowerCase();
  const LISTING_PRICE = READ_PRICE(FIGURE.dataset.price ?? null);
  const LOCATION_MATCHES = !LOCATION_QUERY || SEARCHABLE_LOCATION.includes(LOCATION_QUERY);
  const MIN_MATCHES = MIN_PRICE === null || (LISTING_PRICE !== null && LISTING_PRICE >= MIN_PRICE);
  const MAX_MATCHES = MAX_PRICE === null || (LISTING_PRICE !== null && LISTING_PRICE <= MAX_PRICE);
  const IS_VISIBLE = LOCATION_MATCHES && MIN_MATCHES && MAX_MATCHES;
  const LISTING_NODES = [FIGURE];
  let NEXT_NODE = FIGURE.nextElementSibling;

  while (NEXT_NODE && !NEXT_NODE.matches('figure')) {
    LISTING_NODES.push(NEXT_NODE);
    NEXT_NODE = NEXT_NODE.nextElementSibling;
  }

  LISTING_NODES.forEach((NODE) => {
    NODE.hidden = !IS_VISIBLE;
  });

  if (IS_VISIBLE) VISIBLE_COUNT += 1;
});

if (RESULTS_COUNT) {
  if (!LOCATION_QUERY && !HAS_PRICE_FILTER) {
    RESULTS_COUNT.textContent = `Showing all ${VISIBLE_COUNT} listed homes.`;
  } else {
    RESULTS_COUNT.textContent = `${VISIBLE_COUNT} ${VISIBLE_COUNT === 1 ? 'home' : 'homes'} match your search.`;
    if (HAS_PRICE_FILTER) {
      RESULTS_COUNT.append(' Homes without a listed price are omitted from budget searches.');
    }

    const CLEAR_SEARCH = document.createElement('a');
    CLEAR_SEARCH.href = 'listings.html';
    CLEAR_SEARCH.textContent = ' Clear search';
    RESULTS_COUNT.append(CLEAR_SEARCH);
  }
}
