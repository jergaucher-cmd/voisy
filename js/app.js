// ============================================================
// PALIER — Application principale
// Remplace SUPABASE_URL et SUPABASE_ANON_KEY par tes valeurs
// ============================================================

const SUPABASE_URL = 'https://sygbpqxzxhppxqjlomnk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_heQHa5Cr8xxEePXv_cflCw_uAWGSFDA';

const QUARTIERS = [
  'Centre-ville', 'La Doutre', 'Belle-Beille', 'Monplaisir',
  'Saint-Serge', 'Quatre-Chemins', 'Justices',
  'Hauts-de-Saint-Aubin', 'Roseraie', 'Lac de Maine'
];

const CATEGORIES = [
  { id: 'Entraide',    label: 'Entraide',    icon: '🤝' },
  { id: 'Animaux',     label: 'Animaux',     icon: '🐾' },
  { id: 'Sport',       label: 'Sport',       icon: '🏃' },
  { id: 'Sorties',     label: 'Sorties',     icon: '☕' },
  { id: 'Objets',      label: 'Objets',      icon: '📦', desc: 'Prêt ou don d\'objets' },
  { id: 'Événements',  label: 'Événements',  icon: '🎭', note: 'Uniquement dans votre quartier' },
];

const PRESENCE_OPTIONS = [
  { value: 'habite',    label: "J'habite ici",      icon: '🏠' },
  { value: 'travaille', label: 'Je travaille ici',   icon: '💼' },
  { value: 'passage',   label: 'Je suis de passage', icon: '🌍' },
];

const ENERGY_OPTIONS = [
  { value: 'calme',         label: 'Plutôt calme et discret',                    icon: '🌿' },
  { value: 'sociable',      label: 'Sociable et ouvert',                          icon: '☀️' },
  { value: 'tres_sociable', label: "Très sociable, j'adore rencontrer du monde", icon: '⚡' },
];

function presenceLabel(value) {
  const opt = PRESENCE_OPTIONS.find(o => o.value === value);
  return opt ? `${opt.icon} ${opt.label}` : '';
}

function presenceBtnsHTML(groupId, selected = '') {
  return `<div class="presence-btn-group" id="${groupId}" role="group">
    ${PRESENCE_OPTIONS.map(o => `
      <button type="button" class="presence-btn${selected === o.value ? ' active' : ''}" data-value="${o.value}">
        <span class="presence-btn-icon">${o.icon}</span>${o.label}
      </button>`).join('')}
  </div>`;
}

function energyBtnsHTML(groupId, selected = '') {
  return `<div class="energy-btn-group" id="${groupId}" role="group">
    ${ENERGY_OPTIONS.map(o => `
      <button type="button" class="energy-btn${selected === o.value ? ' active' : ''}" data-value="${o.value}">
        <span class="energy-btn-icon">${o.icon}</span>${o.label}
      </button>`).join('')}
  </div>`;
}

function energyLabel(value) {
  const opt = ENERGY_OPTIONS.find(o => o.value === value);
  return opt ? `${opt.icon} ${opt.label}` : '';
}

// ===== INIT SUPABASE =====
const { createClient } = supabase;
let db;
try {
  db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch(e) {
  console.error('Supabase non configuré:', e);
}

// ===== STATE =====
const state = {
  user: null,
  profile: null,
  view: null,
  feedFilter: 'all',
  feedSearch: '',
  realtimeSubscription: null,
  pendingConvParams: null,
  channelsSubscribed: false,
  authBgTimer: null,
  currentConvOtherId: null,
  expiryNotifChecked: false,
};

// ===== CACHE (stale-while-revalidate) =====
const cache = { feed: {}, messages: null, messagesAt: 0 };

// Wrap any Supabase promise with a hard timeout
async function withTimeout(promise, ms = 3000) {
  let id;
  const timer = new Promise((_, rej) => { id = setTimeout(() => rej(new Error('timeout')), ms); });
  try { const r = await Promise.race([promise, timer]); clearTimeout(id); return r; }
  catch (e) { clearTimeout(id); throw e; }
}

// Skeleton placeholders shown while data loads
function feedSkeletonHTML() {
  const card = `
    <div class="skeleton-card">
      <div class="skeleton-line" style="width:28%"></div>
      <div class="skeleton-line" style="width:82%;margin-top:12px"></div>
      <div class="skeleton-line" style="width:62%"></div>
      <div class="skeleton-line" style="width:38%;margin-top:12px"></div>
    </div>`;
  return card.repeat(4);
}

function msgSkeletonHTML() {
  const row = `
    <div class="skeleton-card" style="display:flex;gap:12px;align-items:center">
      <div class="skeleton-line" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;margin:0"></div>
      <div style="flex:1">
        <div class="skeleton-line" style="width:40%"></div>
        <div class="skeleton-line" style="width:70%;margin-top:8px"></div>
      </div>
    </div>`;
  return row.repeat(5);
}

// Error state with retry button
function loadErrorHTML() {
  return `
    <div class="load-error">
      <div class="load-error-icon">😕</div>
      <div class="load-error-text">Chargement impossible pour le moment.</div>
      <button class="btn btn-outline load-error-btn" onclick="window.location.reload()">Réessayer</button>
    </div>`;
}

// Start watchdog: if selector still matches after ms, show error
function startWatchdog(containerSelector, ms) {
  return setTimeout(() => {
    const el = document.querySelector(containerSelector);
    if (el?.querySelector('.skeleton-card') || el?.querySelector('.spinner'))
      el.innerHTML = loadErrorHTML();
  }, ms);
}

// ===== DOM =====
const $app    = document.getElementById('app');
const $nav    = document.getElementById('bottom-nav');
const $loading= document.getElementById('loading-screen');
const $badge  = document.getElementById('msg-badge');
const $modal  = document.getElementById('modal-overlay');

// ===== ROUTER =====
const VIEW_ORDER = { feed: 0, 'new-post': 1, messages: 2, profile: 3 };

function navigate(view, params = {}) {
  const prevView = state.view;
  state.view = view;
  state.viewParams = params;

  const authViews = ['login', 'register', 'verify', 'onboarding'];
  const isAuth = authViews.includes(view);

  if (isAuth) {
    $nav.classList.add('hidden');
  } else {
    $nav.classList.remove('hidden');
    updateNavActive(view);
  }

  window.scrollTo(0, 0);

  switch(view) {
    case 'login':        renderLogin(); break;
    case 'register':     renderRegister(); break;
    case 'verify':       renderVerify(params.email); break;
    case 'onboarding':   renderOnboarding(); break;
    case 'feed':            renderFeed(); break;
    case 'new-post':        renderNewPost(); break;
    case 'messages':        renderMessages(); break;
    case 'conversation':    renderConversation(params.convId); break;
    case 'profile':         renderProfile(params.userId || null); break;
    case 'edit-profile':    renderEditProfile(); break;
    case 'landing':         renderLanding(); break;
    case 'forgot-password': renderForgotPassword(); break;
    case 'welcome':         renderWelcome(); break;
    case 'notifications':   renderNotifications(); break;
    default:                renderFeed();
  }

  // Glissement horizontal entre onglets principaux
  const prevOrder = VIEW_ORDER[prevView] ?? -1;
  const nextOrder = VIEW_ORDER[view]    ?? -1;
  if (prevOrder >= 0 && nextOrder >= 0 && prevOrder !== nextOrder) {
    requestAnimationFrame(() => {
      const el = $app.firstElementChild;
      if (!el) return;
      const cls = nextOrder > prevOrder ? 'view-slide-right' : 'view-slide-left';
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 280);
    });
  }
}

function updateNavActive(view) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.view === view) btn.classList.add('active');
    if (view === 'conversation' && btn.dataset.view === 'messages') btn.classList.add('active');
    if (view === 'edit-profile' && btn.dataset.view === 'profile') btn.classList.add('active');
  });
}

// ===== HELPERS =====
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatRelTime(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)  return 'À l\'instant';
  if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff/3600)}h`;
  if (diff < 172800) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
}

function getInitial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function getCatIcon(catId) {
  const c = CATEGORIES.find(c => c.id === catId);
  return c ? c.icon : '✨';
}

function silhouetteAvatarHTML(cls = 'post-avatar') {
  return `<div class="${cls} silhouette-avatar">
    <svg viewBox="0 0 24 24" fill="currentColor" width="55%" height="55%">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
  </div>`;
}

function privacyVisible(profile, field) {
  return profile[field] !== false;
}

function starsDisplay(avg) {
  const rounded = Math.round(avg);
  return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
}

function max18Date() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
}

function nowDateTimeLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function formatEventDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Aujourd'hui · ${time}`;
  if (d.toDateString() === new Date(now.getTime() + 86400000).toDateString()) return `Demain · ${time}`;
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ` · ${time}`;
}

function computeAge(birthdateStr) {
  if (!birthdateStr) return null;
  const birth = new Date(birthdateStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showLoading(el, show) {
  if (!el) return;
  if (show) { el.classList.add('btn-loading'); el.disabled = true; }
  else { el.classList.remove('btn-loading'); el.disabled = false; }
}

function pwdFieldHTML(id, placeholder, autocomplete) {
  return `<div class="pwd-wrap">
    <input type="password" class="form-input" id="${id}" placeholder="${placeholder}" autocomplete="${autocomplete}">
    <button type="button" class="pwd-toggle-btn" data-target="${id}" aria-label="Afficher le mot de passe" tabindex="-1">
      <svg class="eye-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
      <svg class="eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
      </svg>
    </button>
  </div>`;
}

function attachPwdToggles() {
  document.querySelectorAll('.pwd-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('.eye-on').style.display  = show ? 'none' : '';
      btn.querySelector('.eye-off').style.display = show ? ''     : 'none';
      btn.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    });
  });
}

function openModal(html) {
  $modal.innerHTML = `<div class="modal-sheet"><span class="modal-handle"></span>${html}</div>`;
  $modal.classList.remove('hidden');
  $modal.querySelector('.modal-sheet').addEventListener('click', e => e.stopPropagation());
}

function closeModal() { $modal.classList.add('hidden'); $modal.innerHTML = ''; }

function avatarHTML(profile, size = 'small') {
  const cls = size === 'large' ? 'profile-avatar-large' : (size === 'conv' ? 'conv-avatar' : 'post-avatar');
  if (profile?.photo_url) {
    return `<div class="${cls}"><img src="${esc(profile.photo_url)}" alt="${esc(profile.prenom)}"></div>`;
  }
  return `<div class="${cls}">${esc(getInitial(profile?.prenom))}</div>`;
}

