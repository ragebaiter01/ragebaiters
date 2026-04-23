/* ============================================================
   Ragebaiters - Zentraler Supabase-Client + Navigations-Helfer
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY ||
    window.SUPABASE_URL.includes('DEIN-PROJEKT')) {
  console.warn('[Ragebaiters] Bitte config.js mit deinen Supabase-Daten fuellen.');
}

const SESSION_PARAM = 'session';
const HANDOFF_PARAM = 'handoff';
const TEST_HANDOFF_PREFIX = 'ragebaiters:test-handoff:';
const TEST_SESSION_META_PREFIX = 'ragebaiters:test-session:';
const PENDING_SESSION_KEY = 'ragebaiters:pending-session';
const currentSessionScope = readCurrentSessionScope();
const isScopedTestSession = currentSessionScope === 'test-account'
  || currentSessionScope.startsWith('test-account-');

export const defaultSupabase = createSupabaseClient();
export const supabase = isScopedTestSession
  ? createScopedClient(currentSessionScope)
  : defaultSupabase;

const handoffReady = consumeScopedLoginHandoff().catch(error => {
  window.__ragebaitersScopedAuthError = error?.message || String(error);
  console.error('[Ragebaiters] Scoped login handoff fehlgeschlagen:', error);
});

// Macht den aktuellen Seiten-Client auch ohne Import verfuegbar
window.supabase = supabase;

/* ----- Session-Helfer ----- */
export async function getSessionUser() {
  await handoffReady;
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

export async function waitForSessionUser(timeoutMs = 2500, stepMs = 125) {
  await handoffReady;

  const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
  let user = await getSessionUser();
  if (user) return user;

  while (Date.now() < deadline) {
    await delay(stepMs);
    user = await getSessionUser();
    if (user) return user;
  }

  return null;
}

export function rememberPendingSession(session) {
  const accessToken = session?.access_token;
  const refreshToken = session?.refresh_token;
  if (!accessToken || !refreshToken) return;

  sessionStorage.setItem(PENDING_SESSION_KEY, JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    createdAt: Date.now()
  }));
}

export async function restorePendingSessionUser(maxAgeMs = 60_000) {
  await handoffReady;

  let payload = null;
  try {
    payload = JSON.parse(sessionStorage.getItem(PENDING_SESSION_KEY) || 'null');
  } catch {
    payload = null;
  }

  if (!payload?.access_token || !payload?.refresh_token) return null;
  if (Date.now() - Number(payload.createdAt || 0) > maxAgeMs) {
    sessionStorage.removeItem(PENDING_SESSION_KEY);
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token
  });

  sessionStorage.removeItem(PENDING_SESSION_KEY);
  if (error) {
    console.error('[Ragebaiters] Pending session konnte nicht wiederhergestellt werden:', error);
    return null;
  }

  return data?.session?.user || data?.user || getSessionUser();
}

