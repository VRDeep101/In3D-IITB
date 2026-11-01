import './store.css';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Direction-aware navigation: hidden on downward travel, returns on upward travel.
const header = $('#siteHeader');
let lastY = window.scrollY;
let ticking = false;
function updateHeader() {
  const y = window.scrollY;
  const delta = y - lastY;
  if (y < 36) header.classList.remove('is-hidden', 'is-scrolled');
  else {
    header.classList.toggle('is-scrolled', true);
    if (delta > 5 && y > 150) header.classList.add('is-hidden');
    if (delta < -4) header.classList.remove('is-hidden');
  }
  lastY = y;
  ticking = false;
}
window.addEventListener('scroll', () => { if (!ticking) { requestAnimationFrame(updateHeader); ticking = true; } }, { passive: true });

// Seamless marquees use duplicated content and CSS-only translation.
const mobileMenu = $('#mobileMenu');
mobileMenu.addEventListener('click', () => header.classList.toggle('menu-open'));
$$('.main-nav a').forEach(a => a.addEventListener('click', () => header.classList.remove('menu-open')));

const cart = [];
function renderCart() {
  const count = cart.length;
  $('#cartCount').textContent = count;
  $('#drawerCount').textContent = count;
  $('#cartTotal').textContent = `$${cart.reduce((sum, item) => sum + item.price, 0)}`;
  $('#cartItems').innerHTML = count ? cart.map((item, i) => `<div class="cart-item"><div><strong>${item.name}</strong><span>3D model · Digital download</span></div><b>$${item.price}</b><button data-remove="${i}" aria-label="Remove ${item.name}">×</button></div>`).join('') : '<p class="empty-cart">Your bag is waiting for something good.</p>';
}
function openCart() { $('#cartDrawer').classList.add('open'); $('#drawerScrim').classList.add('visible'); $('#cartDrawer').setAttribute('aria-hidden','false'); }
function closeCart() { $('#cartDrawer').classList.remove('open'); $('#drawerScrim').classList.remove('visible'); $('#cartDrawer').setAttribute('aria-hidden','true'); }
document.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) { cart.push({ name: add.dataset.add, price: Number(add.dataset.price) }); renderCart(); add.classList.add('added'); add.textContent = '✓'; setTimeout(() => { add.classList.remove('added'); add.textContent = '＋'; }, 850); }
  const remove = e.target.closest('[data-remove]');
  if (remove) { cart.splice(Number(remove.dataset.remove), 1); renderCart(); }
});
$('#cartTrigger').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
$('#drawerScrim').addEventListener('click', closeCart);
$('#checkoutButton').addEventListener('click', () => { if (!cart.length) return; alert('Your bag is ready. Connect a payment provider to enable secure checkout.'); });

// Category filtering.
$$('.filter').forEach(button => button.addEventListener('click', () => {
  $$('.filter').forEach(b => b.classList.toggle('active', b === button));
  const filter = button.dataset.filter;
  $$('.product-card').forEach(card => card.hidden = filter !== 'all' && card.dataset.category !== filter);
}));

// Search overlay filters the live catalogue.
const searchOverlay = $('#searchOverlay');
function showSearch() { searchOverlay.classList.add('open'); searchOverlay.setAttribute('aria-hidden','false'); setTimeout(() => $('#searchInput').focus(), 80); }
function hideSearch() { searchOverlay.classList.remove('open'); searchOverlay.setAttribute('aria-hidden','true'); }
$('#searchTrigger').addEventListener('click', showSearch);
$('#closeSearch').addEventListener('click', hideSearch);
searchOverlay.addEventListener('click', e => { if (e.target === searchOverlay) hideSearch(); });
$('#searchInput').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  const matches = $$('.product-card').filter(card => card.textContent.toLowerCase().includes(q));
  $('#searchResults').innerHTML = q ? (matches.length ? matches.map(card => `<button class="search-result" data-jump="${card.querySelector('h3').textContent}"><span>${card.querySelector('h3').textContent}</span><span>${card.querySelector('.product-buy strong').textContent} ↗</span></button>`).join('') : '<p class="no-results">No models found. Try another search.</p>') : '';
});
$('#searchResults').addEventListener('click', e => { const result = e.target.closest('[data-jump]'); if (!result) return; hideSearch(); $('#catalog').scrollIntoView({ behavior: 'smooth' }); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideSearch(); closeCart(); } });

$('#newsletterForm').addEventListener('submit', e => { e.preventDefault(); $('#formMessage').textContent = 'Signup preview — connect an email platform to activate.'; e.target.reset(); });

// Scroll reveal only; it never captures wheel/touch or blocks native page scrolling.
const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); } }), { threshold: 0.12 });
$$('.bento-card, .product-card, .section-heading, .catalog-heading, .collection-copy, .newsletter').forEach(el => revealObserver.observe(el));