// ===== AUTH =====
function renderLogin() {
  $app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-hero">
        <button class="auth-back-btn" onclick="navigate('landing')">← Retour</button>
        <div class="auth-hero-chevron">
          <svg width="34" height="24" viewBox="0 0 80 56" fill="none">
            <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="rgba(255,255,255,0.90)"/>
            <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(255,255,255,0.50)"/>
          </svg>
        </div>
        <h1>Voisy</h1>
        <p>Mon quartier prend vie</p>
      </div>
      <div class="auth-body">
        <div class="auth-tabs">
          <button class="auth-tab active" id="tab-login">Se connecter</button>
          <button class="auth-tab" id="tab-register">S'inscrire</button>
        </div>
        <div id="auth-form">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="login-email" placeholder="votre@email.com" autocomplete="email">
          </div>
          <div class="form-group">
            <label class="form-label">Mot de passe</label>
            ${pwdFieldHTML('login-pass', '••••••••', 'current-password')}
          </div>
          <div style="text-align:right;margin:-4px 0 12px">
            <button class="link-btn" id="btn-forgot">Mot de passe oublié ?</button>
          </div>
          <div id="login-error" class="form-error"></div>
          <button class="btn btn-primary" id="btn-login" style="margin-top:8px">Se connecter</button>
        </div>
        <p style="text-align:center; margin-top:24px; font-size:13px; color:var(--text-muted)">
          En vous connectant, vous acceptez nos
          <a href="pages/cgu.html" target="_blank" class="link">CGU</a> et notre
          <a href="pages/privacy.html" target="_blank" class="link">politique de confidentialité</a>.
        </p>
      </div>
    </div>`;

  document.getElementById('tab-login').onclick = () => navigate('login');
  document.getElementById('tab-register').onclick = () => navigate('register');
  document.getElementById('btn-login').onclick = handleLogin;
  document.getElementById('btn-forgot').onclick = () => navigate('forgot-password');
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  attachPwdToggles();
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('btn-login');
  errEl.textContent = '';

  if (!email || !pass) { errEl.textContent = 'Veuillez remplir tous les champs.'; return; }
  showLoading(btn, true);

  const { data, error } = await db.auth.signInWithPassword({ email, password: pass });
  showLoading(btn, false);

  if (error) {
    errEl.textContent = 'Email ou mot de passe incorrect.';
    return;
  }
  state.user = data.user;
  await loadCurrentProfile();
  navigate('feed');
}

function renderLanding() {
  $nav.classList.add('hidden');
  $app.innerHTML = `
    <div class="landing-screen">

      <!-- Cartes factices flottantes (arrière-plan flouté) -->
      <div class="landing-bg" aria-hidden="true">

        <div class="landing-card-wrap" style="top:4%;left:-8%;transform:rotate(-8deg)">
          <div class="landing-card" style="animation-duration:9s;animation-delay:0s">
            <div class="landing-card-badge">🤝 Entraide</div>
            <div class="landing-card-text">Quelqu'un pour garder mon chat ce weekend ?</div>
            <div class="landing-card-meta">📍 Belle-Beille</div>
          </div>
        </div>

        <div class="landing-card-wrap" style="top:20%;right:-9%;transform:rotate(7deg)">
          <div class="landing-card" style="animation-duration:12s;animation-delay:-4s">
            <div class="landing-card-badge">🎭 Événements</div>
            <div class="landing-card-text">Jazz live vendredi soir au Café Béatrice</div>
            <div class="landing-card-meta">📍 Centre-ville</div>
          </div>
        </div>

        <div class="landing-card-wrap" style="top:40%;left:-4%;transform:rotate(-5deg)">
          <div class="landing-card" style="animation-duration:14s;animation-delay:-7s">
            <div class="landing-card-badge">🏃 Sport</div>
            <div class="landing-card-text">Running 7h du mat, qui vient ?</div>
            <div class="landing-card-meta">📍 Lac de Maine</div>
          </div>
        </div>

        <div class="landing-card-wrap" style="top:58%;right:-7%;transform:rotate(6deg)">
          <div class="landing-card" style="animation-duration:10s;animation-delay:-2s">
            <div class="landing-card-badge">📦 Objets</div>
            <div class="landing-card-text">Je donne une étagère IKEA, parfait état</div>
            <div class="landing-card-meta">📍 La Doutre</div>
          </div>
        </div>

        <div class="landing-card-wrap" style="top:76%;left:1%;transform:rotate(-6deg)">
          <div class="landing-card" style="animation-duration:11s;animation-delay:-9s">
            <div class="landing-card-badge">☕ Sorties</div>
            <div class="landing-card-text">Café et balade dimanche matin ?</div>
            <div class="landing-card-meta">📍 Monplaisir</div>
          </div>
        </div>

      </div>

      <!-- Overlay gradient -->
      <div class="landing-overlay" aria-hidden="true"></div>

      <!-- Contenu principal -->
      <div class="landing-content">
        <div class="landing-logo-wrap">
          <svg class="landing-voisy-svg" viewBox="0 0 360 92" xmlns="http://www.w3.org/2000/svg"
               fill="none" stroke="#FFFFFF" stroke-linecap="round" stroke-linejoin="round">
            <line x1="0"   y1="10" x2="36"  y2="82" stroke-width="2.5"/>
            <line x1="72"  y1="10" x2="36"  y2="82" stroke-width="2.5"/>
            <ellipse cx="118" cy="46" rx="34" ry="36" stroke-width="2.5"/>
            <line x1="170" y1="10" x2="170" y2="82" stroke-width="2.5"/>
            <line x1="162" y1="10" x2="178" y2="10" stroke-width="0.7" stroke="rgba(255,255,255,0.5)"/>
            <line x1="162" y1="82" x2="178" y2="82" stroke-width="0.7" stroke="rgba(255,255,255,0.5)"/>
            <path d="M254,10 C192,10 254,82 192,82" stroke-width="2.5"/>
            <line x1="265" y1="10" x2="312" y2="48" stroke-width="2.5"/>
            <line x1="360" y1="10" x2="312" y2="48" stroke-width="2.5"/>
            <line x1="312" y1="48" x2="312" y2="82" stroke-width="2.5"/>
          </svg>
          <div class="landing-slogan">Mon quartier prend vie</div>
        </div>

        <div class="landing-cta-wrap">
          <button class="landing-cta-btn" id="btn-landing-join">Rejoindre mon quartier</button>
          <button class="landing-login-link" id="btn-landing-login">Déjà inscrit ? Se connecter</button>
        </div>
      </div>

    </div>`;

  document.getElementById('btn-landing-join').onclick  = () => navigate('register');
  document.getElementById('btn-landing-login').onclick = () => navigate('login');
}

function renderForgotPassword() {
  $nav.classList.add('hidden');
  $app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-hero">
        <button class="auth-back-btn" onclick="navigate('login')">← Retour</button>
        <div class="auth-hero-chevron">
          <svg width="34" height="24" viewBox="0 0 80 56" fill="none">
            <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="rgba(255,255,255,0.90)"/>
            <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(255,255,255,0.50)"/>
          </svg>
        </div>
        <h1>Voisy</h1>
        <p>Réinitialisation du mot de passe</p>
      </div>
      <div class="auth-body">

        <div id="forgot-sent" style="display:none;text-align:center;padding:28px 0 16px">
          <div style="font-size:52px;margin-bottom:20px">📬</div>
          <div style="font-size:18px;font-weight:800;margin-bottom:10px;color:var(--text)">Vérifiez votre boîte mail</div>
          <p style="font-size:14px;color:var(--text-muted);line-height:1.7">
            Un lien de réinitialisation a été envoyé à votre adresse email.<br>
            Pensez à vérifier vos spams si vous ne le voyez pas.
          </p>
          <button class="btn btn-outline" style="margin-top:24px" onclick="navigate('login')">← Retour à la connexion</button>
        </div>

        <div id="forgot-form">
          <p style="font-size:14px;color:var(--text-muted);line-height:1.6;margin-bottom:20px">
            Entrez l'adresse email associée à votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.
          </p>
          <div class="form-group">
            <label class="form-label">Adresse email</label>
            <input type="email" class="form-input" id="forgot-email" placeholder="votre@email.com" autocomplete="email">
          </div>
          <div id="forgot-error" class="form-error"></div>
          <button class="btn btn-primary" id="btn-forgot-send" style="margin-top:8px">Envoyer le lien de réinitialisation</button>
          <button class="btn btn-ghost" style="margin-top:8px" onclick="navigate('login')">← Retour à la connexion</button>
        </div>

      </div>
    </div>`;

  document.getElementById('btn-forgot-send').onclick = async () => {
    const email = document.getElementById('forgot-email').value.trim();
    const errEl = document.getElementById('forgot-error');
    const btn   = document.getElementById('btn-forgot-send');
    errEl.textContent = '';
    if (!email) {
      errEl.textContent = 'Veuillez entrer votre adresse email.';
      return;
    }
    showLoading(btn, true);
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://www.voisy.eu'
    });
    showLoading(btn, false);
    if (error) {
      errEl.textContent = 'Quelque chose s\'est mal passé. Vérifiez votre adresse email et réessayez.';
      return;
    }
    document.getElementById('forgot-form').style.display = 'none';
    document.getElementById('forgot-sent').style.display = '';
  };

  document.getElementById('forgot-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-forgot-send').click();
  });
}