export async function getProfile(userId) {
  await handoffReady;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

export async function resolveLoginEmail(identifier) {
  await handoffReady;

  const normalizedIdentifier = String(identifier || '').trim();
  if (!normalizedIdentifier) return '';
  if (normalizedIdentifier.includes('@')) return normalizedIdentifier.toLowerCase();

  const { data, error } = await defaultSupabase.rpc('resolve_login_email', {
    p_identifier: normalizedIdentifier
  });

  if (error) {
    console.error('[Ragebaiters] Benutzername konnte nicht aufgeloest werden:', error);
    return '';
  }

  return String(data || '').trim().toLowerCase();
}

export function createScopedClient(scope) {
  return createSupabaseClient(scope);
}

export function getCurrentSessionScope() {
  return currentSessionScope;
}

export function readScopedSessionMeta(scope = currentSessionScope) {
  const safeScope = normalizeSessionScope(scope);
  if (!safeScope) return null;

  try {
    return JSON.parse(sessionStorage.getItem(`${TEST_SESSION_META_PREFIX}${safeScope}`) || 'null');
  } catch {
    return null;
  }
}

export function clearScopedSessionMeta(scope = currentSessionScope) {
  const safeScope = normalizeSessionScope(scope);
  if (!safeScope) return;
  sessionStorage.removeItem(`${TEST_SESSION_META_PREFIX}${safeScope}`);
}

export function buildScopedUrl(path, scope = currentSessionScope, extraParams = {}) {
  const url = new URL(path, window.location.href);
  const safeScope = normalizeSessionScope(scope);

  if (safeScope) {
    url.searchParams.set(SESSION_PARAM, safeScope);
  } else {
    url.searchParams.delete(SESSION_PARAM);
  }

  url.searchParams.delete(HANDOFF_PARAM);

  Object.entries(extraParams).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
      return;
    }
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

/* ----- SVG-Icons ----- */
const ICON_LOGOUT = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>`;

/* ----- Mobiles Menue ----- */
function setupMobileNav() {
  const nav = document.querySelector('.nav');
  const navLinks = nav?.querySelector('.nav-links');
  if (!nav || !navLinks || nav.dataset.mobileReady === '1') return;

  nav.dataset.mobileReady = '1';

  const titleEl = nav.firstElementChild;
  if (titleEl) {
    titleEl.classList.add('nav-title');

    if (!titleEl.parentElement?.classList.contains('nav-brand')) {
      const brand = document.createElement('div');
      brand.className = 'nav-brand';
      nav.insertBefore(brand, titleEl);
      brand.appendChild(titleEl);
    }
  }

  const brand = nav.querySelector('.nav-brand');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-label', 'Menue oeffnen');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'mobile-navigation');
  toggle.innerHTML = `
    <span class="nav-toggle-bar"></span>
    <span class="nav-toggle-bar"></span>
    <span class="nav-toggle-bar"></span>`;

  if (brand) brand.insertBefore(toggle, brand.firstChild);

  if (!navLinks.id) navLinks.id = 'mobile-navigation';

  const closeMenu = () => {
    nav.classList.remove('is-open');
    navLinks.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Menue oeffnen');
  };

  const openMenu = () => {
    nav.classList.add('is-open');
    navLinks.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Menue schliessen');
  };

  toggle.addEventListener('click', () => {
    if (nav.classList.contains('is-open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  navLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1000) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

/* ----- Navigation + Footer dynamisch ----- */
export async function renderAuthNav(active = '') {
  await handoffReady;

  const nav = document.querySelector('.nav-links');
  const footer = document.querySelector('.footer');

  document.querySelectorAll('[data-auth-link]').forEach(el => el.remove());

  const user = await getSessionUser();

  if (nav && user) {
    const firstSocial = nav.querySelector('.social-icon');
    const wrap = document.createElement('div');
    wrap.dataset.authLink = '1';
    wrap.className = 'floating-login-wrap';
    wrap.innerHTML = `
      <a class="floating-login" href="${escapeAttr(buildScopedUrl('login.html'))}" title="Interner Login" aria-label="Interner Login">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span class="sr-only">Interner Login</span>
      </a>`;
    document.body.appendChild(wrap);

    const logout = document.createElement('a');
    logout.href = '#';
    logout.className = 'social-icon';
    logout.dataset.authLink = '1';
    logout.title = 'Abmelden';
    logout.setAttribute('aria-label', 'Abmelden');
    logout.innerHTML = ICON_LOGOUT;
    logout.addEventListener('click', async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      location.href = currentSessionScope ? buildScopedUrl('login.html') : 'index.html';
    });
    nav.insertBefore(logout, firstSocial);
  }

  if (footer && !user) {
    const wrap = document.createElement('div');
    wrap.dataset.authLink = '1';
    wrap.className = 'footer-auth';
    wrap.innerHTML = `
      <a class="footer-login-link" href="${escapeAttr(buildScopedUrl('login.html'))}" title="Interner Login" aria-label="Interner Login">
        <span class="footer-login-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </span>
        <span class="footer-login-copy">
          <strong>Mitglieder-Login</strong>
          <span>Zum internen Bereich</span>
        </span>
      </a>`;
    footer.appendChild(wrap);
  }
}

/* ----- Auto-Init ----- */
export async function initPage(active = '') {
  await handoffReady;
  setupMobileNav();
  applyScopedLinks();
  await renderAuthNav(active);
  supabase.auth.onAuthStateChange(() => {
    applyScopedLinks();
    renderAuthNav(active);
  });
}

function createSupabaseClient(scope = '') {
  const safeScope = normalizeSessionScope(scope);
  const storageKey = safeScope ? `sb-${resolveProjectRef()}-auth-token-${safeScope}` : undefined;

  return createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        ...(storageKey ? { storageKey } : {})
      },
    }
  );
}

function resolveProjectRef() {
  try {
    const host = new URL(window.SUPABASE_URL).hostname;
    return host.split('.')[0] || 'ragebaiters';
  } catch {
    return 'ragebaiters';
  }
}

function normalizeSessionScope(scope) {
  return String(scope || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 48);
}

function readCurrentSessionScope() {
  const params = new URLSearchParams(window.location.search);
  return normalizeSessionScope(params.get(SESSION_PARAM));
}

async function consumeScopedLoginHandoff() {
  if (!currentSessionScope) return;

  const params = new URLSearchParams(window.location.search);
  const handoffKey = params.get(HANDOFF_PARAM);
  if (!handoffKey) return;

  let payload = null;
  const storageKey = `${TEST_HANDOFF_PREFIX}${handoffKey}`;

  try {
    payload = JSON.parse(localStorage.getItem(storageKey) || 'null');
  } catch {
    payload = null;
  }

  localStorage.removeItem(storageKey);
  params.delete(HANDOFF_PARAM);
  const search = params.toString();
  history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);

  if (!payload) return;
  if (payload.sessionScope && normalizeSessionScope(payload.sessionScope) !== currentSessionScope) return;
  if (Number(payload.expiresAt) && Date.now() > Number(payload.expiresAt)) return;

  storeScopedSessionMeta(currentSessionScope, payload);
  await bootstrapScopedSession(payload);
}

async function bootstrapScopedSession(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const username = String(payload.username || 'testaccount-preview').trim();
  const role = String(payload.role || 'observer').trim().toLowerCase();

  if (!email || !password) return;

  const login = await supabase.auth.signInWithPassword({ email, password });
  if (!login.error) return;

  if (!/invalid login/i.test(login.error.message || '')) {
    throw login.error;
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });

  if (signUpError && !/already registered/i.test(signUpError.message || '')) {
    throw signUpError;
  }

  const { error: prepareError } = await defaultSupabase.rpc('admin_prepare_test_account', {
    p_email: email,
    p_username: username,
    p_role: role
  });

  if (prepareError) {
    throw prepareError;
  }

  if (signUpData?.session) return;

  const retry = await supabase.auth.signInWithPassword({ email, password });
  if (retry.error) {
    throw retry.error;
  }
}

function applyScopedLinks() {
  if (!currentSessionScope) return;

  document.querySelectorAll('a[href]').forEach(link => {
    const rawHref = link.getAttribute('href');
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) return;

    try {
      const url = new URL(rawHref, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (!/\.html$/i.test(url.pathname)) return;

      url.searchParams.set(SESSION_PARAM, currentSessionScope);
      url.searchParams.delete(HANDOFF_PARAM);
      link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Ignoriert ungueltige oder externe Links.
    }
  });
}

function storeScopedSessionMeta(scope, payload) {
  const safeScope = normalizeSessionScope(scope);
  if (!safeScope) return;

  sessionStorage.setItem(`${TEST_SESSION_META_PREFIX}${safeScope}`, JSON.stringify({
    email: String(payload?.email || '').trim().toLowerCase(),
    username: String(payload?.username || '').trim(),
    role: String(payload?.role || '').trim().toLowerCase(),
    expiresAt: Number(payload?.expiresAt || 0) || null
  }));
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
