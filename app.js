// ── CONFIGURATION & STATE ──
const ACCESS_KEY = 'YOUR_UNSPLASH_ACCESS_KEY'; // Replace with real key
const API_URL = 'https://api.unsplash.com';
const TOPICS = ['Editorial', 'Nature', 'Architecture', 'Travel', 'Fashion', 'Wallpapers', 'Animals', 'Film'];

let state = {
  currentQuery: '',
  currentTopic: 'Editorial',
  page: 1,
  loading: false,
  exhausted: false,
  photos: [], // Keeps tracked ordered list of current visible items for Lightbox index match
  activePhotoId: null
};

// ── DOM ELEMENTS ──
const gallery = document.getElementById('gallery');
const skeletonContainer = document.getElementById('skeleton-container');
const statusMessage = document.getElementById('status-message');
const searchInput = document.getElementById('search-input');
const collectionsNav = document.getElementById('collections-nav');
const sentinel = document.getElementById('scroll-sentinel');
const lightbox = document.getElementById('lightbox');

// ── INITIALIZATION ──
function init() {
  renderSidebar();
  setupEventListeners();
  syncStateFromURL();
}

// ── API FETCHING ──
async function fetchPhotos() {
  let url = `${API_URL}/photos?page=${state.page}&per_page=15`;
  
  if (state.currentQuery) {
    url = `${API_URL}/search/photos?page=${state.page}&per_page=15&query=${encodeURIComponent(state.currentQuery)}`;
  } else if (state.currentTopic && state.currentTopic !== 'Editorial') {
    url = `${API_URL}/topics/${state.currentTopic.toLowerCase()}/photos?page=${state.page}&per_page=15`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Client-ID ${ACCESS_KEY}` }
  });

  if (response.status === 403) throw new Error('RATE_LIMIT');
  if (!response.ok) throw new Error('SERVER_ERROR');

  const data = await response.json();
  return state.currentQuery ? data.results : data;
}

async function loadNextPage(clearGallery = false) {
  if (state.loading || (state.exhausted && !clearGallery)) return;
  
  state.loading = true;
  toggleSkeletons(true);
  if (clearGallery) {
    gallery.innerHTML = '';
    state.photos = [];
    state.page = 1;
    state.exhausted = false;
    hideStatus();
  }

  try {
    const newPhotos = await fetchPhotos();
    toggleSkeletons(false);

    if (newPhotos.length === 0) {
      state.exhausted = true;
      if (state.page === 1) showEmptyState();
      return;
    }

    state.photos = [...state.photos, ...newPhotos];
    appendPhotos(newPhotos);
    state.page++;
  } catch (error) {
    toggleSkeletons(false);
    handleError(error);
  } finally {
    state.loading = false;
  }
}

// ── DOM RENDERING ──
function appendPhotos(photos) {
  photos.forEach(photo => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.dataset.id = photo.id;
    
    // Set aspect-ratio box background color safely 
    const paddingBottom = (photo.height / photo.width) * 100;
    
    card.innerHTML = `
      <div class="photo-wrapper" style="padding-bottom: ${paddingBottom}%; background-color: ${photo.color || '#eee'}">
        <img 
          src="${photo.urls.thumb}" 
          data-src="${photo.urls.regular}" 
          srcset="${photo.urls.small} 400w, ${photo.urls.regular} 1080w"
          sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
          alt="${photo.alt_description || 'Unsplash Photo'}" 
          class="loading"
          loading="lazy"
          decoding="async"
        >
      </div>
    `;

    // Handle high-res loaded resolution swapping
    const img = card.querySelector('img');
    img.addEventListener('load', () => img.classList.remove('loading'));

    card.addEventListener('click', () => {
      updateURL({ photo: photo.id });
      openLightbox(photo.id);
    });

    gallery.appendChild(card);
  });
}

function renderSidebar() {
  collectionsNav.innerHTML = TOPICS.map(topic => 
    `<button class="chip ${topic === state.currentTopic ? 'active' : ''}" data-topic="${topic}">${topic}</button>`
  ).join('');
}

function toggleSkeletons(show) {
  if (show && state.page === 1) {
    skeletonContainer.innerHTML = Array.from({ length: 10 }, () => {
      const height = Math.floor(Math.random() * (400 - 200) + 200);
      return `<div class="skeleton" style="height: ${height}px"></div>`;
    }).join('');
    skeletonContainer.classList.remove('hidden');
  } else if (!show) {
    skeletonContainer.classList.add('hidden');
  }
}

// ── LIGHTBOX LOGIC ──
function openLightbox(id) {
  const photo = state.photos.find(p => p.id === id);
  if (!photo) return; // Fallback handling if direct routing outside pool occurs

  state.activePhotoId = id;
  
  document.getElementById('lightbox-img').src = photo.urls.regular;
  document.getElementById('lightbox-author-name').textContent = photo.user.name;
  document.getElementById('lightbox-author-link').href = photo.user.links.html;
  document.getElementById('lightbox-dimensions').textContent = `${photo.width} × ${photo.height}`;
  document.getElementById('lightbox-likes').textContent = `❤️ ${photo.likes}`;
  document.getElementById('lightbox-download').href = photo.links.download_location;

  lightbox.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  state.activePhotoId = null;
  lightbox.setAttribute('aria-hidden', 'true');
}

function navigateLightbox(direction) {
  if (!state.activePhotoId) return;
  const currentIndex = state.photos.findIndex(p => p.id === state.activePhotoId);
  let nextIndex = currentIndex + direction;

  if (nextIndex >= 0 && nextIndex < state.photos.length) {
    const nextPhoto = state.photos[nextIndex];
    updateURL({ photo: nextPhoto.id });
    openLightbox(nextPhoto.id);
  }
}

// ── STATES MANAGEMENT (Error/Empty) ──
function showEmptyState() {
  statusMessage.innerHTML = `<p>No photos found for "${state.currentQuery}". Try a different term!</p>`;
  statusMessage.classList.remove('hidden');
}

function handleError(error) {
  if (error.message === 'RATE_LIMIT') {
    startRateLimitCountdown();
  } else {
    statusMessage.innerHTML = `
      <p>Network Error occurred while retrieving gallery data.</p>
      <button class="btn-retry" onclick="retryFetch()">Retry Connection</button>
    `;
    statusMessage.classList.remove('hidden');
  }
}

function retryFetch() {
  hideStatus();
  loadNextPage(false);
}

function hideStatus() {
  statusMessage.classList.add('hidden');
}

function startRateLimitCountdown() {
  let secondsLeft = 60;
  statusMessage.classList.remove('hidden');
  const timer = setInterval(() => {
    statusMessage.innerHTML = `<p>Rate limit exceeded (50 requests/hr demo token). Retrying automatically in ${secondsLeft}s...</p>`;
    secondsLeft--;
    if (secondsLeft < 0) {
      clearInterval(timer);
      retryFetch();
    }
  }, 1000);
}

// ── DEBOUNCE UTILITY ──
function debounce(func, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// ── EVENT LISTENERS & ROUTING ──
function setupEventListeners() {
  // Intersection Observer
  const observer = new IntersectionObserver(async (entries) => {
    if (entries[0].isIntersecting && !state.loading && !state.exhausted) {
      loadNextPage();
    }
  }, { rootMargin: '300px' });
  observer.observe(sentinel);

  // Search Input Handler (Debounced)
  searchInput.addEventListener('input', debounce((e) => {
    state.currentQuery = e.target.value.trim();
    state.currentTopic = state.currentQuery ? '' : 'Editorial';
    renderSidebar();
    updateURL({ q: state.currentQuery, topic: null });
    loadNextPage(true);
  }, 400));

  // Sidebar Topic/Chips Click Handler
  collectionsNav.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;

    state.currentTopic = chip.dataset.topic;
    state.currentQuery = '';
    searchInput.value = '';
    
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    updateURL({ q: null, topic: state.currentTopic });
    loadNextPage(true);
  });

  // Lightbox UI Event triggers
  document.getElementById('lightbox-close').addEventListener('click', () => {
    updateURL({ photo: null });
    closeLightbox();
  });
  document.getElementById('lightbox-prev').addEventListener('click', () => navigateLightbox(-1));
  document.getElementById('lightbox-next').addEventListener('click', () => navigateLightbox(1));

  // Keyboard navigation mappings
  window.addEventListener('keydown', (e) => {
    if (state.activePhotoId) {
      if (e.key === 'Escape') { updateURL({ photo: null }); closeLightbox(); }
      if (e.key === 'ArrowLeft') navigateLightbox(-1);
      if (e.key === 'ArrowRight') navigateLightbox(1);
    }
  });

  document.getElementById('logo-btn').addEventListener('click', () => {
    state.currentQuery = '';
    state.currentTopic = 'Editorial';
    searchInput.value = '';
    renderSidebar();
    updateURL({ q: null, topic: null, photo: null });
    closeLightbox();
    loadNextPage(true);
  });
}

// URL sync state orchestration
function updateURL(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([k, v]) => v ? url.searchParams.set(k, v) : url.searchParams.delete(k));
  history.pushState({}, '', url.toString());
}

function syncStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  state.currentQuery = params.get('q') || '';
  state.currentTopic = params.get('topic') || (!state.currentQuery ? 'Editorial' : '');
  const photoId = params.get('photo');

  searchInput.value = state.currentQuery;
  renderSidebar();

  loadNextPage(true).then(() => {
    if (photoId) openLightbox(photoId);
  });
}

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(window.location.search);
  state.currentQuery = params.get('q') || '';
  state.currentTopic = params.get('topic') || (!state.currentQuery ? 'Editorial' : '');
  const photoId = params.get('photo');

  searchInput.value = state.currentQuery;
  renderSidebar();

  if (photoId) {
    openLightbox(photoId);
  } else {
    closeLightbox();
  }
});

// Run
init();