function renderRegister() {
  $app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-hero">
        <button class="auth-back-btn" onclick="navigate('landing')">← Retour</button>
        <div class="auth-hero-chevron">
          <svg width="34" height="24" viewBox="0 0 80 56" fill="none">
            <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="rgba(255,255,255,0.90)"/>
            <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(255,255,255,0.50)"/>
          </svg>
        </div>
        <h1>Voisy</h1>
        <p>Mon quartier prend vie</p>
      </div>
      <div class="auth-body">
        <div class="auth-tabs">
          <button class="auth-tab" id="tab-login">Se connecter</button>
          <button class="auth-tab active" id="tab-register">S'inscrire</button>
        </div>
        <div class="form-group">
          <label class="form-label">Prénom</label>
          <input type="text" class="form-input" id="reg-prenom" placeholder="Votre prénom" autocomplete="given-name">
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" class="form-input" id="reg-email" placeholder="votre@email.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">Mot de passe</label>
          ${pwdFieldHTML('reg-pass', 'Minimum 8 caractères', 'new-password')}
        </div>
        <div class="form-group">
          <label class="form-label">Confirmer le mot de passe</label>
          ${pwdFieldHTML('reg-confirm', 'Répétez votre mot de passe', 'new-password')}
          <div class="form-error hidden" id="reg-confirm-error">Les mots de passe ne correspondent pas.</div>
        </div>
        <div class="form-group">
          <label class="form-label">Votre quartier</label>
          <select class="form-select" id="reg-quartier">
            <option value="">Choisir un quartier…</option>
            ${QUARTIERS.map(q => `<option value="${esc(q)}">${esc(q)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Date de naissance <span style="color:var(--terracotta)">*</span></label>
          <input type="date" class="form-input" id="reg-birthdate" max="${max18Date()}" autocomplete="bday">
          <div class="form-hint">Voisy est réservé aux personnes de 18 ans et plus.</div>
        </div>
        <label class="ob-pledge-label" style="margin-top:4px">
          <input type="checkbox" id="reg-pledge" class="ob-pledge-checkbox">
          <span class="ob-pledge-text">
            Je m'engage à ne jamais proposer ou demander de transaction financière sur Voisy.
            <a href="pages/cgu.html" target="_blank" class="link">Voir les CGU</a>
          </span>
        </label>
        <div id="reg-error" class="form-error"></div>
        <button class="btn btn-primary" id="btn-register">Créer mon compte</button>
        <p style="text-align:center; margin-top:16px; font-size:12px; color:var(--text-muted); line-height:1.5">
          En créant un compte, vous acceptez nos <a href="pages/cgu.html" target="_blank" class="link">CGU</a>
          et notre <a href="pages/privacy.html" target="_blank" class="link">politique de confidentialité</a>.
        </p>
      </div>
    </div>`;

  document.getElementById('tab-login').onclick = () => navigate('login');
  document.getElementById('tab-register').onclick = () => navigate('register');
  document.getElementById('btn-register').onclick = handleRegister;

  const passEl    = document.getElementById('reg-pass');
  const confirmEl = document.getElementById('reg-confirm');
  const hintEl    = document.getElementById('reg-confirm-error');
  const submitBtn = document.getElementById('btn-register');

  function checkPasswordMatch() {
    const confirm = confirmEl.value;
    if (!confirm) { hintEl.classList.add('hidden'); submitBtn.disabled = false; return; }
    const mismatch = passEl.value !== confirm;
    hintEl.classList.toggle('hidden', !mismatch);
    submitBtn.disabled = mismatch;
  }
  passEl.addEventListener('input', checkPasswordMatch);
  confirmEl.addEventListener('input', checkPasswordMatch);
  attachPwdToggles();
}

async function handleRegister() {
  const prenom       = document.getElementById('reg-prenom').value.trim();
  const email        = document.getElementById('reg-email').value.trim();
  const pass         = document.getElementById('reg-pass').value;
  const confirm      = document.getElementById('reg-confirm').value;
  const quartier     = document.getElementById('reg-quartier').value;
  const birthdateVal = document.getElementById('reg-birthdate').value;
  const errEl        = document.getElementById('reg-error');
  const btn          = document.getElementById('btn-register');
  errEl.textContent = '';

  const pledge = document.getElementById('reg-pledge')?.checked;

  if (!prenom || !email || !pass || !confirm || !quartier) { errEl.textContent = 'Veuillez remplir tous les champs.'; return; }
  if (pass !== confirm) { errEl.textContent = 'Les mots de passe ne correspondent pas.'; return; }
  if (!birthdateVal) { errEl.textContent = 'Veuillez indiquer votre date de naissance.'; return; }
  if (!pledge) { errEl.textContent = 'Merci d\'accepter cet engagement pour rejoindre Voisy.'; return; }

  const age = computeAge(birthdateVal);
  if (age === null || age < 18) {
    errEl.textContent = 'Voisy est une communauté réservée aux adultes de 18 ans et plus. À bientôt !';
    return;
  }

  if (pass.length < 8) { errEl.textContent = 'Le mot de passe doit faire au moins 8 caractères.'; return; }
  showLoading(btn, true);

  const { data, error } = await db.auth.signUp({
    email, password: pass,
    options: {
      data: { prenom, quartier },
      emailRedirectTo: window.location.origin
    }
  });
  showLoading(btn, false);

  if (error) { errEl.textContent = error.message; return; }

  if (data.user) {
    await db.from('profiles').upsert({
      id: data.user.id,
      email,
      prenom,
      quartier,
      birthdate: birthdateVal,
      age,
      trust_score: 0
    });
  }

  navigate('verify', { email });
}

function renderVerify(email) {
  $app.innerHTML = `
    <div class="verify-screen">
      <div class="verify-icon">📬</div>
      <div class="verify-title">Vérifiez votre email</div>
      <div class="verify-text">
        On a envoyé un lien de confirmation à<br>
        <span class="verify-email">${esc(email)}</span>.<br><br>
        Cliquez sur le lien pour activer votre compte, puis revenez ici pour vous connecter.
      </div>
      <button class="btn btn-outline" style="max-width:280px; margin-top:12px" onclick="navigate('login')">
        Aller à la connexion
      </button>
      <p style="margin-top:32px; font-size:13px; color:var(--text-muted)">
        Pas reçu l'email ? Vérifiez vos spams.
      </p>
    </div>`;
}

// ===== ONBOARDING =====
function renderOnboarding() {
  const p = state.profile; // peut être un profil partiel issu de l'inscription
  $app.innerHTML = `
    <div class="auth-screen">
      <div class="auth-hero">
        <div class="auth-hero-chevron">
          <svg width="34" height="24" viewBox="0 0 80 56" fill="none">
            <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="rgba(255,255,255,0.90)"/>
            <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(255,255,255,0.50)"/>
          </svg>
        </div>
        <h1>Voisy</h1>
        <p>Bienvenue ! Dites-nous qui vous êtes.</p>
      </div>

      <div class="auth-body">
        <div class="form-group">
          <label class="form-label">Prénom <span style="color:var(--terracotta)">*</span></label>
          <input type="text" class="form-input" id="ob-prenom"
            placeholder="Comment vous appelle-t-on ?" maxlength="30" autocomplete="given-name"
            value="${esc(p?.prenom || '')}">
        </div>

        <div class="form-group">
          <label class="form-label">Votre quartier <span style="color:var(--terracotta)">*</span></label>
          <select class="form-select" id="ob-quartier">
            <option value="">Choisir un quartier…</option>
            ${QUARTIERS.map(q => `<option value="${esc(q)}" ${p?.quartier === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Je suis dans ce quartier… <span style="color:var(--terracotta)">*</span></label>
          ${presenceBtnsHTML('ob-presence-group')}
          <input type="hidden" id="ob-presence" value="">
        </div>

        <div class="form-group">
          <label class="form-label">Date de naissance <span style="color:var(--terracotta)">*</span></label>
          <input type="date" class="form-input" id="ob-birthdate" max="${max18Date()}" autocomplete="bday"
            value="${esc(p?.birthdate || '')}">
          <div class="form-hint">Voisy est réservé aux personnes de 18 ans et plus.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Sexe <span style="color:var(--text-light);font-weight:500;font-size:11px;text-transform:none">(optionnel)</span></label>
          <select class="form-select" id="ob-gender">
            <option value="Ne pas préciser">Ne pas préciser</option>
            <option value="Homme">Homme</option>
            <option value="Femme">Femme</option>
            <option value="Non-binaire">Non-binaire</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Bio courte <span style="color:var(--text-light);font-weight:500;font-size:11px;text-transform:none">(optionnelle)</span></label>
          <textarea class="form-input" id="ob-bio"
            placeholder="Quelques mots sur vous…" maxlength="150" style="min-height:80px"></textarea>
        </div>

        <div class="zero-money-charter">
          <div class="zero-money-title">💚 Charte Voisy — Zéro argent</div>
          <p class="zero-money-text">Aucune transaction financière n'est autorisée sur Voisy — ni paiement, ni troc, ni pourboire. Voisy est 100% gratuit.</p>
        </div>

        <label class="ob-pledge-label">
          <input type="checkbox" id="ob-pledge" class="ob-pledge-checkbox">
          <span class="ob-pledge-text">
            Je m'engage à ne jamais proposer ou demander de transaction financière sur Voisy.
            <a href="pages/cgu.html" target="_blank" class="link">Voir les CGU</a>
          </span>
        </label>

        <div id="ob-error" class="form-error" style="margin-bottom:12px"></div>
        <button class="btn btn-primary" id="btn-ob-submit">Créer mon profil</button>

        <p style="text-align:center;margin-top:16px;font-size:12px;color:var(--text-muted)">
          Votre nom de famille ne sera jamais affiché.
        </p>
      </div>
    </div>`;

  document.getElementById('btn-ob-submit').onclick = handleOnboardingSubmit;
  document.getElementById('ob-prenom').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleOnboardingSubmit();
  });
  document.getElementById('ob-presence-group').addEventListener('click', e => {
    const btn = e.target.closest('.presence-btn');
    if (!btn) return;
    document.querySelectorAll('#ob-presence-group .presence-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ob-presence').value = btn.dataset.value;
  });
}

async function handleOnboardingSubmit() {
  const prenom          = document.getElementById('ob-prenom').value.trim();
  const quartier        = document.getElementById('ob-quartier').value;
  const presence_status = document.getElementById('ob-presence').value;
  const birthdateVal    = document.getElementById('ob-birthdate').value;
  const gender          = document.getElementById('ob-gender').value;
  const bio             = document.getElementById('ob-bio').value.trim();
  const errEl           = document.getElementById('ob-error');
  const btn             = document.getElementById('btn-ob-submit');
  errEl.textContent = '';

  const pledge = document.getElementById('ob-pledge')?.checked;

  if (!prenom)          { errEl.textContent = 'Le prénom est obligatoire.'; return; }
  if (!quartier)        { errEl.textContent = 'Veuillez choisir votre quartier.'; return; }
  if (!presence_status) { errEl.textContent = 'Indiquez votre situation dans ce quartier.'; return; }
  if (!birthdateVal)    { errEl.textContent = 'La date de naissance est obligatoire.'; return; }
  if (!pledge)          { errEl.textContent = 'Merci de cocher la case d\'engagement — c\'est la base de la confiance sur Voisy 💚'; return; }

  const age = computeAge(birthdateVal);
  if (age === null || age < 18) {
    errEl.textContent = 'Voisy est une communauté réservée aux adultes de 18 ans et plus. À bientôt !';
    return;
  }

  showLoading(btn, true);
  const { error } = await db.from('profiles').upsert({
    id:             state.user.id,
    email:          state.user.email,
    prenom,
    quartier,
    presence_status,
    birthdate:      birthdateVal,
    age,
    gender:         gender || 'Ne pas préciser',
    bio:            bio || null,
    trust_score:    0,
    show_age:       true,
    show_gender:    true,
    show_bio:       true,
    show_photo:     true,
  });
  showLoading(btn, false);

  if (error) {
    errEl.textContent = 'Erreur lors de la création du profil. Réessayez.';
    console.error(error);
    return;
  }

  await loadCurrentProfile();
  navigate('welcome');
}

// ===== WELCOME =====
function renderWelcome() {
  $nav.classList.add('hidden');
  $app.innerHTML = `
    <div class="welcome-screen">
      <div class="welcome-logo">
        <svg width="52" height="36" viewBox="0 0 80 56" fill="none">
          <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="#0D2B1E"/>
          <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(13,43,30,0.35)"/>
        </svg>
        <span class="welcome-logo-text">Voisy</span>
      </div>
      <div class="welcome-title">Bienvenue dans<br>votre quartier</div>
      <div class="welcome-steps">
        <div class="welcome-step">
          <div class="welcome-step-num">1</div>
          <div class="welcome-step-body">
            <div class="welcome-step-title">Poste un besoin ou une offre</div>
            <div class="welcome-step-desc">Aide ou fais-toi aider par les gens de ton quartier.</div>
          </div>
        </div>
        <div class="welcome-step">
          <div class="welcome-step-num">2</div>
          <div class="welcome-step-body">
            <div class="welcome-step-title">Échange avec tes voisins</div>
            <div class="welcome-step-desc">Les messages restent privés, entre vous deux.</div>
          </div>
        </div>
        <div class="welcome-step">
          <div class="welcome-step-num">3</div>
          <div class="welcome-step-body">
            <div class="welcome-step-title">Retrouve-toi dans la vraie vie</div>
            <div class="welcome-step-desc">C'est l'objectif — le quartier comme terrain de jeu.</div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary welcome-cta" onclick="navigate('feed');refreshUnreadCount();setInterval(refreshUnreadCount,30000)">C'est parti !</button>
    </div>`;
}

// ===== PROFILE LOADING =====
async function loadCurrentProfile() {
  if (!state.user) return;
  try {
    const { data } = await withTimeout(db.from('profiles').select('*').eq('id', state.user.id).single());
    state.profile = data;
  } catch { /* timeout silencieux — le profil sera null, les vues gèrent ce cas */ }
}

// ===== FEED =====
const NEIGHBORHOOD_IMGS = [
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=800&q=70&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1516939884455-1445c8652f83?w=800&q=70&auto=format&fit=crop',
];

function startFeedPhotoSlideshow() {
  let current = 0;
  clearInterval(state.authBgTimer);
  state.authBgTimer = setInterval(() => {
    const all = document.querySelectorAll('.feed-photo-slide');
    if (!all.length) { clearInterval(state.authBgTimer); return; }
    all[current].classList.remove('active');
    current = (current + 1) % all.length;
    all[current].classList.add('active');
  }, 4000);
}

async function renderFeed() {
  $app.innerHTML = `
    <div>
      <div class="feed-header">
        <div class="feed-hero">
          <div class="feed-title-content">
            <svg class="feed-title-svg" viewBox="0 0 360 92" xmlns="http://www.w3.org/2000/svg"
                 fill="none" stroke="rgba(255,255,255,0.90)" stroke-linecap="round" stroke-linejoin="round">
              <!-- V -->
              <line x1="0"  y1="10" x2="36" y2="82" stroke-width="2.5"/>
              <line x1="72" y1="10" x2="36" y2="82" stroke-width="2.5"/>
              <!-- O -->
              <ellipse cx="118" cy="46" rx="34" ry="36" stroke-width="2.5"/>
              <!-- I -->
              <line x1="170" y1="10" x2="170" y2="82" stroke-width="2.5"/>
              <line x1="162" y1="10" x2="178" y2="10" stroke-width="0.7"/>
              <line x1="162" y1="82" x2="178" y2="82" stroke-width="0.7"/>
              <!-- S -->
              <path d="M254,10 C192,10 254,82 192,82" stroke-width="2.5"/>
              <!-- Y -->
              <line x1="265" y1="10" x2="312" y2="48" stroke-width="2.5"/>
              <line x1="360" y1="10" x2="312" y2="48" stroke-width="2.5"/>
              <line x1="312" y1="48" x2="312" y2="82" stroke-width="2.5"/>
            </svg>
          </div>
          <div class="feed-photo-banner" aria-hidden="true">
            ${NEIGHBORHOOD_IMGS.map((src, i) => `<img class="feed-photo-slide${i === 0 ? ' active' : ''}" src="${src}" alt="" loading="lazy">`).join('')}
            <div class="feed-photo-overlay"></div>
            <div class="feed-tagline">Ici, c'est l'entraide gratuite.</div>
          </div>
        </div>
        <div class="feed-brand-sub">MON QUARTIER PREND VIE</div>
        <div class="feed-meta">
          <span>📍 ${esc(state.profile?.quartier || 'Angers')}</span>
          <button class="notif-bell-btn" id="btn-notif-bell" aria-label="Notifications">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span id="notif-badge" class="notif-badge hidden">0</span>
          </button>
        </div>
        <div class="feed-search-wrap">
          <div class="feed-search-inner">
            <svg class="feed-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input class="feed-search-input" id="feed-search" type="search" placeholder="Rechercher dans le quartier…" autocomplete="off" value="${esc(state.feedSearch)}">
            <button class="feed-search-clear ${state.feedSearch ? '' : 'hidden'}" id="feed-search-clear" aria-label="Effacer la recherche">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="filter-bar-wrap">
          <button class="filter-arrow hidden" id="filter-arrow-left" aria-label="Défiler à gauche">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="feed-filter-bar" id="filter-bar">
            <button class="filter-chip ${state.feedFilter === 'all' ? 'active' : ''}" data-filter="all">Tout Angers</button>
            <button class="filter-chip ${state.feedFilter === 'mon-quartier' ? 'active' : ''}" data-filter="mon-quartier">Mon quartier</button>
            ${CATEGORIES.map(c => `<button class="filter-chip ${state.feedFilter === c.id ? 'active' : ''}" data-filter="${esc(c.id)}">${c.icon} ${esc(c.label)}</button>`).join('')}
          </div>
          <button class="filter-arrow" id="filter-arrow-right" aria-label="Défiler à droite">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      <div class="feed-list" id="feed-list">
        <div class="spinner"></div>
      </div>
    </div>`;

  startFeedPhotoSlideshow();
  document.getElementById('filter-bar').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    state.feedFilter = chip.dataset.filter;
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadFeed();
  });

  // Flèches de navigation pour la barre de filtres
  const filterBar   = document.getElementById('filter-bar');
  const arrowLeft   = document.getElementById('filter-arrow-left');
  const arrowRight  = document.getElementById('filter-arrow-right');

  function updateFilterArrows() {
    if (!filterBar) return;
    const atStart = filterBar.scrollLeft <= 1;
    const atEnd   = filterBar.scrollLeft >= filterBar.scrollWidth - filterBar.clientWidth - 1;
    arrowLeft.classList.toggle('hidden', atStart);
    arrowRight.classList.toggle('hidden', atEnd);
  }

  filterBar.addEventListener('scroll', updateFilterArrows, { passive: true });
  arrowLeft.addEventListener('click',  () => filterBar.scrollBy({ left: -150, behavior: 'smooth' }));
  arrowRight.addEventListener('click', () => filterBar.scrollBy({ left:  150, behavior: 'smooth' }));
  updateFilterArrows();

  // Search bar
  const searchInput = document.getElementById('feed-search');
  const searchClear = document.getElementById('feed-search-clear');
  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const val = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !val);
    searchDebounce = setTimeout(() => {
      state.feedSearch = val;
      loadFeed();
    }, 300);
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.feedSearch = '';
    searchClear.classList.add('hidden');
    loadFeed();
    searchInput.focus();
  });

  // Bell
  document.getElementById('btn-notif-bell').addEventListener('click', () => navigate('notifications'));
  refreshNotifCount();

  loadFeed();
}

async function loadFeed(opts = {}) {
  const listEl = document.getElementById('feed-list');
  if (!listEl) return;

  const filter = state.feedFilter;
  const search = state.feedSearch;
  const cacheKey = `${filter}:${search}`;
  const cached = cache.feed[cacheKey];

  // Serve stale cache immediately, refresh in background
  if (cached && !opts.forceRefresh) {
    renderFeedCards(listEl, cached.posts, cached.alertUserIds);
    if (Date.now() - cached.at < 30_000) return;
    loadFeed({ forceRefresh: true }); // silent background refresh
    return;
  }

  listEl.innerHTML = feedSkeletonHTML();
  const watchdog = startWatchdog('#feed-list', 10_000);

  try {
    let query = db.from('posts')
      .select(`*, profiles(id, prenom, quartier, photo_url, show_photo, photo_verified, phone_verified, presence_status)`)
      .eq('is_resolved', false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter === 'mon-quartier' && state.profile?.quartier) {
      query = query.eq('quartier', state.profile.quartier);
    } else if (!['all','mon-quartier'].includes(filter)) {
      query = query.eq('categorie', filter);
    }
    if (search) {
      query = query.ilike('description', `%${search}%`);
    }

    const { data: posts, error } = await withTimeout(query);
    clearTimeout(watchdog);

    const el = document.getElementById('feed-list');
    if (!el) return;

    if (error || !posts?.length) {
      el.innerHTML = search ? `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Aucun résultat</div>
          <div class="empty-text">Aucun post ne correspond à votre recherche dans ce quartier.</div>
        </div>` : `
        <div class="empty-state">
          <div class="empty-icon">🌱</div>
          <div class="empty-title">Aucune publication</div>
          <div class="empty-text">Soyez le premier à poster une entraide<br>dans votre quartier !</div>
        </div>`;
      return;
    }

    const userIds = [...new Set(posts.map(p => p.user_id))];
    const alertUserIds = new Set();
    if (userIds.length) {
      try {
        const { data: userRatings } = await withTimeout(
          db.from('ratings').select('id, rated_id').in('rated_id', userIds), 3000);
        if (userRatings?.length) {
          const { data: alerts } = await withTimeout(
            db.from('admin_alerts').select('rating_id').eq('resolved', false)
              .in('rating_id', userRatings.map(r => r.id)), 3000);
          (alerts || []).forEach(a => {
            const r = userRatings.find(x => x.id === a.rating_id);
            if (r) alertUserIds.add(r.rated_id);
          });
        }
      } catch { /* alertes non-critiques */ }
    }

    cache.feed[cacheKey] = { posts, alertUserIds, at: Date.now() };
    const freshEl = document.getElementById('feed-list');
    if (freshEl) renderFeedCards(freshEl, posts, alertUserIds);

  } catch {
    clearTimeout(watchdog);
    const el = document.getElementById('feed-list');
    if (el) el.innerHTML = loadErrorHTML();
  }
}

function renderFeedCards(listEl, posts, alertUserIds) {
  listEl.innerHTML = posts.map(p => postCardHTML(p, alertUserIds)).join('');
  listEl.querySelectorAll('.post-card').forEach((card, i) => {
    card.style.setProperty('--card-delay', `${Math.min(i * 80, 640)}ms`);
    card.classList.add('card-enter');
  });
  listEl.addEventListener('click', handleFeedClick);
}

function postCardHTML(post, alertUserIds = new Set()) {
  const profile = post.profiles || {};
  const initials = getInitial(profile.prenom);
  const isOwnPost = state.user?.id === post.user_id;
  const isUnderReview = alertUserIds.has(post.user_id);
  let avatarEl;
  if (profile.photo_url && (isOwnPost || privacyVisible(profile, 'show_photo'))) {
    avatarEl = `<div class="post-avatar"><img src="${esc(profile.photo_url)}" alt="${esc(profile.prenom)}"></div>`;
  } else if (profile.photo_url && !privacyVisible(profile, 'show_photo')) {
    avatarEl = silhouetteAvatarHTML('post-avatar');
  } else {
    avatarEl = `<div class="post-avatar">${esc(initials)}</div>`;
  }

  const isEvenement = post.categorie === 'Événements';

  const typeBadge = isEvenement
    ? `<span class="post-type-badge evenement"><span class="post-category-icon">🎭</span> Événement du quartier</span>`
    : post.type === 'besoin'
      ? `<span class="post-type-badge besoin"><span class="post-category-icon">${getCatIcon(post.categorie)}</span> J'ai besoin de…</span>`
      : `<span class="post-type-badge offre"><span class="post-category-icon">${getCatIcon(post.categorie)}</span> Je propose…</span>`;

  const helpBtn = isEvenement
    ? `<button class="btn-help offre" data-action="help" data-post-id="${esc(post.id)}" data-owner-id="${esc(post.user_id)}">📅 Je participe</button>`
    : post.type === 'besoin'
      ? `<button class="btn-help" data-action="help" data-post-id="${esc(post.id)}" data-owner-id="${esc(post.user_id)}">🤝 Je peux aider</button>`
      : `<button class="btn-help offre" data-action="help" data-post-id="${esc(post.id)}" data-owner-id="${esc(post.user_id)}">✋ Je suis intéressé·e</button>`;

  const eventDateRow = (isEvenement && post.expires_at)
    ? `<div class="post-event-date">📅 ${esc(formatEventDate(post.expires_at))}</div>`
    : '';

  const expiryPill = (!isEvenement && post.expires_at)
    ? `<div class="post-expiry-pill">⏳ Expire le ${esc(formatEventDate(post.expires_at))}</div>`
    : '';

  const isOwn = state.user?.id === post.user_id;

  let renewBanner = '';
  if (isOwn && post.expires_at) {
    const msLeft = new Date(post.expires_at) - new Date();
    const daysLeft = Math.ceil(msLeft / 86400000);
    if (daysLeft <= 3 && daysLeft > 0) {
      renewBanner = `<div class="post-renew-banner">
        ⏳ Expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''} —
        <button class="post-renew-btn" data-action="renew" data-post-id="${esc(post.id)}">Renouveler</button>
      </div>`;
    }
  }

  return `
    <article class="post-card" data-post-id="${esc(post.id)}" data-categorie="${esc(post.categorie)}">
      <div class="post-card-header">
        <button data-action="profile" data-user-id="${esc(post.user_id)}" style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:12px;flex:1;min-width:0;padding:0">
          ${avatarEl}
          <div class="post-meta">
            <div class="post-author">
              ${esc(profile.prenom || 'Habitant·e')}
              ${(profile.photo_verified || profile.phone_verified) ? `<span class="v-badges-mini">
                ${profile.photo_verified ? '<span class="v-badge-mini" title="Photo vérifiée">📷</span>' : ''}
                ${profile.phone_verified ? '<span class="v-badge-mini" title="Numéro vérifié">📱</span>' : ''}
              </span>` : ''}
              ${isUnderReview ? '<span class="post-review-badge" title="Ce profil fait l\'objet d\'un examen">⚠️</span>' : ''}
            </div>
            <div class="post-location">📍 ${esc(profile.quartier || '')}${profile.presence_status ? `<span class="post-presence">${presenceLabel(profile.presence_status)}</span>` : ''}</div>
          </div>
        </button>
        <div class="post-time">${formatRelTime(post.created_at)}</div>
      </div>
      ${typeBadge}
      ${eventDateRow}
      <div class="post-description">${esc(post.description)}</div>
      ${expiryPill}
      ${renewBanner}
      <div class="post-card-footer">
        ${isOwn
          ? `<button class="btn btn-ghost btn-sm" style="flex:1" data-action="resolve" data-post-id="${esc(post.id)}">✓ Marquer résolu</button>`
          : helpBtn
        }
        <button class="btn-report" data-action="report" data-type="post" data-target-id="${esc(post.id)}" aria-label="Signaler">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
          </svg>
        </button>
      </div>
    </article>`;
}

async function handleFeedClick(e) {
  const action = e.target.closest('[data-action]')?.dataset?.action;
  if (!action) return;
  const el = e.target.closest('[data-action]');

  if (action === 'help') {
    const postId  = el.dataset.postId;
    const ownerId = el.dataset.ownerId;
    if (ownerId === state.user?.id) { showToast('C\'est votre propre publication !', 'info'); return; }
    startOrOpenConversation(postId, ownerId);
  }
  if (action === 'report') {
    showReportModal(el.dataset.type, el.dataset.targetId);
  }
  if (action === 'profile') {
    navigate('profile', { userId: el.dataset.userId });
  }
  if (action === 'resolve') {
    resolvePost(el.dataset.postId);
  }
  if (action === 'renew') {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 14);
    await db.from('posts')
      .update({ expires_at: newExpiry.toISOString() })
      .eq('id', el.dataset.postId)
      .eq('user_id', state.user.id);
    showToast('Publication renouvelée pour 14 jours !');
    loadFeed();
  }
}

async function resolvePost(postId) {
  await db.from('posts').update({ is_resolved: true }).eq('id', postId).eq('user_id', state.user.id);
  showToast('Publication marquée comme résolue 🎉');

  const { data: convs } = await db.from('conversations')
    .select(`id, p1:profiles!conversations_participant_1_fkey(id, prenom), p2:profiles!conversations_participant_2_fkey(id, prenom)`)
    .eq('post_id', postId);

  if (convs?.length) {
    const conv = convs[0];
    const other = conv.p1?.id === state.user.id ? conv.p2 : conv.p1;
    if (other?.id && other.id !== state.user.id) {
      setTimeout(() => showRatingModal(other.id, other.prenom, postId), 600);
    }
  }

  loadFeed();
}

// ===== NEW POST =====
function renderNewPost() {
  const postState = { type: null, categorie: null };

  $app.innerHTML = `
    <div class="new-post-screen">
      <div class="top-bar">
        <button class="top-bar-back" onclick="navigate('feed')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Retour
        </button>
        <div style="font-size:17px;font-weight:800">Nouvelle publication</div>
        <div style="width:80px"></div>
      </div>

      <div id="type-selector-wrap">
        <div style="padding:0 20px">
          <div class="form-label" style="margin-bottom:12px">Quel type de publication ?</div>
        </div>
        <div class="post-type-selector">
          <div class="post-type-option" data-type="besoin" id="type-besoin">
            <div class="post-type-option-icon">🙋</div>
            <div class="post-type-option-label">J'ai besoin de…</div>
            <div class="post-type-option-desc">Demandez de l'aide</div>
          </div>
          <div class="post-type-option" data-type="offre" id="type-offre">
            <div class="post-type-option-icon">💚</div>
            <div class="post-type-option-label">Je propose…</div>
            <div class="post-type-option-desc">Offrez votre aide</div>
          </div>
        </div>
      </div>
      <div class="post-type-evenement hidden" id="type-evenement">
        <div class="post-type-option-evenement">
          <span class="post-type-option-icon">📢</span>
          <div>
            <div class="post-type-option-label">J'informe le quartier</div>
            <div class="post-type-option-desc">Partagez un événement local</div>
          </div>
        </div>
      </div>

      <div class="post-form">
        <div class="form-group">
          <label class="form-label">Catégorie</label>
          <div class="category-grid" id="cat-grid">
            ${CATEGORIES.map(c => `
              <div class="category-option" data-cat="${esc(c.id)}">
                <span class="category-option-icon">${c.icon}</span>
                <span class="category-option-label">${esc(c.label)}</span>
                ${c.desc  ? `<span class="category-option-desc">${esc(c.desc)}</span>` : ''}
                ${c.note  ? `<span class="category-option-note">${esc(c.note)}</span>` : ''}
              </div>`).join('')}
          </div>
        </div>

        <div class="form-group" id="expires-group">
          <label class="form-label" id="expires-label">Expiration <span id="expires-optional" style="color:var(--text-light);font-weight:500;font-size:11px;text-transform:none">(optionnel)</span></label>
          <input type="datetime-local" class="form-input" id="post-expires" min="${nowDateTimeLocal()}">
          <div class="form-hint" id="expires-hint">Sans date choisie, la publication expire automatiquement après 14 jours.</div>
        </div>

        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea class="form-input" id="post-desc" placeholder="Décrivez votre besoin ou votre offre en quelques mots…" maxlength="300"></textarea>
          <div class="char-count" id="char-count">0 / 300</div>
        </div>

        <div id="post-error" class="form-error" style="margin-bottom:12px"></div>
        <button class="btn btn-secondary" id="btn-publish" disabled>Publier dans mon quartier</button>
        <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-muted)">
          Visible dans <strong>${esc(state.profile?.quartier || 'votre quartier')}</strong>
        </p>
        <p style="text-align:center;margin-top:6px;font-size:11px;color:var(--text-muted);opacity:0.7;line-height:1.4">
          Voisy est une communauté gratuite — aucune transaction financière autorisée.
        </p>
      </div>
    </div>`;

  // Config labels par catégorie
  const TYPE_CONFIG = {
    'Entraide': {
      besoin: { icon: '🙋', label: 'J\'ai besoin de…',      desc: 'Demandez de l\'aide'      },
      offre:  { icon: '💚', label: 'Je propose…',            desc: 'Offrez votre aide'         },
      placeholder: 'Décris ton besoin ou ton offre en quelques mots…',
    },
    'Animaux': {
      besoin: { icon: '🙋', label: 'J\'ai besoin de…',      desc: 'Cherchez de l\'aide'       },
      offre:  { icon: '🐾', label: 'Je propose…',            desc: 'Proposez votre aide'       },
      placeholder: 'Décris ton besoin ou ton offre en quelques mots…',
    },
    'Objets': {
      besoin: { icon: '🙋', label: 'J\'ai besoin de…',      desc: 'Cherchez un objet'         },
      offre:  { icon: '📦', label: 'Je propose…',            desc: 'Prêt ou don d\'objets'     },
      placeholder: 'Décris ton besoin ou ton offre en quelques mots…',
    },
    'Sport': {
      besoin: { icon: '🔍', label: 'Je cherche des gens',   desc: 'Trouver des partenaires'   },
      offre:  { icon: '🏃', label: 'J\'organise une activité', desc: 'Invitez le quartier'    },
      placeholder: 'Décris l\'activité — lieu, heure, niveau…',
    },
    'Sorties': {
      besoin: { icon: '🔍', label: 'Je cherche des gens',   desc: 'Trouver des accompagnants' },
      offre:  { icon: '☕', label: 'J\'organise une sortie', desc: 'Invitez le quartier'       },
      placeholder: 'Décris la sortie — où, quand, ambiance…',
    },
  };

  function applyTypeConfig(cat) {
    const cfg = TYPE_CONFIG[cat];
    if (!cfg) return;
    const besoinEl = document.getElementById('type-besoin');
    const offreEl  = document.getElementById('type-offre');
    besoinEl.querySelector('.post-type-option-icon').textContent  = cfg.besoin.icon;
    besoinEl.querySelector('.post-type-option-label').textContent = cfg.besoin.label;
    besoinEl.querySelector('.post-type-option-desc').textContent  = cfg.besoin.desc;
    offreEl.querySelector('.post-type-option-icon').textContent   = cfg.offre.icon;
    offreEl.querySelector('.post-type-option-label').textContent  = cfg.offre.label;
    offreEl.querySelector('.post-type-option-desc').textContent   = cfg.offre.desc;
    document.getElementById('post-desc').placeholder = cfg.placeholder;
    // Animation de transition
    const wrap = document.getElementById('type-selector-wrap');
    wrap.classList.remove('type-selector-update');
    void wrap.offsetWidth;
    wrap.classList.add('type-selector-update');
  }

  // Type selection
  document.getElementById('type-besoin').onclick = () => {
    postState.type = 'besoin';
    document.querySelectorAll('.post-type-option').forEach(el => el.classList.remove('selected', 'besoin', 'offre'));
    document.getElementById('type-besoin').classList.add('selected', 'besoin');
    checkPublishReady();
  };
  document.getElementById('type-offre').onclick = () => {
    postState.type = 'offre';
    document.querySelectorAll('.post-type-option').forEach(el => el.classList.remove('selected', 'besoin', 'offre'));
    document.getElementById('type-offre').classList.add('selected', 'offre');
    checkPublishReady();
  };

  // Category selection
  document.getElementById('cat-grid').addEventListener('click', e => {
    const opt = e.target.closest('.category-option');
    if (!opt) return;
    const cat = opt.dataset.cat;
    postState.categorie = cat;
    document.querySelectorAll('.category-option').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected');

    const isEvenement = cat === 'Événements';
    document.getElementById('type-selector-wrap').classList.toggle('hidden', isEvenement);
    document.getElementById('type-evenement').classList.toggle('hidden', !isEvenement);

    const textarea      = document.getElementById('post-desc');
    const expiresInput  = document.getElementById('post-expires');
    const expiresOptional = document.getElementById('expires-optional');
    const expiresHint   = document.getElementById('expires-hint');
    const expiresLabel  = document.getElementById('expires-label');

    if (isEvenement) {
      postState.type = 'offre';
      textarea.placeholder = 'Décris l\'événement — lieu, date, heure…';
      expiresInput.required = true;
      expiresOptional.style.display = 'none';
      expiresLabel.firstChild.textContent = 'Date et heure de l\'événement ';
      expiresHint.textContent = 'L\'événement disparaîtra du feed une fois passé.';
      document.getElementById('expires-group').classList.add('expires-required');
    } else {
      postState.type = null;
      document.querySelectorAll('.post-type-option').forEach(el => el.classList.remove('selected', 'besoin', 'offre'));
      applyTypeConfig(cat);
      expiresInput.required = false;
      expiresOptional.style.display = '';
      expiresLabel.firstChild.textContent = 'Expiration ';
      expiresHint.textContent = 'Sans date choisie, la publication expire automatiquement après 14 jours.';
      document.getElementById('expires-group').classList.remove('expires-required');
    }
    expiresInput.value = '';
    checkPublishReady();
  });

  // Char count
  document.getElementById('post-desc').addEventListener('input', e => {
    document.getElementById('char-count').textContent = `${e.target.value.length} / 300`;
    checkPublishReady();
  });

  function checkPublishReady() {
    const desc = document.getElementById('post-desc')?.value.trim();
    const expires = document.getElementById('post-expires')?.value;
    const expiresOk = postState.categorie === 'Événements' ? !!expires : true;
    const ready = postState.type && postState.categorie && desc && desc.length >= 10 && expiresOk;
    document.getElementById('btn-publish').disabled = !ready;
  }

  document.getElementById('post-expires').addEventListener('change', checkPublishReady);

  document.getElementById('btn-publish').onclick = async () => {
    const desc = document.getElementById('post-desc').value.trim();
    const btn  = document.getElementById('btn-publish');
    const errEl= document.getElementById('post-error');
    errEl.textContent = '';

    if (!postState.type || !postState.categorie || !desc) {
      errEl.textContent = 'Veuillez compléter tous les champs.'; return;
    }

    const expiresVal = document.getElementById('post-expires').value;
    const insertData = {
      user_id: state.user.id,
      type: postState.type,
      categorie: postState.categorie,
      description: desc,
      quartier: state.profile.quartier,
      is_resolved: false,
    };
    if (expiresVal) {
      insertData.expires_at = new Date(expiresVal).toISOString();
    } else {
      const auto = new Date();
      auto.setDate(auto.getDate() + 14);
      insertData.expires_at = auto.toISOString();
    }

    showLoading(btn, true);
    const { error } = await db.from('posts').insert(insertData);
    showLoading(btn, false);

    if (error) { errEl.textContent = 'Erreur lors de la publication. Réessayez.'; return; }

    showToast('Publication envoyée 🎉');
    navigate('feed');
  };
}

// ===== CONVERSATIONS / MESSAGES =====
async function startOrOpenConversation(postId, ownerId) {
  if (!state.user) return;

  // Check if conversation already exists
  const { data: existing } = await db.from('conversations')
    .select('id')
    .eq('post_id', postId)
    .or(`and(participant_1.eq.${state.user.id},participant_2.eq.${ownerId}),and(participant_1.eq.${ownerId},participant_2.eq.${state.user.id})`)
    .maybeSingle();

  if (existing) {
    navigate('conversation', { convId: existing.id });
    return;
  }

  const { data: conv, error } = await db.from('conversations').insert({
    post_id: postId,
    participant_1: state.user.id,
    participant_2: ownerId
  }).select('id').single();

  if (error || !conv) { showToast('Erreur lors de l\'ouverture de la messagerie.', 'error'); return; }

  // Send initial context message
  await db.from('messages').insert({
    conversation_id: conv.id,
    sender_id: state.user.id,
    content: '👋 Bonjour ! Je vous contacte suite à votre publication sur Voisy.'
  });

  insertNotif(ownerId, 'reply',
    `${state.profile?.prenom || 'Un habitant'} a répondu à votre publication.`,
    `conversation:${conv.id}`);

  navigate('conversation', { convId: conv.id });
}

async function renderMessages() {
  $app.innerHTML = `
    <div class="messages-screen">
      <div class="top-bar">
        <div style="display:flex;align-items:center;gap:10px">
          <svg width="26" height="18" viewBox="0 0 80 56" fill="none" aria-hidden="true">
            <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="#0D2B1E"/>
            <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(13,43,30,0.35)"/>
          </svg>
          <div>
            <div class="top-bar-title">Messages</div>
            <div class="top-bar-subtitle">Vos messages dans le quartier</div>
          </div>
        </div>
      </div>
      <div id="conv-list-container">${msgSkeletonHTML()}</div>
    </div>`;

  const watchdog = startWatchdog('#conv-list-container', 10_000);

  let convs, error;
  try {
    ({ data: convs, error } = await withTimeout(db.from('conversations')
      .select(`
        id, created_at, post_id,
        posts(description, type, categorie),
        p1:profiles!conversations_participant_1_fkey(id, prenom, photo_url),
        p2:profiles!conversations_participant_2_fkey(id, prenom, photo_url)
      `)
      .or(`participant_1.eq.${state.user.id},participant_2.eq.${state.user.id}`)
      .order('created_at', { ascending: false })));
  } catch {
    clearTimeout(watchdog);
    const el = document.getElementById('conv-list-container');
    if (el) el.innerHTML = loadErrorHTML();
    return;
  }
  clearTimeout(watchdog);

  const container = document.getElementById('conv-list-container');
  if (!container) return;

  if (error || !convs?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-title">Aucun message</div>
        <div class="empty-text">Quand vous répondrez à une publication,<br>vos conversations apparaîtront ici.</div>
      </div>`;
    return;
  }

  // Get last message + unread count for each conv
  const convIds = convs.map(c => c.id);
  const { data: lastMsgs } = await db.from('messages')
    .select('conversation_id, content, created_at, sender_id, read')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false });

  const lastMsgMap = {};
  const unreadMap = {};
  (lastMsgs || []).forEach(m => {
    if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m;
    if (m.sender_id !== state.user.id && !m.read) {
      unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
    }
  });

  const html = convs.map(conv => {
    const other = conv.p1?.id === state.user.id ? conv.p2 : conv.p1;
    const lastMsg = lastMsgMap[conv.id];
    const unread = unreadMap[conv.id] || 0;
    const preview = lastMsg ? esc(lastMsg.content.substring(0, 60)) + (lastMsg.content.length > 60 ? '…' : '') : 'Nouvelle conversation';
    const time = lastMsg ? formatRelTime(lastMsg.created_at) : '';
    const avatarEl = other?.photo_url
      ? `<div class="conv-avatar"><img src="${esc(other.photo_url)}" alt="${esc(other?.prenom)}"></div>`
      : `<div class="conv-avatar">${esc(getInitial(other?.prenom))}</div>`;

    return `
      <div class="conv-item ${unread ? 'unread' : ''}" data-conv-id="${esc(conv.id)}">
        ${avatarEl}
        <div class="conv-info">
          <div class="conv-name">${esc(other?.prenom || 'Habitant·e')}</div>
          <div class="conv-preview">${preview}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          <div class="conv-time">${time}</div>
          ${unread ? `<div class="unread-dot"></div>` : ''}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="conv-list">${html}</div>`;
  container.addEventListener('click', e => {
    const item = e.target.closest('.conv-item');
    if (item) navigate('conversation', { convId: item.dataset.convId });
  });

  // Update badge
  const totalUnread = Object.values(unreadMap).reduce((a,b) => a+b, 0);
  updateMsgBadge(totalUnread);
}

async function renderConversation(convId) {
  $app.innerHTML = `
    <div class="conversation-screen" id="conv-screen">
      <div id="conv-screen-inner" style="display:flex;flex-direction:column;height:100vh">
        <div class="spinner" style="margin-top:60px"></div>
      </div>
    </div>`;

  // Load conversation details
  const { data: conv } = await db.from('conversations')
    .select(`
      id, post_id,
      posts(description, type, categorie),
      p1:profiles!conversations_participant_1_fkey(id, prenom, photo_url, quartier),
      p2:profiles!conversations_participant_2_fkey(id, prenom, photo_url, quartier)
    `)
    .eq('id', convId)
    .single();

  if (!conv) { navigate('messages'); return; }

  const other = conv.p1?.id === state.user.id ? conv.p2 : conv.p1;
  state.currentConvOtherId = other?.id || null;
  const postPreview = conv.posts ? `${getCatIcon(conv.posts.categorie)} ${conv.posts.description?.substring(0,50)}…` : '';
  const avatarEl = other?.photo_url
    ? `<div class="conv-avatar"><img src="${esc(other.photo_url)}" alt="${esc(other?.prenom)}"></div>`
    : `<div class="conv-avatar">${esc(getInitial(other?.prenom))}</div>`;

  document.getElementById('conv-screen-inner').innerHTML = `
    <div class="conv-header">
      <button style="min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center" onclick="navigate('messages')">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button data-action="profile" data-user-id="${esc(other?.id)}" style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;background:none;border:none;cursor:pointer;text-align:left">
        ${avatarEl}
        <div class="conv-header-info">
          <div class="conv-header-name">${esc(other?.prenom || 'Habitant·e')}</div>
          ${postPreview ? `<div class="conv-header-post">${postPreview}</div>` : ''}
        </div>
      </button>
    </div>
    <div id="conv-rating-banner"></div>
    <div class="conv-messages" id="conv-messages"></div>
    <div class="conv-input-area">
      <textarea class="conv-input" id="msg-input" placeholder="Votre message…" rows="1"></textarea>
      <button class="conv-send-btn" id="btn-send" aria-label="Envoyer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>`;

  // Auto-resize textarea
  const msgInput = document.getElementById('msg-input');
  msgInput.addEventListener('input', () => {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
  });
  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(convId); }
  });

  document.getElementById('btn-send').onclick = () => sendMessage(convId);

  // Profile navigation
  document.querySelector('[data-action="profile"]').onclick = () => {
    navigate('profile', { userId: other?.id });
  };

  // Mark messages as read
  await db.from('messages')
    .update({ read: true })
    .eq('conversation_id', convId)
    .neq('sender_id', state.user.id);

  await loadMessages(convId);
  subscribeToMessages(convId);
  checkConvRatingBanner(conv, other);
}

async function loadMessages(convId) {
  const { data: msgs } = await db.from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });

  renderMessageList(msgs || []);
}

function renderMessageList(msgs) {
  const container = document.getElementById('conv-messages');
  if (!container) return;

  if (!msgs.length) {
    container.innerHTML = `<div class="empty-state" style="padding:40px 20px"><div class="empty-icon" style="font-size:36px">💬</div><div class="empty-text">Commencez la conversation !</div></div>`;
    return;
  }

  container.innerHTML = msgs.map(m => {
    const isSent = m.sender_id === state.user.id;
    return `
      <div style="display:flex;flex-direction:column;align-items:${isSent ? 'flex-end' : 'flex-start'}">
        <div class="message-bubble ${isSent ? 'sent' : 'received'}">${esc(m.content)}</div>
        <div class="message-time ${isSent ? '' : 'received'}">${formatRelTime(m.created_at)}</div>
      </div>`;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function sendMessage(convId) {
  const input = document.getElementById('msg-input');
  const content = input?.value.trim();
  if (!content) return;

  input.value = '';
  input.style.height = 'auto';

  const { error } = await db.from('messages').insert({
    conversation_id: convId,
    sender_id: state.user.id,
    content
  });

  if (error) { showToast('Erreur d\'envoi.', 'error'); return; }
  if (state.currentConvOtherId && state.currentConvOtherId !== state.user?.id) {
    insertNotif(state.currentConvOtherId, 'message',
      `${state.profile?.prenom || 'Un habitant'} vous a envoyé un message.`,
      `conversation:${convId}`);
  }
  await loadMessages(convId);
}

function subscribeToMessages(convId) {
  if (state.realtimeSubscription) {
    state.realtimeSubscription.unsubscribe();
  }
  state.realtimeSubscription = db.channel(`messages:${convId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `conversation_id=eq.${convId}`
    }, payload => {
      if (state.view === 'conversation') {
        loadMessages(convId);
        if (payload.new.sender_id !== state.user.id) {
          db.from('messages').update({ read: true }).eq('id', payload.new.id);
        }
      }
    })
    .subscribe();
}

function updateMsgBadge(count) {
  if (!$badge) return;
  if (count > 0) {
    const wasHidden = $badge.classList.contains('hidden');
    $badge.textContent = count > 9 ? '9+' : count;
    $badge.classList.remove('hidden');
    if (wasHidden) {
      $badge.classList.remove('badge-pop');
      void $badge.offsetWidth; // force reflow pour relancer l'animation
      $badge.classList.add('badge-pop');
    }
  } else {
    $badge.classList.add('hidden');
  }
}

// ===== NOTIFICATIONS =====
async function insertNotif(userId, type, content, link) {
  if (!state.user || !userId) return;
  try {
    await db.from('notifications').insert({ user_id: userId, type, content, link: link || null });
  } catch { /* non-critique */ }
}

async function refreshNotifCount() {
  if (!state.user) return;
  try {
    const { count } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', state.user.id)
      .eq('read', false);
    updateNotifBadge(count || 0);
  } catch { /* ignore */ }
}

function updateNotifBadge(count) {
  const el = document.getElementById('notif-badge');
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 9 ? '9+' : count;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

async function checkExpiryNotifs() {
  if (!state.user || state.expiryNotifChecked) return;
  state.expiryNotifChecked = true;
  try {
    const in3days = new Date();
    in3days.setDate(in3days.getDate() + 3);
    const { data: posts } = await db.from('posts')
      .select('id, description, expires_at')
      .eq('user_id', state.user.id)
      .eq('is_resolved', false)
      .not('expires_at', 'is', null)
      .lt('expires_at', in3days.toISOString())
      .gt('expires_at', new Date().toISOString());
    if (!posts?.length) return;
    // Only notify for posts not already notified today
    const since = new Date(); since.setHours(0,0,0,0);
    const { data: recent } = await db.from('notifications')
      .select('content')
      .eq('user_id', state.user.id)
      .eq('type', 'expiry')
      .gte('created_at', since.toISOString());
    const alreadyNotified = new Set((recent || []).map(n => n.content));
    for (const p of posts) {
      const daysLeft = Math.ceil((new Date(p.expires_at) - new Date()) / 86400000);
      const msg = `Votre publication "${p.description?.substring(0,40)}…" expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`;
      if (!alreadyNotified.has(msg)) {
        await insertNotif(state.user.id, 'expiry', msg, null);
      }
    }
  } catch { /* non-critique */ }
}

async function renderNotifications() {
  $app.innerHTML = `
    <div class="notif-screen">
      <div class="top-bar">
        <button class="top-bar-back" onclick="navigate('feed')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Retour
        </button>
        <div style="font-size:17px;font-weight:800">Notifications</div>
        <div style="width:80px"></div>
      </div>
      <div id="notif-list">${feedSkeletonHTML()}</div>
    </div>`;

  const watchdog = startWatchdog('#notif-list', 10_000);

  try {
    const { data: notifs } = await withTimeout(
      db.from('notifications')
        .select('*')
        .eq('user_id', state.user.id)
        .order('created_at', { ascending: false })
        .limit(50)
    );

    clearTimeout(watchdog);

    db.from('notifications')
      .update({ read: true })
      .eq('user_id', state.user.id)
      .eq('read', false)
      .then(() => updateNotifBadge(0));

    const listEl = document.getElementById('notif-list');
    if (!listEl) return;

    if (!notifs?.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔔</div>
          <div class="empty-title">Aucune notification</div>
          <div class="empty-text">Vos notifications apparaîtront ici.</div>
        </div>`;
      return;
    }

    listEl.innerHTML = notifs.map(n => {
      const icon = { message: '💬', reply: '🤝', rating: '⭐', expiry: '⏳' }[n.type] || '🔔';
      const convId = n.link?.startsWith('conversation:') ? n.link.replace('conversation:', '') : null;
      return `
        <div class="notif-item ${n.read ? '' : 'unread'}"${convId ? ` data-conv-id="${esc(convId)}"` : ''}>
          <div class="notif-icon">${icon}</div>
          <div class="notif-body">
            <div class="notif-text">${esc(n.content)}</div>
            <div class="notif-time">${formatRelTime(n.created_at)}</div>
          </div>
          ${!n.read ? '<div class="notif-dot"></div>' : ''}
        </div>`;
    }).join('');

    listEl.addEventListener('click', e => {
      const item = e.target.closest('[data-conv-id]');
      if (item) navigate('conversation', { convId: item.dataset.convId });
    });

  } catch {
    clearTimeout(watchdog);
    const listEl = document.getElementById('notif-list');
    if (listEl) listEl.innerHTML = loadErrorHTML();
  }
}

// ===== PROFILE =====
async function renderProfile(userId) {
  const isOwn = !userId || userId === state.user?.id;
  const uid   = userId || state.user?.id;

  $app.innerHTML = '<div class="spinner" style="margin-top:80px"></div>';
  const watchdog = startWatchdog('#app', 10_000);

  let profileRes, postsRes, ratingsRes;
  try {
    [profileRes, postsRes, ratingsRes] = await withTimeout(Promise.all([
      db.from('profiles').select('*').eq('id', uid).single(),
      db.from('posts').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
      db.from('ratings').select('id, score').eq('rated_id', uid)
    ]));
  } catch {
    clearTimeout(watchdog);
    $app.innerHTML = loadErrorHTML();
    return;
  }
  clearTimeout(watchdog);

  const profile = profileRes.data;
  const posts   = postsRes.data || [];

  if (isOwn && !profile?.presence_status) { renderOnboarding(); return; }
  if (!profile && !isOwn) { navigate('feed'); return; }

  // --- Notes & alerte admin ---
  const ratingsData = ratingsRes.data || [];
  let ratingStats = null;
  if (ratingsData.length >= 3) {
    const avg = ratingsData.reduce((s, r) => s + r.score, 0) / ratingsData.length;
    ratingStats = { avg: Math.round(avg * 10) / 10, count: ratingsData.length };
  }
  let underReview = false;
  if (ratingsData.length) {
    const ratingIds = ratingsData.map(r => r.id);
    const { data: alertData } = await withTimeout(db.from('admin_alerts')
      .select('id').eq('resolved', false).in('rating_id', ratingIds).limit(1)).catch(() => ({ data: null }));
    underReview = !!(alertData?.length);
  }

  const trustPct = Math.min(profile.trust_score * 10, 100);

  // --- Avatar (respect show_photo pour les autres profils) ---
  const showPhoto = isOwn || privacyVisible(profile, 'show_photo');
  let avatarEl;
  if (profile.photo_url && showPhoto) {
    avatarEl = `<div class="profile-avatar-large">
      <img src="${esc(profile.photo_url)}" alt="${esc(profile.prenom)}">
      ${isOwn ? `<label class="avatar-upload-overlay" for="avatar-upload" title="Changer la photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </label>` : ''}
    </div>`;
  } else if (profile.photo_url && !showPhoto) {
    avatarEl = silhouetteAvatarHTML('profile-avatar-large');
  } else {
    avatarEl = `<div class="profile-avatar-large">${esc(getInitial(profile.prenom))}
      ${isOwn ? `<label class="avatar-upload-overlay" for="avatar-upload" title="Ajouter une photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
      </label>` : ''}
    </div>`;
  }

  // --- Infos conditionnelles (age, gender, bio) ---
  const showAge    = isOwn || privacyVisible(profile, 'show_age');
  const showGender = isOwn || privacyVisible(profile, 'show_gender');
  const showBio    = isOwn || privacyVisible(profile, 'show_bio');

  const agePill    = (showAge && profile.age)    ? `<span class="profile-info-pill">🎂 ${esc(String(profile.age))} ans</span>` : '';
  const genderPill = (showGender && profile.gender && profile.gender !== 'Ne pas préciser')
    ? `<span class="profile-info-pill">${esc(profile.gender)}</span>` : '';
  const infoPills  = (agePill || genderPill)
    ? `<div class="profile-info-pills">${agePill}${genderPill}</div>` : '';

  // Own profile: show grayed-out indicator when a field is hidden by privacy
  const ownHiddenNote = isOwn ? (() => {
    const hidden = [];
    if (!privacyVisible(profile, 'show_photo'))  hidden.push('photo');
    if (!privacyVisible(profile, 'show_age'))    hidden.push('âge');
    if (!privacyVisible(profile, 'show_gender')) hidden.push('sexe');
    if (!privacyVisible(profile, 'show_bio'))    hidden.push('bio');
    return hidden.length ? `<p class="profile-info-hidden">${hidden.join(', ')} masqué${hidden.length > 1 ? 's' : ''} aux autres</p>` : '';
  })() : '';

  const resolvedCount = posts.filter(p => p.is_resolved).length;
  const activeCount   = posts.filter(p => !p.is_resolved).length;

  // --- Privacy section HTML (own only) ---
  const privacySectionHTML = isOwn ? `
    <div class="privacy-section">
      <div class="privacy-section-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        <span class="privacy-section-title">Mes préférences de confidentialité</span>
      </div>
      <p class="privacy-section-subtitle">Choisissez ce que les gens du quartier peuvent voir sur votre profil.</p>

      <div class="privacy-row">
        <div class="privacy-row-left">
          <span class="privacy-row-label">Prénom</span>
          <span class="privacy-row-fixed">Toujours visible</span>
        </div>
        <span class="privacy-row-fixed" style="color:var(--green)">✓ Obligatoire</span>
      </div>

      <div class="privacy-row">
        <div class="privacy-row-left">
          <span class="privacy-row-label">Quartier</span>
          <span class="privacy-row-fixed">Toujours visible</span>
        </div>
        <span class="privacy-row-fixed" style="color:var(--green)">✓ Obligatoire</span>
      </div>

      <div class="privacy-row">
        <div class="privacy-row-left">
          <span class="privacy-row-label">Photo de profil</span>
          <span class="privacy-row-desc">${profile.photo_url ? 'Photo définie' : 'Aucune photo'}</span>
        </div>
        <div class="toggle-wrap">
          <span class="toggle-status ${privacyVisible(profile,'show_photo') ? 'on' : ''}" id="status-show_photo">
            ${privacyVisible(profile,'show_photo') ? 'Visible' : 'Masquée'}
          </span>
          <label class="toggle">
            <input type="checkbox" class="privacy-toggle" data-field="show_photo" ${privacyVisible(profile,'show_photo') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="privacy-row">
        <div class="privacy-row-left">
          <span class="privacy-row-label">Âge</span>
          <span class="privacy-row-desc">${profile.age ? `${profile.age} ans` : 'Non renseigné'}</span>
        </div>
        <div class="toggle-wrap">
          <span class="toggle-status ${privacyVisible(profile,'show_age') ? 'on' : ''}" id="status-show_age">
            ${privacyVisible(profile,'show_age') ? 'Visible' : 'Masqué'}
          </span>
          <label class="toggle">
            <input type="checkbox" class="privacy-toggle" data-field="show_age" ${privacyVisible(profile,'show_age') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="privacy-row">
        <div class="privacy-row-left">
          <span class="privacy-row-label">Sexe</span>
          <span class="privacy-row-desc">${(profile.gender && profile.gender !== 'Ne pas préciser') ? esc(profile.gender) : 'Non renseigné'}</span>
        </div>
        <div class="toggle-wrap">
          <span class="toggle-status ${privacyVisible(profile,'show_gender') ? 'on' : ''}" id="status-show_gender">
            ${privacyVisible(profile,'show_gender') ? 'Visible' : 'Masqué'}
          </span>
          <label class="toggle">
            <input type="checkbox" class="privacy-toggle" data-field="show_gender" ${privacyVisible(profile,'show_gender') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>

      <div class="privacy-row">
        <div class="privacy-row-left">
          <span class="privacy-row-label">Bio</span>
          <span class="privacy-row-desc">${profile.bio ? `"${profile.bio.substring(0,30)}…"` : 'Non renseignée'}</span>
        </div>
        <div class="toggle-wrap">
          <span class="toggle-status ${privacyVisible(profile,'show_bio') ? 'on' : ''}" id="status-show_bio">
            ${privacyVisible(profile,'show_bio') ? 'Visible' : 'Masquée'}
          </span>
          <label class="toggle">
            <input type="checkbox" class="privacy-toggle" data-field="show_bio" ${privacyVisible(profile,'show_bio') ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
      </div>
    </div>` : '';

  $app.innerHTML = `
    <div class="profile-screen">
      ${!isOwn ? `
        <div class="top-bar">
          <button class="top-bar-back" onclick="navigate('feed')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Retour
          </button>
        </div>` : ''}

      <div class="profile-hero">
        <svg width="26" height="18" viewBox="0 0 80 56" fill="none" aria-hidden="true" style="opacity:0.55;margin-bottom:2px">
          <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="rgba(255,255,255,0.95)"/>
          <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(255,255,255,0.5)"/>
        </svg>
        ${isOwn ? `<button class="profile-edit-btn" id="btn-edit-profile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Modifier
        </button>` : ''}
        ${!isOwn ? `<button class="profile-report-btn" data-action="report" data-type="profile" data-target-id="${esc(uid)}" aria-label="Signaler ce profil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
        </button>` : ''}
        ${avatarEl}
        ${isOwn ? `<input type="file" id="avatar-upload" accept="image/*" style="display:none">` : ''}
        <div class="profile-name">${esc(profile.prenom)}</div>
        <div class="profile-quartier-badge">📍 ${esc(profile.quartier)}</div>
        ${profile.presence_status ? `<div class="profile-presence-badge">${presenceLabel(profile.presence_status)}</div>` : ''}
        <div class="trust-badges">
          <span class="trust-badge ${profile.photo_verified ? 'verified' : 'unverified'}">
            📷 Photo ${profile.photo_verified ? 'vérifiée ✓' : 'non vérifiée'}
          </span>
          <span class="trust-badge ${profile.phone_verified ? 'verified' : 'unverified'}">
            📱 Numéro ${profile.phone_verified ? 'vérifié ✓' : 'non vérifié'}
          </span>
        </div>
        ${underReview ? `<div class="review-badge-profile">⚠️ Profil en cours d'examen</div>` : ''}
        ${ratingStats ? `<div class="profile-rating"><span class="stars-text">${starsDisplay(ratingStats.avg)}</span> <strong>${ratingStats.avg}</strong> · ${ratingStats.count} interaction${ratingStats.count > 1 ? 's' : ''}</div>` : ''}
        ${infoPills}
        ${showBio && profile.bio ? `<div class="profile-bio">${esc(profile.bio)}</div>` : ''}
        ${profile.energy_type ? `<div class="profile-energy-badge energy-${esc(profile.energy_type)}">${energyLabel(profile.energy_type)}</div>` : ''}
        ${profile.about_me ? `<div class="profile-about-me">${esc(profile.about_me)}</div>` : ''}
        ${ownHiddenNote}
      </div>

      <div class="profile-stats">
        <div class="profile-stat">
          <div class="stat-value">${activeCount}</div>
          <div class="stat-label">Actifs</div>
        </div>
        <div class="profile-stat">
          <div class="stat-value">${resolvedCount}</div>
          <div class="stat-label">Résolus</div>
        </div>
        <div class="profile-stat">
          <div class="stat-value">${profile.trust_score || 0}</div>
          <div class="stat-label">Confiance</div>
        </div>
      </div>

      <div class="profile-section">
        <div class="section-title">Niveau de confiance</div>
        <div class="trust-bar-wrap">
          <div class="trust-bar"><div class="trust-fill" style="width:${trustPct}%"></div></div>
          <div class="trust-score-text">${profile.trust_score || 0} pts</div>
        </div>
        <p style="font-size:12px;color:var(--text-muted);margin-top:8px;font-weight:500">
          Basé sur les interactions positives dans le quartier.
        </p>
      </div>

      ${privacySectionHTML}

      ${posts.length ? `
        <div class="profile-section">
          <div class="section-title">Publications (${posts.length})</div>
          ${posts.slice(0, 10).map(p => `
            <div class="mini-post-card">
              <div class="mini-post-type ${p.type}">${getCatIcon(p.categorie)} ${p.type === 'besoin' ? 'Besoin' : 'Offre'} · ${esc(p.categorie)} ${p.is_resolved ? '✓' : ''}</div>
              <div class="mini-post-desc">${esc(p.description)}</div>
              <div class="mini-post-meta">${formatRelTime(p.created_at)}</div>
            </div>`).join('')}
        </div>` : ''}

      ${isOwn ? `
        <div class="profile-section">
          <button class="btn btn-ghost" id="btn-logout" style="color:var(--text-muted)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Se déconnecter
          </button>
        </div>
        <div style="padding:8px 20px 20px;text-align:center">
          <a href="pages/cgu.html" target="_blank" style="font-size:12px;color:var(--text-light);margin-right:16px">CGU</a>
          <a href="pages/privacy.html" target="_blank" style="font-size:12px;color:var(--text-light);margin-right:16px">Confidentialité</a>
          <button onclick="showDeleteAccountModal()" style="font-size:12px;color:var(--text-light);background:none;border:none;cursor:pointer">Supprimer mon compte</button>
        </div>` : ''}
    </div>`;

  // Rebond des badges de confiance
  requestAnimationFrame(() => {
    document.querySelectorAll('.trust-badge.verified').forEach((el, i) => {
      el.style.setProperty('--badge-delay', `${i * 100}ms`);
      el.classList.add('badge-bounce');
    });
  });

  if (isOwn) {
    document.getElementById('btn-edit-profile').onclick = () => navigate('edit-profile');
    document.getElementById('btn-logout').onclick = handleLogout;
    const uploadInput = document.getElementById('avatar-upload');
    if (uploadInput) uploadInput.onchange = handleAvatarUpload;

    // Privacy toggles — auto-save on change
    document.querySelectorAll('.privacy-toggle').forEach(toggle => {
      toggle.addEventListener('change', async () => {
        const field   = toggle.dataset.field;
        const value   = toggle.checked;
        const statusEl = document.getElementById(`status-${field}`);

        await db.from('profiles').update({ [field]: value }).eq('id', state.user.id);
        state.profile[field] = value;

        if (statusEl) {
          const labels = {
            show_photo: ['Visible', 'Masquée'],
            show_age:   ['Visible', 'Masqué'],
            show_gender:['Visible', 'Masqué'],
            show_bio:   ['Visible', 'Masquée'],
          };
          const [on, off] = labels[field] || ['Visible', 'Masqué'];
          statusEl.textContent = value ? on : off;
          statusEl.classList.toggle('on', value);
        }
        showToast(value ? 'Information visible par tous' : 'Information masquée', 'info');
      });
    });
  }

  // Report button
  const reportBtn = document.querySelector('[data-action="report"]');
  if (reportBtn) {
    reportBtn.onclick = () => showReportModal(reportBtn.dataset.type, reportBtn.dataset.targetId);
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Image trop lourde (max 2 Mo).', 'error'); return; }

  showToast('Envoi de la photo…', 'info');
  const ext  = file.name.split('.').pop();
  const path = `${state.user.id}/avatar.${ext}`;

  const { error: uploadErr } = await db.storage.from('avatars').upload(path, file, { upsert: true });
  if (uploadErr) { showToast('Erreur lors de l\'upload.', 'error'); return; }

  const { data: { publicUrl } } = db.storage.from('avatars').getPublicUrl(path);
  await db.from('profiles').update({ photo_url: publicUrl }).eq('id', state.user.id);
  state.profile.photo_url = publicUrl;
  showToast('Photo mise à jour !');
  renderProfile(null);
}

async function handleLogout() {
  await db.auth.signOut();
  state.user = null;
  state.profile = null;
  if (state.realtimeSubscription) state.realtimeSubscription.unsubscribe();
  navigate('login');
}

function showDeleteAccountModal() {
  openModal(`
    <div class="modal-title" style="color:#DC2626">Supprimer mon compte</div>
    <p style="font-size:15px;color:var(--text-muted);margin-bottom:20px;line-height:1.5">
      Cette action est irréversible. Toutes vos publications et messages seront supprimés.
    </p>
    <button class="btn" style="background:#DC2626;color:white;margin-bottom:10px" id="btn-confirm-delete">Confirmer la suppression</button>
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>`);

  document.getElementById('btn-confirm-delete').onclick = async () => {
    await db.from('profiles').delete().eq('id', state.user.id);
    await db.auth.admin?.deleteUser(state.user.id).catch(() => {});
    await db.auth.signOut();
    closeModal();
    state.user = null;
    state.profile = null;
    navigate('login');
    showToast('Compte supprimé.');
  };
}

// ===== EDIT PROFILE =====
async function renderEditProfile() {
  const p = state.profile;

  $app.innerHTML = `
    <div class="edit-profile-screen">
      <div class="top-bar">
        <button class="top-bar-back" onclick="navigate('profile')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          Retour
        </button>
        <div style="font-size:17px;font-weight:800">Modifier mon profil</div>
        <div style="width:80px"></div>
      </div>

      <div class="avatar-edit-section">
        <div class="avatar-preview" id="avatar-preview-wrap">
          ${p?.photo_url ? `<img src="${esc(p.photo_url)}" alt="Avatar">` : esc(getInitial(p?.prenom))}
        </div>
        <label class="avatar-edit-btn" for="edit-avatar-upload">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Changer la photo
        </label>
        <input type="file" id="edit-avatar-upload" accept="image/*" style="display:none">
      </div>

      <div class="form-group">
        <label class="form-label">Prénom <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(toujours visible)</span></label>
        <input type="text" class="form-input" id="edit-prenom" value="${esc(p?.prenom || '')}" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">Quartier <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(toujours visible)</span></label>
        <select class="form-select" id="edit-quartier">
          ${QUARTIERS.map(q => `<option value="${esc(q)}" ${p?.quartier === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Je suis dans ce quartier… <span style="color:var(--terracotta)">*</span></label>
        ${presenceBtnsHTML('edit-presence-group', p?.presence_status || '')}
        <input type="hidden" id="edit-presence" value="${esc(p?.presence_status || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">Date de naissance <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(privée — jamais affichée publiquement)</span></label>
        <input type="date" class="form-input" id="edit-birthdate" max="${max18Date()}" value="${esc(p?.birthdate || '')}">
        ${p?.birthdate ? `<div class="form-hint">Âge calculé : ${computeAge(p.birthdate)} ans</div>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Sexe <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(optionnel)</span></label>
        <select class="form-select" id="edit-gender">
          <option value="Ne pas préciser" ${(!p?.gender || p.gender === 'Ne pas préciser') ? 'selected' : ''}>Ne pas préciser</option>
          <option value="Homme"      ${p?.gender === 'Homme'       ? 'selected' : ''}>Homme</option>
          <option value="Femme"      ${p?.gender === 'Femme'       ? 'selected' : ''}>Femme</option>
          <option value="Non-binaire"${p?.gender === 'Non-binaire' ? 'selected' : ''}>Non-binaire</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Bio courte <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(optionnelle)</span></label>
        <textarea class="form-input" id="edit-bio" placeholder="Quelques mots sur vous…" maxlength="150" style="min-height:90px">${esc(p?.bio || '')}</textarea>
        <div class="char-count" id="bio-count">${(p?.bio || '').length} / 150</div>
      </div>

      <div class="form-group">
        <label class="form-label">Énergie sociale <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(optionnelle)</span></label>
        ${energyBtnsHTML('edit-energy-group', p?.energy_type || '')}
        <input type="hidden" id="edit-energy" value="${esc(p?.energy_type || '')}">
      </div>

      <div class="form-group">
        <label class="form-label">En quelques mots, je suis… <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(optionnel)</span></label>
        <input type="text" class="form-input" id="edit-about-me" placeholder="Curieux, bricoleur, passionné de cuisine…" maxlength="150" value="${esc(p?.about_me || '')}">
        <div class="char-count" id="about-me-count">${(p?.about_me || '').length} / 150</div>
      </div>

      <div class="form-group">
        <label class="form-label">Téléphone <span style="color:var(--text-light);font-weight:500;text-transform:none;font-size:11px">(optionnel — non affiché publiquement)</span></label>
        <input type="tel" class="form-input" id="edit-phone"
          placeholder="+33 6 xx xx xx xx" value="${esc(p?.phone || '')}" autocomplete="tel">
      </div>

      <div class="verify-section">
        <div class="verify-section-title">Demandes de vérification</div>
        <div class="verify-status ${p?.photo_verified ? 'ok' : 'nok'}">
          ${p?.photo_verified
            ? '📷 Photo vérifiée ✓'
            : '📷 Photo non vérifiée'}
        </div>
        ${!p?.photo_verified ? `
          <button class="btn btn-outline btn-sm" id="btn-req-photo">
            Demander la vérification de ma photo
          </button>
          <p style="font-size:12px;color:var(--text-muted);margin-top:8px;line-height:1.4">
            Un modérateur examinera votre photo de profil et activera le badge.
          </p>` : ''}
        <div class="verify-status ${p?.phone_verified ? 'ok' : 'nok'}" style="margin-top:12px">
          ${p?.phone_verified
            ? '📱 Numéro vérifié ✓'
            : '📱 Numéro non vérifié'}
        </div>
        ${!p?.phone_verified ? `
          <p style="font-size:12px;color:var(--text-muted);margin-top:6px;line-height:1.4">
            Renseignez votre numéro ci-dessus — la vérification sera activée par un modérateur.
          </p>` : ''}
      </div>

      <div id="edit-error" class="form-error" style="margin-bottom:12px"></div>
      <button class="btn btn-primary" id="btn-save-profile">Enregistrer</button>
      <p style="text-align:center;margin-top:12px;font-size:12px;color:var(--text-muted)">
        Les préférences de confidentialité se gèrent depuis votre profil.
      </p>
    </div>`;

  document.getElementById('edit-bio').addEventListener('input', e => {
    document.getElementById('bio-count').textContent = `${e.target.value.length} / 150`;
  });

  document.getElementById('edit-about-me').addEventListener('input', e => {
    document.getElementById('about-me-count').textContent = `${e.target.value.length} / 150`;
  });

  document.getElementById('edit-presence-group').addEventListener('click', e => {
    const btn = e.target.closest('.presence-btn');
    if (!btn) return;
    document.querySelectorAll('#edit-presence-group .presence-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('edit-presence').value = btn.dataset.value;
  });

  document.getElementById('edit-energy-group').addEventListener('click', e => {
    const btn = e.target.closest('.energy-btn');
    if (!btn) return;
    const alreadyActive = btn.classList.contains('active');
    document.querySelectorAll('#edit-energy-group .energy-btn').forEach(b => b.classList.remove('active'));
    if (!alreadyActive) {
      btn.classList.add('active');
      document.getElementById('edit-energy').value = btn.dataset.value;
    } else {
      document.getElementById('edit-energy').value = '';
    }
  });

  document.getElementById('edit-avatar-upload').onchange = handleAvatarUpload;

  // Verification request button
  const btnReqPhoto = document.getElementById('btn-req-photo');
  if (btnReqPhoto) {
    btnReqPhoto.onclick = async () => {
      showLoading(btnReqPhoto, true);
      const { data: existing } = await db.from('verification_requests')
        .select('id').eq('user_id', state.user.id)
        .eq('type', 'photo').eq('status', 'pending').maybeSingle();
      if (existing) {
        showLoading(btnReqPhoto, false);
        showToast('Une demande est déjà en cours de traitement.', 'info');
        return;
      }
      const { error } = await db.from('verification_requests')
        .insert({ user_id: state.user.id, type: 'photo', status: 'pending' });
      showLoading(btnReqPhoto, false);
      if (error) { showToast('Erreur lors de la demande.', 'error'); return; }
      btnReqPhoto.disabled = true;
      btnReqPhoto.textContent = '✓ Demande envoyée';
      showToast('Demande de vérification photo envoyée !');
    };
  }

  document.getElementById('btn-save-profile').onclick = async () => {
    const prenom          = document.getElementById('edit-prenom').value.trim();
    const quartier        = document.getElementById('edit-quartier').value;
    const presence_status = document.getElementById('edit-presence').value;
    const birthdateVal    = document.getElementById('edit-birthdate').value;
    const gender          = document.getElementById('edit-gender').value;
    const bio             = document.getElementById('edit-bio').value.trim();
    const energy_type     = document.getElementById('edit-energy').value || null;
    const about_me        = document.getElementById('edit-about-me').value.trim() || null;
    const phone           = document.getElementById('edit-phone').value.trim();
    const btn             = document.getElementById('btn-save-profile');
    const errEl           = document.getElementById('edit-error');
    errEl.textContent = '';

    if (!prenom)          { errEl.textContent = 'Le prénom est obligatoire.'; return; }
    if (!presence_status) { errEl.textContent = 'Indiquez votre situation dans ce quartier.'; return; }

    if (birthdateVal) {
      const age = computeAge(birthdateVal);
      if (age === null || age < 18) {
        errEl.textContent = 'Voisy est une communauté réservée aux adultes de 18 ans et plus. À bientôt !';
        return;
      }
    }

    const age = birthdateVal ? computeAge(birthdateVal) : (state.profile?.age ?? null);

    showLoading(btn, true);
    const { error } = await db.from('profiles')
      .update({ prenom, quartier, presence_status, birthdate: birthdateVal || null, age, gender, bio, energy_type, about_me, phone: phone || null })
      .eq('id', state.user.id);
    showLoading(btn, false);

    if (error) { errEl.textContent = 'Erreur lors de la sauvegarde.'; return; }

    state.profile = { ...state.profile, prenom, quartier, presence_status, birthdate: birthdateVal || null, age, gender, bio, energy_type, about_me, phone: phone || null };
    showToast('Profil mis à jour !');
    navigate('profile');
  };
}

// ===== REPORT =====
function showReportModal(type, targetId) {
  const reasons = [
    'Contenu inapproprié ou offensant',
    'Spam ou fausse information',
    'Harcèlement ou intimidation',
    'Arnaque ou tentative de fraude',
    'Demande d\'argent ou transaction financière',
    'Autre raison'
  ];

  openModal(`
    <div class="modal-title">Signaler</div>
    <p style="font-size:14px;color:var(--text-muted);margin-bottom:16px">Pourquoi souhaitez-vous signaler ce contenu ?</p>
    <div class="report-reason-list">
      ${reasons.map(r => `<button class="report-reason-option" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}
    </div>
    <button class="btn btn-ghost" style="margin-top:12px" onclick="closeModal()">Annuler</button>`);

  document.querySelectorAll('.report-reason-option').forEach(btn => {
    btn.onclick = () => submitReport(type, targetId, btn.dataset.reason);
  });
}

async function submitReport(type, targetId, reason) {
  closeModal();
  await db.from('reports').insert({
    reporter_id: state.user.id,
    target_type: type,
    target_id: targetId,
    reason
  });
  showToast('Signalement envoyé. Merci de contribuer à la sécurité de Voisy.');
}

// ===== RATING =====
function showRatingModal(ratedId, ratedName, postId) {
  let selectedScore = 0;
  const SCORE_LABELS = ['', 'Très mauvaise expérience', 'Mauvaise expérience', 'Expérience correcte', 'Bonne expérience', 'Excellente expérience'];

  openModal(`
    <div class="modal-title">⭐ Noter l'interaction</div>
    <p class="rating-subtitle">Comment s'est passée votre rencontre avec <strong>${esc(ratedName)}</strong> ?</p>
    <div class="stars-wrap" id="modal-stars">
      ${[1,2,3,4,5].map(i => `<button class="star-btn" data-score="${i}" type="button">★</button>`).join('')}
    </div>
    <div class="rating-score-label" id="rating-score-label"></div>
    <div id="rating-comment-wrap" style="display:none">
      <label class="form-label" style="margin-top:16px">Que s'est-il passé ? <span style="color:var(--terracotta)">*</span></label>
      <textarea class="form-input" id="rating-comment" placeholder="Décrivez brièvement ce qui s'est passé… (min. 20 caractères)" maxlength="500" style="min-height:80px;margin-top:8px"></textarea>
      <div class="char-count" id="rating-char-count">0 / 500</div>
    </div>
    <div id="rating-error" class="form-error" style="margin-top:8px"></div>
    <button class="btn btn-primary" id="btn-submit-rating" style="margin-top:16px" disabled>Envoyer ma note</button>
    <button class="btn btn-ghost" onclick="closeModal()" style="margin-top:8px">Plus tard</button>
  `);

  const starsEl      = document.getElementById('modal-stars');
  const commentWrap  = document.getElementById('rating-comment-wrap');
  const commentInput = document.getElementById('rating-comment');
  const charCount    = document.getElementById('rating-char-count');
  const scoreLabelEl = document.getElementById('rating-score-label');
  const submitBtn    = document.getElementById('btn-submit-rating');
  const errEl        = document.getElementById('rating-error');

  starsEl.addEventListener('click', e => {
    const btn = e.target.closest('.star-btn');
    if (!btn) return;
    selectedScore = parseInt(btn.dataset.score);
    starsEl.querySelectorAll('.star-btn').forEach((s, i) => s.classList.toggle('active', i < selectedScore));
    scoreLabelEl.textContent = SCORE_LABELS[selectedScore];
    commentWrap.style.display = selectedScore > 0 && selectedScore < 3 ? '' : 'none';
    submitBtn.disabled = false;
    errEl.textContent = '';
  });

  commentInput.addEventListener('input', () => {
    charCount.textContent = `${commentInput.value.length} / 500`;
  });

  submitBtn.onclick = async () => {
    errEl.textContent = '';
    if (!selectedScore) { errEl.textContent = 'Veuillez choisir une note.'; return; }
    const comment = commentInput.value.trim();
    if (selectedScore < 3 && comment.length < 20) {
      errEl.textContent = 'Veuillez décrire ce qui s\'est passé (minimum 20 caractères).'; return;
    }
    showLoading(submitBtn, true);
    const ok = await submitRating(ratedId, postId, selectedScore, comment || null);
    showLoading(submitBtn, false);
    if (ok) { closeModal(); showToast('Note envoyée, merci !'); }
    else { errEl.textContent = 'Erreur lors de l\'envoi. Réessayez.'; }
  };
}

async function submitRating(ratedId, postId, score, comment) {
  const { error } = await db.from('ratings').insert({
    rater_id: state.user.id,
    rated_id: ratedId,
    post_id: postId,
    score,
    comment: comment || null,
    status: 'pending'
  });
  if (error) { console.error(error); return false; }
  insertNotif(ratedId, 'rating',
    `${state.profile?.prenom || 'Un habitant'} a noté votre interaction (${score}/5).`,
    null);
  return true;
}

async function checkConvRatingBanner(conv, other) {
  if (!conv.post_id || !other?.id) return;
  const bannerEl = document.getElementById('conv-rating-banner');
  if (!bannerEl) return;

  const { data: postData } = await db.from('posts')
    .select('is_resolved').eq('id', conv.post_id).single();
  if (!postData?.is_resolved) return;

  const { data: existing } = await db.from('ratings')
    .select('id')
    .eq('rater_id', state.user.id)
    .eq('rated_id', other.id)
    .eq('post_id', conv.post_id)
    .maybeSingle();
  if (existing) return;

  bannerEl.innerHTML = `
    <div class="rating-banner">
      <span class="rating-banner-text">⭐ Comment s'est passée votre rencontre ?</span>
      <button class="btn btn-sm btn-outline" id="btn-rate-conv">Noter</button>
    </div>`;
  document.getElementById('btn-rate-conv').onclick = () => {
    showRatingModal(other.id, other.prenom, conv.post_id);
  };
}

// ===== UNREAD BADGE POLLING =====
let _prevUnread = 0;
async function refreshUnreadCount() {
  if (!state.user) return;
  const { count } = await db.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('read', false)
    .neq('sender_id', state.user.id);
  const n = count || 0;
  if (n > _prevUnread && !['messages', 'conversation'].includes(state.view)) {
    showToast('💬 Nouveau message reçu', 'info');
  }
  _prevUnread = n;
  updateMsgBadge(n);
}

// ===== NAV SETUP =====
function setupNav() {
  $nav.addEventListener('click', e => {
    const btn = e.target.closest('.nav-btn');
    if (!btn || !btn.dataset.view) return;
    navigate(btn.dataset.view);
  });
}

// ===== MODAL CLOSE ON OVERLAY CLICK =====
$modal.addEventListener('click', e => {
  if (e.target === $modal) closeModal();
});

// ===== INIT =====
async function init() {
  // Show loading
  $loading.classList.remove('hidden');
  $app.classList.add('hidden');

  if (!db || SUPABASE_URL === 'VOTRE_SUPABASE_URL') {
    $loading.classList.add('fade-out');
    setTimeout(() => { $loading.style.display = 'none'; }, 400);
    $app.classList.remove('hidden');
    $app.innerHTML = `
      <div style="padding:40px 24px;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
        <div style="font-size:48px">⚙️</div>
        <h2 style="font-size:22px;font-weight:800">Configuration requise</h2>
        <p style="color:var(--text-muted);line-height:1.6;font-size:15px">
          Remplacez <code style="background:var(--border);padding:2px 6px;border-radius:4px">VOTRE_SUPABASE_URL</code>
          et <code style="background:var(--border);padding:2px 6px;border-radius:4px">VOTRE_SUPABASE_ANON_KEY</code>
          dans <strong>js/app.js</strong> par vos identifiants Supabase.
        </p>
        <a href="https://supabase.com" target="_blank" style="color:var(--green);font-weight:700;font-size:15px">Créer un projet Supabase →</a>
        <p style="font-size:13px;color:var(--text-light)">Puis exécutez le fichier <strong>supabase-schema.sql</strong> dans l'éditeur SQL de Supabase.</p>
      </div>`;
    return;
  }

  setupNav();

  // Attendre à la fois la session ET le minimum de 1.5s de splash
  const [{ data: { session } }] = await Promise.all([
    db.auth.getSession(),
    new Promise(r => setTimeout(r, 1500))
  ]);

  function setupGlobalChannels(uid) {
    if (state.channelsSubscribed) return;
    state.channelsSubscribed = true;
    db.channel('global-msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        if (payload.new?.sender_id && payload.new.sender_id !== uid) {
          refreshUnreadCount();
        }
      })
      .subscribe();
    db.channel('global-convs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversations',
        filter: `participant_2=eq.${uid}`
      }, () => {
        if (!['messages', 'conversation'].includes(state.view)) {
          showToast('💬 Quelqu\'un a répondu à votre publication !', 'info');
        }
        refreshUnreadCount();
      })
      .subscribe();
    db.channel('global-notifs')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${uid}`
      }, () => {
        refreshNotifCount();
      })
      .subscribe();
  }

  if (session?.user) setupGlobalChannels(session.user.id);

  $loading.classList.add('fade-out');
  setTimeout(() => { $loading.style.display = 'none'; }, 400);
  $app.classList.remove('hidden');

  if (session?.user) {
    state.user = session.user;
    await loadCurrentProfile();
    if (!state.profile?.presence_status) {
      navigate('onboarding');
    } else {
      navigate('feed');
      refreshUnreadCount();
      refreshNotifCount();
      checkExpiryNotifs();
      setInterval(refreshUnreadCount, 30000);
      setInterval(refreshNotifCount, 60000);
    }
  } else {
    navigate('landing');
  }

  // Auth state listener
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      state.user = session.user;
      setupGlobalChannels(session.user.id);
      await loadCurrentProfile();
      if (!state.profile?.presence_status) {
        navigate('onboarding');
      } else if (['login', 'register', 'landing'].includes(state.view)) {
        navigate('feed');
        refreshUnreadCount();
        refreshNotifCount();
        checkExpiryNotifs();
        setInterval(refreshUnreadCount, 30000);
        setInterval(refreshNotifCount, 60000);
      }
    }
    if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      state.channelsSubscribed = false;
      navigate('landing');
    }
  });
}

init();
