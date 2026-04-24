import {
  supabase,
  defaultSupabase,
  initPage,
  getSessionUser,
  getProfile,
  buildScopedUrl,
  waitForSessionUser,
  restorePendingSessionUser,
  getCurrentSessionScope,
  readScopedSessionMeta,
  clearScopedSessionMeta
} from './auth.js?v=2026-04-23-1';

await initPage('dashboard');

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const TROLL_IMAGE_CAPTION = 'schabbatt schalom';
const TEST_ACCOUNT_SCOPE = 'test-account';
const TEST_ACCOUNT_SCOPE_PREFIX = 'test-account-';
const TEST_HANDOFF_PREFIX = 'ragebaiters:test-handoff:';
const TEST_ACCOUNT_LIFETIME_MS = 5 * 60 * 1000;
const BANNER_OPTIONS = {
  sponsor: { src: 'images/banner.png', label: 'Sponsor' },
  team: { src: 'images/banner2.png', label: 'Team' }
};

const loadingSection = document.getElementById('loading');
const mainSection = document.getElementById('mainSection');
const helloEl = document.getElementById('hello');
const roleBadge = document.getElementById('roleBadge');
const memberNote = document.getElementById('memberNote');
const tabButtons = [...document.querySelectorAll('.dashboard-tab')];
const viewSections = [...document.querySelectorAll('.dashboard-view')];
const adminOnlyNodes = [...document.querySelectorAll('.role-admin-only, .role-admin-view')];
const memberUpNodes = [...document.querySelectorAll('.role-member-up, .role-member-up-view')];
const welcomeIntro = document.getElementById('welcomeIntro');
const welcomeCapabilities = document.getElementById('welcomeCapabilities');
const openTestAccountBtn = document.getElementById('openTestAccountBtn');
const testAccountMessage = document.getElementById('testAccountMessage');

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const captionInput = document.getElementById('captionInput');
const uploadList = document.getElementById('uploadList');
const myPhotos = document.getElementById('myPhotos');
const countEl = document.getElementById('count');
const pendingReviews = document.getElementById('pendingReviews');

const inviteForm = document.getElementById('inviteForm');
const inviteCodeInput = document.getElementById('inviteCodeInput');
const inviteForInput = document.getElementById('inviteForInput');
const inviteRoleInput = document.getElementById('inviteRoleInput');
const generateInviteBtn = document.getElementById('generateInviteBtn');
const createInviteBtn = document.getElementById('createInviteBtn');
const refreshInvitesBtn = document.getElementById('refreshInvitesBtn');
const inviteRows = document.getElementById('inviteRows');
const inviteMessage = document.getElementById('inviteMessage');
const inviteOpenCount = document.getElementById('inviteOpenCount');
const inviteUsedCount = document.getElementById('inviteUsedCount');
const inviteTotalCount = document.getElementById('inviteTotalCount');

const bannerRadios = [...document.querySelectorAll('input[name="homepageBanner"]')];
const bannerPreview = document.getElementById('bannerPreview');
const saveBannerBtn = document.getElementById('saveBannerBtn');
const bannerMessage = document.getElementById('bannerMessage');
const instagramPostUrlInput = document.getElementById('instagramPostUrlInput');
const instagramImageUrlInput = document.getElementById('instagramImageUrlInput');
const instagramTitleInput = document.getElementById('instagramTitleInput');
const instagramUsernameInput = document.getElementById('instagramUsernameInput');
const instagramPostedAtInput = document.getElementById('instagramPostedAtInput');
const instagramCaptionInput = document.getElementById('instagramCaptionInput');
const saveInstagramBtn = document.getElementById('saveInstagramBtn');
const instagramPreview = document.getElementById('instagramPreview');
const instagramMessage = document.getElementById('instagramMessage');
const teamMembersEditor = document.getElementById('teamMembersEditor');
const addTeamMemberBtn = document.getElementById('addTeamMemberBtn');
const saveTeamMembersBtn = document.getElementById('saveTeamMembersBtn');
const teamMembersMessage = document.getElementById('teamMembersMessage');

const refreshUsersBtn = document.getElementById('refreshUsersBtn');
const usersTitle = document.getElementById('usersTitle');
const usersIntro = document.getElementById('usersIntro');
const userTableHead = document.getElementById('userTableHead');
const userRows = document.getElementById('userRows');
const userMessage = document.getElementById('userMessage');

const state = {
  user: null,
  profile: null,
  role: 'observer',
  isAdmin: false,
  canUpload: false,
  canViewUsers: false,
  teamMembers: [],
  userDirectory: []
};
const currentSessionScope = getCurrentSessionScope();
const isTemporaryTestSession = currentSessionScope === TEST_ACCOUNT_SCOPE
  || currentSessionScope.startsWith(TEST_ACCOUNT_SCOPE_PREFIX);

state.user = await waitForSessionUser();
if (!state.user) {
  state.user = await restorePendingSessionUser();
}
if (!state.user) {
  location.href = buildScopedUrl('login.html');
  throw new Error('redirecting-to-login');
}

state.profile = await getProfile(state.user.id);
if (!state.profile) {
  state.profile = await ensureProfile(state.user);
}

state.role = normalizeRole(state.profile?.role);
state.isAdmin = state.role === 'admin';
state.canUpload = state.role === 'observer' || state.role === 'member' || state.role === 'admin';
state.canViewUsers = state.role === 'member' || state.role === 'admin';

helloEl.textContent = state.profile?.username || state.user.email || 'Mitglied';
roleBadge.textContent = roleLabel(state.role);

if (!state.isAdmin) {
  memberNote.hidden = false;
  adminOnlyNodes.forEach(node => {
    node.hidden = true;
  });
} else {
  adminOnlyNodes.forEach(node => {
    node.hidden = false;
  });
}

if (!state.canUpload && !state.canViewUsers) {
  memberUpNodes.forEach(node => {
    node.hidden = true;
  });
}

setupWelcome();
setupUserSectionCopy();
setupNavigation();
if (state.canUpload) setupUploads();
if (state.canViewUsers) refreshUsersBtn.addEventListener('click', () => loadUsers());
setupAdminActions();
setupTestAccountLifecycle();

loadingSection.hidden = true;
mainSection.hidden = false;

if (state.canUpload) await loadMyPhotos();
if (state.canViewUsers) await loadUsers();
await loadTeamMembers();
if (state.isAdmin) {
  await Promise.all([
    loadPendingReviews(),
    loadInvites(),
    loadBannerSetting(),
    loadInstagramSettings()
  ]);
}

function setupNavigation() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('role-admin-only') && !state.isAdmin) return;
      if (btn.classList.contains('role-member-up') && !state.canUpload && !state.canViewUsers) return;
      setActiveView(btn.dataset.view);
    });
  });

  const initialView = normalizeView((location.hash || '').replace('#', ''));
  setActiveView(initialView);
  window.addEventListener('hashchange', () => {
    setActiveView(normalizeView((location.hash || '').replace('#', '')));
  });
}

function normalizeView(view) {
  const allowed = ['welcome', 'team'];
  if (state.canUpload) allowed.push('uploads');
  if (state.canViewUsers) allowed.push('users');
  if (state.isAdmin) allowed.push('invites', 'banner');
  return allowed.includes(view) ? view : 'welcome';
}

function setActiveView(view) {
  const safeView = normalizeView(view);
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.view === safeView;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
  viewSections.forEach(section => {
    section.hidden = section.id !== `view-${safeView}`;
    section.classList.toggle('is-active', !section.hidden);
  });
  if (location.hash !== `#${safeView}`) {
    history.replaceState(null, '', `#${safeView}`);
  }
}

function setupUploads() {
  dropzone.addEventListener('click', () => fileInput.click());

  ['dragover', 'dragenter'].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });

  dropzone.addEventListener('drop', event => {
    if (event.dataTransfer?.files?.length) handleUploadFiles(event.dataTransfer.files);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleUploadFiles(fileInput.files);
    fileInput.value = '';
  });
}

function setupAdminActions() {
  if (!state.isAdmin) return;

  if (openTestAccountBtn) {
    openTestAccountBtn.addEventListener('click', () => openTestAccountSession());
  }

  generateInviteBtn.addEventListener('click', () => {
    inviteCodeInput.value = buildInviteCode();
    inviteCodeInput.focus();
    inviteCodeInput.select();
  });

  inviteForm.addEventListener('submit', async event => {
    event.preventDefault();
    await createInvite({
      code: inviteCodeInput.value.trim(),
      inviteFor: inviteForInput.value.trim(),
      inviteRole: inviteRoleInput.value
    });
  });

  refreshInvitesBtn.addEventListener('click', () => loadInvites());

  bannerRadios.forEach(radio => {
    radio.addEventListener('change', () => updateBannerPreview(radio.value));
  });

  saveBannerBtn.addEventListener('click', () => saveBannerSetting());
  saveTeamMembersBtn?.addEventListener('click', () => saveTeamMembers());
  saveInstagramBtn.addEventListener('click', () => saveInstagramSettings());

  [
    instagramPostUrlInput,
    instagramImageUrlInput,
    instagramTitleInput,
    instagramUsernameInput,
    instagramPostedAtInput,
    instagramCaptionInput
  ].forEach(field => {
    field?.addEventListener('input', () => updateInstagramPreview());
  });
}

async function openTestAccountSession() {
  const pendingTab = window.open('about:blank', '_blank');
  setMessage(testAccountMessage, 'Testaccount wird vorbereitet...', 'info');

  try {
    const { data, error } = await supabase.rpc('admin_get_test_account_access');
    if (error) throw error;

    const access = Array.isArray(data) ? data[0] : data;
    if (!access?.email || !access?.password) {
      throw new Error('Testaccount-Zugang konnte nicht geladen werden.');
    }

    clearExpiredTestAccountHandoffs();
    const sessionScope = String(access.session_scope || TEST_ACCOUNT_SCOPE).trim() || TEST_ACCOUNT_SCOPE;
    const expiresAt = access.expires_at
      ? new Date(access.expires_at).getTime()
      : Date.now() + TEST_ACCOUNT_LIFETIME_MS;

    const handoffId = createTestAccountHandoffId();
    localStorage.setItem(`${TEST_HANDOFF_PREFIX}${handoffId}`, JSON.stringify({
      sessionScope,
      email: access.email,
      password: access.password,
      username: access.username,
      role: access.role,
      expiresAt
    }));

    const targetUrl = buildScopedUrl('dashboard.html', sessionScope, { handoff: handoffId });
    if (pendingTab && !pendingTab.closed) {
      pendingTab.location = targetUrl;
    } else {
      window.open(targetUrl, '_blank');
    }

    setMessage(
      testAccountMessage,
      'Testaccount im neuen Tab geöffnet. Er wird nach 5 Minuten automatisch ersetzt, dein Admin-Login bleibt hier aktiv.',
      'success'
    );
  } catch (error) {
    if (pendingTab && !pendingTab.closed) pendingTab.close();
    const message = mapTestAccountError(error);
    setMessage(
      testAccountMessage,
      `Testaccount konnte nicht geöffnet werden: ${message}`,
      'error'
    );
  }
}

function setupTestAccountLifecycle() {
  if (!isTemporaryTestSession) return;

  const meta = readScopedSessionMeta(currentSessionScope);
  const expiresAt = Number(meta?.expiresAt || 0);
  if (!expiresAt) return;

  const rotateInMs = Math.max(0, expiresAt - Date.now());
  window.setTimeout(() => {
    rotateTestAccountSession();
  }, rotateInMs);
}

async function rotateTestAccountSession() {
  if (!isTemporaryTestSession) return;

  try {
    clearScopedSessionMeta(currentSessionScope);

    const { data, error } = await defaultSupabase.rpc('admin_rotate_test_account_access', {
      p_previous_session_scope: currentSessionScope
    });
    if (error) throw error;

    const access = Array.isArray(data) ? data[0] : data;
    if (!access?.email || !access?.password) {
      throw new Error('Neuer Testaccount konnte nicht erstellt werden.');
    }

    clearExpiredTestAccountHandoffs();

    const handoffId = createTestAccountHandoffId();
    const nextScope = String(access.session_scope || TEST_ACCOUNT_SCOPE).trim() || TEST_ACCOUNT_SCOPE;
    const expiresAt = access.expires_at
      ? new Date(access.expires_at).getTime()
      : Date.now() + TEST_ACCOUNT_LIFETIME_MS;

    localStorage.setItem(`${TEST_HANDOFF_PREFIX}${handoffId}`, JSON.stringify({
      sessionScope: nextScope,
      email: access.email,
      password: access.password,
      username: access.username,
      role: access.role,
      expiresAt
    }));

    await supabase.auth.signOut();
    location.replace(buildScopedUrl('dashboard.html', nextScope, { handoff: handoffId }));
  } catch (error) {
    console.error('[Ragebaiters] Testaccount-Rotation fehlgeschlagen:', error);
    await supabase.auth.signOut().catch(() => {});
    alert(`Testaccount konnte nicht automatisch erneuert werden: ${mapTestAccountError(error)}`);
    location.replace(buildScopedUrl('login.html', ''));
  }
}

function setupWelcome() {
  const introByRole = {
    observer: 'Du bist als Beobachter eingeloggt. Du kannst Bilder hochladen, diese müssen aber erst von einem Admin freigegeben werden.',
    member: 'Du bist als Mitglied eingeloggt. Du kannst Bilder hochladen und die Mitgliederliste ansehen.',
    admin: 'Du bist als Admin eingeloggt. Alle Bereiche des Dashboards stehen dir vollständig zur Verfügung.'
  };

  welcomeIntro.textContent = introByRole[state.role] || introByRole.observer;

  const cards = [
    capabilityCard('Willkommensbereich', 'Immer sichtbar', 'Deine aktuelle Rolle und deine freigeschalteten Bereiche.'),
    capabilityCard(
      'Uploads',
      state.canUpload ? 'Freigeschaltet' : 'Gesperrt',
      state.role === 'observer'
        ? 'Bilder hochladen. Ein Admin muss sie freigeben, bevor sie öffentlich erscheinen.'
        : state.canUpload
          ? 'Bilder hochladen und eigene Uploads verwalten.'
          : 'Nur für Mitglieder, Beobachter und Admins freigeschaltet.'
    ),
    capabilityCard(
      'Mitglieder',
      state.canViewUsers ? 'Freigeschaltet' : 'Gesperrt',
      state.canViewUsers
        ? (state.isAdmin ? 'Alle Benutzer sehen und verwalten.' : 'Mitgliederliste in reiner Lesesicht.')
        : 'Nur für Mitglieder und Admins freigeschaltet.'
    ),
    capabilityCard(
      'Admin-Funktionen',
      state.isAdmin ? 'Freigeschaltet' : 'Gesperrt',
      state.isAdmin ? 'Einladungscodes, Banner und Benutzerverwaltung komplett verfügbar.' : 'Nur für Admins sichtbar.'
    )
  ];

  welcomeCapabilities.innerHTML = cards.join('');
}

function setupUserSectionCopy() {
  if (state.isAdmin) {
    usersTitle.textContent = 'Benutzerverwaltung';
    usersIntro.textContent = 'Alle Benutzer ansehen, Rollen anpassen, Benutzernamen ändern und Accounts löschen.';
    return;
  }

  usersTitle.textContent = 'Mitglieder';
  usersIntro.textContent = 'Hier kannst du alle Benutzer der Website ansehen. Bearbeiten ist für Mitglieder nicht möglich.';
}

function handleUploadFiles(files) {
  const caption = captionInput.value.trim().slice(0, 500);
  [...files].forEach(file => uploadOne(file, caption));
}

async function uploadOne(file, caption) {
  const row = document.createElement('div');
  row.className = 'upload-row';
  row.innerHTML = `
    <div class="upload-row-name">${escapeHtml(file.name)}</div>
    <div class="upload-row-bar"><span></span></div>
    <div class="upload-row-status">0 %</div>`;
  uploadList.appendChild(row);

  const bar = row.querySelector('.upload-row-bar span');
  const status = row.querySelector('.upload-row-status');

  if (!ALLOWED_MIME.includes(file.type)) return failUpload(row, status, 'Dateityp nicht erlaubt');
  if (file.size > MAX_BYTES) return failUpload(row, status, 'Datei zu gross (max. 8 MB)');

  bar.style.width = '30%';
  status.textContent = '30 %';

  const dims = await readImageDims(file).catch(() => ({ width: null, height: null }));
  const title = stripExt(file.name).slice(0, 160);
  const finalCaption = caption || null;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const key = `${state.user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(key, file, { cacheControl: '3600', contentType: file.type });

  if (uploadError) return failUpload(row, status, uploadError.message);

  bar.style.width = '70%';
  status.textContent = '70 %';

  const { error: dbError } = await supabase.rpc('create_photo_upload', {
    p_storage_path: key,
    p_title: title,
    p_caption: finalCaption,
    p_size_bytes: file.size,
    p_width: dims.width,
    p_height: dims.height
  });

  if (dbError) return failUpload(row, status, dbError.message);

  bar.style.width = '100%';
  status.textContent = 'fertig';
  row.classList.add('is-done');

  if (captionInput.value.trim() === caption) captionInput.value = '';

  setTimeout(loadMyPhotos, 400);
  if (state.isAdmin) setTimeout(loadPendingReviews, 400);
}

function failUpload(row, status, message) {
  status.textContent = `Fehler: ${message}`;
  row.classList.add('is-error');
}

async function loadMyPhotos() {
  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, title, caption, uploaded_at, visibility')
    .eq('user_id', state.user.id)
    .order('uploaded_at', { ascending: false });

  if (error) {
    myPhotos.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  countEl.textContent = data.length;

  if (!data.length) {
    myPhotos.innerHTML = '<div class="card" style="text-align:center; color: var(--muted);">Noch keine Bilder hochgeladen.</div>';
    return;
  }

  myPhotos.innerHTML = '<div class="photo-grid"></div>';
  const grid = myPhotos.querySelector('.photo-grid');

  for (const photo of data) {
    const publicUrl = resolvePhotoUrl(photo.storage_path);
    const fig = document.createElement('figure');
    fig.className = 'photo-item';

    const actions = state.isAdmin
      ? `<button class="btn-delete" type="button" data-id="${photo.id}" data-path="${encodeURIComponent(photo.storage_path)}" title="Löschen">x</button>`
      : '';

    fig.innerHTML = `
      <a href="${publicUrl}" target="_blank" rel="noopener">
        <img src="${publicUrl}" alt="${escapeHtml(photo.title || '')}" loading="lazy">
      </a>
      <figcaption>
        <div class="photo-copy">
          <span>${escapeHtml(photo.title || '')}</span>
          ${photo.caption ? `<small>${escapeHtml(photo.caption)}</small>` : ''}
          <small>Status: ${escapeHtml(photoStatusLabel(photo.visibility))}</small>
        </div>
        ${actions}
      </figcaption>`;

    grid.appendChild(fig);
  }

  grid.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Dieses Foto wirklich löschen?')) return;

      const id = Number(btn.dataset.id);
      const path = decodeURIComponent(btn.dataset.path);

      if (!isLocalPhotoPath(path)) {
        const { error: storageError } = await supabase.storage.from('photos').remove([path]);
        if (storageError && !/not found|no such object|not exists/i.test(storageError.message || '')) {
          return alert(storageError.message);
        }
      }

      const { data: deleted, error: dbError } = await supabase.rpc('admin_delete_photo', {
        p_photo_id: id
      });

      if (dbError) return alert(dbError.message);
      if (!deleted) return alert('Foto konnte nicht gelöscht werden.');

      loadMyPhotos();
      if (state.isAdmin) loadPendingReviews();
    });
  });
}

async function loadPendingReviews() {
  if (!state.isAdmin || !pendingReviews) return;

  pendingReviews.innerHTML = '<div class="card" style="text-align:center; color: var(--muted);">Prüfe Uploads...</div>';

  const { data, error } = await supabase
    .from('photos')
    .select('id, storage_path, title, caption, uploaded_at, visibility, user_id')
    .eq('visibility', 'pending_review')
    .order('uploaded_at', { ascending: false });

  if (error) {
    pendingReviews.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data?.length) {
    pendingReviews.innerHTML = '<div class="card" style="text-align:center; color: var(--muted);">Keine Uploads warten auf Freigabe.</div>';
    return;
  }

  const userIds = [...new Set(data.map(photo => photo.user_id).filter(Boolean))];
  const authorsById = {};

  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    (profiles || []).forEach(profile => {
      authorsById[profile.id] = profile.username || 'Unbekannt';
    });
  }

  pendingReviews.innerHTML = '<div class="photo-grid"></div>';
  const grid = pendingReviews.querySelector('.photo-grid');

  for (const photo of data) {
    const publicUrl = resolvePhotoUrl(photo.storage_path);
    const fig = document.createElement('figure');
    fig.className = 'photo-item';
    fig.innerHTML = `
      <a href="${publicUrl}" target="_blank" rel="noopener">
        <img src="${publicUrl}" alt="${escapeHtml(photo.title || '')}" loading="lazy">
      </a>
      <figcaption>
        <div class="photo-copy">
          <span>${escapeHtml(photo.title || '')}</span>
          ${photo.caption ? `<small>${escapeHtml(photo.caption)}</small>` : ''}
          <small>von ${escapeHtml(authorsById[photo.user_id] || 'Unbekannt')}</small>
          <small>${formatDateTime(photo.uploaded_at)}</small>
        </div>
        <div class="table-actions">
          <button class="btn-tertiary" type="button" data-action="approve" data-id="${photo.id}">Freigeben</button>
          <button class="btn-danger" type="button" data-action="troll" data-id="${photo.id}">Troll</button>
          <button class="btn-danger" type="button" data-action="delete-review" data-id="${photo.id}" data-path="${encodeURIComponent(photo.storage_path)}">Löschen</button>
        </div>
      </figcaption>`;
    grid.appendChild(fig);
  }

  grid.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const photoId = Number(btn.dataset.id);
      const { data: approved, error: updateError } = await supabase.rpc('admin_approve_photo', {
        p_photo_id: photoId
      });
      if (updateError) return alert(updateError.message);
      if (!approved) return alert('Upload konnte nicht freigegeben werden.');
      await Promise.all([loadPendingReviews(), loadMyPhotos()]);
    });
  });

  grid.querySelectorAll('[data-action="troll"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const photoId = Number(btn.dataset.id);
      const { data: trolled, error: updateError } = await supabase.rpc('admin_mark_photo_as_troll', {
        p_photo_id: photoId
      });
      if (updateError) return alert(updateError.message);
      if (!trolled) return alert('Upload konnte nicht als Troll-Post markiert werden.');
      await Promise.all([loadPendingReviews(), loadMyPhotos()]);
    });
  });

  grid.querySelectorAll('[data-action="delete-review"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const photoId = Number(btn.dataset.id);
      const photoPath = decodeURIComponent(btn.dataset.path || '');
      if (!confirm('Diesen Upload wirklich löschen?')) return;

      if (photoPath && !isLocalPhotoPath(photoPath)) {
        const { error: storageError } = await supabase.storage.from('photos').remove([photoPath]);
        if (storageError && !/not found|no such object|not exists/i.test(storageError.message || '')) {
          return alert(storageError.message);
        }
      }

      const { data: deleted, error: deleteError } = await supabase.rpc('admin_delete_photo', {
        p_photo_id: photoId
      });

      if (deleteError) return alert(deleteError.message);
      if (!deleted) return alert('Upload konnte nicht gelöscht werden.');

      await Promise.all([loadPendingReviews(), loadMyPhotos()]);
    });
  });
}

async function createInvite({ code, inviteFor, inviteRole }) {
  setMessage(inviteMessage, '', 'info', true);

  const normalized = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9_.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  createInviteBtn.disabled = true;

  const { data, error } = await supabase.rpc('admin_create_invite', {
    p_code: normalized || null,
    p_for: inviteFor || null,
    p_role: inviteRole || 'member'
  });

  createInviteBtn.disabled = false;

  if (error) {
    setMessage(inviteMessage, `Code konnte nicht erstellt werden: ${error.message}`, 'error');
    return;
  }

  inviteForm.reset();
  inviteCodeInput.value = data || '';
  setMessage(inviteMessage, `Code erstellt: ${data}`, 'success');
  await loadInvites();
}

async function loadInvites() {
  inviteRows.innerHTML = '<tr><td colspan="8" class="table-empty">Einladungscodes werden geladen...</td></tr>';

  const { data, error } = await supabase.rpc('admin_list_invites');

  if (error) {
    inviteRows.innerHTML = `<tr><td colspan="8" class="table-empty">Fehler: ${escapeHtml(error.message)}</td></tr>`;
    setMessage(inviteMessage, `Invite-Liste konnte nicht geladen werden: ${error.message}`, 'error');
    return;
  }

  const invites = data || [];
  const usedCount = invites.filter(invite => invite.is_used).length;

  inviteOpenCount.textContent = String(invites.length - usedCount);
  inviteUsedCount.textContent = String(usedCount);
  inviteTotalCount.textContent = String(invites.length);

  if (!invites.length) {
    inviteRows.innerHTML = '<tr><td colspan="8" class="table-empty">Noch keine Einladungscodes vorhanden.</td></tr>';
    return;
  }

  inviteRows.innerHTML = invites.map(invite => `
    <tr>
      <td><code>${escapeHtml(invite.code)}</code></td>
      <td>${escapeHtml(invite.invite_for || '-')}</td>
      <td><span class="status-pill role-${normalizeRole(invite.invite_role)}">${roleLabel(invite.invite_role)}</span></td>
      <td><span class="status-pill ${invite.is_used ? 'used' : 'open'}">${invite.is_used ? 'Genutzt' : 'Offen'}</span></td>
      <td>${formatDateTime(invite.created_at)}</td>
      <td>${escapeHtml(invite.used_by_username || '-')}</td>
      <td>${invite.used_at ? formatDateTime(invite.used_at) : '-'}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-tertiary" data-action="copy" data-code="${escapeHtmlAttr(invite.code)}">Kopieren</button>
          <button type="button" class="btn-danger" data-action="delete-invite" data-code="${escapeHtmlAttr(invite.code)}">Löschen</button>
        </div>
      </td>
    </tr>`).join('');

  inviteRows.querySelectorAll('[data-action="copy"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      try {
        await navigator.clipboard.writeText(code);
        setMessage(inviteMessage, `Code kopiert: ${code}`, 'success');
      } catch {
        setMessage(inviteMessage, `Bitte manuell kopieren: ${code}`, 'info');
      }
    });
  });

  inviteRows.querySelectorAll('[data-action="delete-invite"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code;
      if (!confirm(`Einladungscode ${code} wirklich löschen?`)) return;

      const { error: deleteError } = await supabase.rpc('admin_delete_invite', { p_code: code });

      if (deleteError) {
        setMessage(inviteMessage, `Code konnte nicht gelöscht werden: ${deleteError.message}`, 'error');
        return;
      }

      setMessage(inviteMessage, `Code gelöscht: ${code}`, 'success');
      await loadInvites();
    });
  });
}

async function loadBannerSetting() {
  const { data, error } = await supabase.rpc('get_homepage_banner');

  if (error) {
    setMessage(bannerMessage, `Banner-Einstellung konnte nicht geladen werden: ${error.message}`, 'error');
    updateBannerPreview('team');
    return;
  }

  const variant = data in BANNER_OPTIONS ? data : 'team';
  const radio = bannerRadios.find(entry => entry.value === variant);
  if (radio) radio.checked = true;
  updateBannerPreview(variant);
}

async function saveBannerSetting() {
  const selected = bannerRadios.find(radio => radio.checked)?.value || 'team';
  const { error } = await supabase.rpc('admin_set_homepage_banner', { p_variant: selected });

  if (error) {
    setMessage(bannerMessage, `Banner konnte nicht gespeichert werden: ${error.message}`, 'error');
    return;
  }

  updateBannerPreview(selected);
  setMessage(bannerMessage, `Startseiten-Banner gespeichert: ${BANNER_OPTIONS[selected].label}`, 'success');
}

function updateBannerPreview(variant) {
  const config = BANNER_OPTIONS[variant] || BANNER_OPTIONS.team;
  bannerPreview.src = config.src;
  bannerPreview.alt = `${config.label} Banner Vorschau`;
}

async function loadInstagramSettings() {
  const { data, error } = await supabase.rpc('get_homepage_instagram_post');

  if (error) {
    setMessage(instagramMessage, `Instagram-Einstellung konnte nicht geladen werden: ${error.message}`, 'error');
    updateInstagramPreview();
    return;
  }

  const post = Array.isArray(data) ? data[0] : data;
  instagramPostUrlInput.value = String(post?.post_url || '');
  instagramImageUrlInput.value = String(post?.image_url || '');
  instagramTitleInput.value = String(post?.title || '');
  instagramUsernameInput.value = String(post?.username || 'die_ragebaiters');
  instagramCaptionInput.value = String(post?.caption || '');
  instagramPostedAtInput.value = toDateTimeLocalValue(post?.posted_at);

  updateInstagramPreview();
  setMessage(instagramMessage, '', 'info', true);
}

async function saveInstagramSettings() {
  const payload = collectInstagramFormValues();

  if (!payload.postUrl) {
    setMessage(instagramMessage, 'Bitte mindestens den Instagram-Link eintragen.', 'error');
    return;
  }

  if (payload.postUrl && !isProbablyUrl(payload.postUrl)) {
    setMessage(instagramMessage, 'Bitte einen gültigen Instagram-Link eintragen.', 'error');
    return;
  }

  if (payload.imageUrl && !isProbablyUrl(payload.imageUrl)) {
    setMessage(instagramMessage, 'Bitte eine gültige direkte Bild- oder Cover-URL eintragen.', 'error');
    return;
  }

  const { error } = await supabase.rpc('admin_set_homepage_instagram_post', {
    p_post_url: payload.postUrl,
    p_image_url: payload.imageUrl,
    p_title: payload.title,
    p_caption: payload.caption,
    p_posted_at: payload.postedAt || null,
    p_username: payload.username || 'die_ragebaiters'
  });

  if (error) {
    setMessage(instagramMessage, `Instagram-Beitrag konnte nicht gespeichert werden: ${error.message}`, 'error');
    return;
  }

  updateInstagramPreview();
  setMessage(instagramMessage, 'Instagram-Beitrag für die Startseite gespeichert.', 'success');
}

async function loadTeamMembers() {
  const { data, error } = await supabase.rpc('get_team_members');

  if (error) {
    state.teamMembers = defaultTeamMembers();
    renderTeamMembersEditor();
    setMessage(teamMembersMessage, `Team-Daten konnten nicht geladen werden: ${error.message}`, 'error');
    return;
  }

  state.teamMembers = normalizeTeamMembers(data);
  renderTeamMembersEditor();
  setMessage(teamMembersMessage, '', 'info', true);
}

async function saveTeamMembers() {
  const payload = normalizeTeamMembers(state.teamMembers);

  if (!payload.length) {
    setMessage(teamMembersMessage, 'Bitte mindestens ein Team-Mitglied hinterlegen.', 'error');
    return;
  }

  const { error } = await supabase.rpc('admin_set_team_members', { p_members: payload });
  if (error) {
    setMessage(teamMembersMessage, `Team konnte nicht gespeichert werden: ${error.message}`, 'error');
    return;
  }

  state.teamMembers = payload;
  renderTeamMembersEditor();
  setMessage(teamMembersMessage, 'Team-Daten gespeichert.', 'success');
}

function renderTeamMembersEditor() {
  if (!teamMembersEditor) return;

  const members = normalizeTeamMembers(state.teamMembers);
  state.teamMembers = members;

  if (!members.length) {
    teamMembersEditor.innerHTML = '<div class="table-empty">Noch keine Team-Mitglieder hinterlegt.</div>';
    return;
  }

  teamMembersEditor.innerHTML = members.map(member => `
    <article class="team-editor-card ${member.is_leader ? 'is-leader' : ''}" data-member-id="${escapeHtmlAttr(member.id)}">
      <div class="team-editor-head">
        <div>
          <strong>${escapeHtml(member.name || 'Unbenanntes Mitglied')}</strong>
        </div>
        <div class="team-editor-badges">
          <span class="team-editor-badge ${member.is_leader ? 'is-leader' : ''}">${member.is_leader ? 'Teamführung' : 'Operator'}</span>
          <span class="team-editor-badge">Sortierung ${member.sort_order}</span>
        </div>
      </div>
      <div class="team-editor-layout">
        <div class="team-editor-media">
          <img class="team-editor-image" src="${escapeHtmlAttr(resolveTeamMemberImage(member.image_url))}" alt="${escapeHtmlAttr(member.name || 'Teammitglied')}" data-preview-image onerror="this.src='images/logo.png'">
          <div class="team-editor-actions">
            <button type="button" class="btn-secondary" data-action="choose-team-image">Bild auswählen</button>
            <input class="team-editor-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-action="team-image-file">
          </div>
          <div class="team-editor-note">Empfohlen: quadratisches Bild als JPG, PNG, WebP oder GIF.</div>
        </div>
        <div class="team-editor-meta">
          <div class="form-row form-row-two">
            <label class="field">
              <span>Name</span>
              <input type="text" value="${escapeHtmlAttr(member.name)}" data-field="name" maxlength="120">
            </label>
            <label class="field">
              <span>Rolle</span>
              <input type="text" value="${escapeHtmlAttr(member.role)}" data-field="role" maxlength="80">
            </label>
          </div>
          <div class="form-row form-row-two">
            <label class="field">
              <span>Bild-URL</span>
              <input type="text" value="${escapeHtmlAttr(member.image_url)}" data-field="image_url" maxlength="500">
            </label>
            <label class="field">
              <span>Sortierung</span>
              <input type="number" value="${escapeHtmlAttr(member.sort_order)}" data-field="sort_order" min="1" max="999">
            </label>
          </div>
          <label class="team-editor-toggle">
            <input type="checkbox" data-field="is_leader" ${member.is_leader ? 'checked' : ''}>
            <span>Zur Teamführung zählen</span>
          </label>
          <label class="field">
            <span>Beschreibung</span>
            <textarea class="upload-caption-input" maxlength="500" data-field="description" placeholder="Beschreibung für die Team-Seite.">${escapeHtml(member.description)}</textarea>
          </label>
        </div>
      </div>
    </article>`).join('');

  teamMembersEditor.querySelectorAll('[data-field]').forEach(field => {
    const eventName = field.type === 'checkbox' || field.dataset.field === 'sort_order' ? 'change' : 'input';
    field.addEventListener(eventName, () => {
      const card = field.closest('[data-member-id]');
      updateTeamMemberField(
        card?.dataset.memberId,
        field.dataset.field,
        field.type === 'checkbox' ? field.checked : field.value,
        field
      );
    });
  });

  teamMembersEditor.querySelectorAll('[data-action="choose-team-image"]').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('[data-member-id]');
      card?.querySelector('[data-action="team-image-file"]')?.click();
    });
  });

  teamMembersEditor.querySelectorAll('[data-action="team-image-file"]').forEach(input => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;

      const card = input.closest('[data-member-id]');
      await uploadTeamMemberImage(card?.dataset.memberId, file);
    });
  });
}

function updateTeamMemberField(memberId, field, value, inputNode = null) {
  if (!memberId || !field) return;

  state.teamMembers = state.teamMembers.map(member => {
    if (member.id !== memberId) return member;

    return {
      ...member,
      [field]: field === 'is_leader'
        ? Boolean(value)
        : field === 'sort_order'
          ? Number(value || member.sort_order || 0)
          : String(value ?? '')
    };
  });

  if (field === 'image_url' && inputNode) {
    const card = inputNode.closest('[data-member-id]');
    const preview = card?.querySelector('[data-preview-image]');
    if (preview) preview.src = resolveTeamMemberImage(String(value || '').trim());
  }

  if (field === 'is_leader' || field === 'sort_order') {
    renderTeamMembersEditor();
  }
}

async function uploadTeamMemberImage(memberId, file) {
  if (!memberId || !file) return;

  if (!ALLOWED_MIME.includes(file.type)) {
    setMessage(teamMembersMessage, 'Dateityp für Team-Bilder nicht erlaubt.', 'error');
    return;
  }

  if (file.size > MAX_BYTES) {
    setMessage(teamMembersMessage, 'Team-Bild ist zu gross (max. 8 MB).', 'error');
    return;
  }

  const member = state.teamMembers.find(entry => entry.id === memberId);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const key = `team-members/${slugify(member?.name || memberId)}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(key, file, { cacheControl: '3600', contentType: file.type, upsert: true });

  if (uploadError) {
    setMessage(teamMembersMessage, `Team-Bild konnte nicht hochgeladen werden: ${uploadError.message}`, 'error');
    return;
  }

  const previousPath = resolveStoragePathFromPublicUrl(member?.image_url || '');
  if (previousPath?.startsWith('team-members/') && previousPath !== key) {
    await supabase.storage.from('photos').remove([previousPath]).catch(() => {});
  }

  const { data: publicData } = supabase.storage.from('photos').getPublicUrl(key);
  updateTeamMemberField(memberId, 'image_url', publicData.publicUrl);
  renderTeamMembersEditor();
  setMessage(teamMembersMessage, 'Team-Bild hochgeladen. Bitte noch auf "Team speichern" klicken.', 'success');
}

function normalizeTeamMembers(rawMembers) {
  const source = Array.isArray(rawMembers) ? rawMembers : Array.isArray(rawMembers?.data) ? rawMembers.data : defaultTeamMembers();

  return source
    .map((member, index) => ({
      id: String(member?.id || `member-${index + 1}`).trim() || `member-${index + 1}`,
      name: String(member?.name || '').trim(),
      role: String(member?.role || '').trim(),
      description: String(member?.description || member?.desc || '').trim(),
      image_url: String(member?.image_url || member?.img || '').trim(),
      is_leader: Boolean(member?.is_leader),
      sort_order: Number(member?.sort_order || (index + 1) * 10) || (index + 1) * 10
    }))
    .sort((a, b) => {
      if (Number(a.is_leader) !== Number(b.is_leader)) {
        return Number(b.is_leader) - Number(a.is_leader);
      }
      return a.sort_order - b.sort_order;
    });
}

function defaultTeamMembers() {
  return [
    { id: 'ben', name: 'Yotzek (Ben)', role: 'Teamführer', description: 'Ben koordiniert die Truppe und bewahrt selbst im Gefecht einen kühlen Kopf.', image_url: 'images/benf.png', is_leader: true, sort_order: 10 },
    { id: 'jason', name: 'sneiper0 (Jason)', role: 'Sniper', description: 'Präzisionsschütze der Ragebaiters.', image_url: 'images/logo.png', is_leader: false, sort_order: 20 },
    { id: 'michael', name: 'MundMbrothers (Michael)', role: 'Medic', description: 'Sorgt für die Einsatzfähigkeit des Teams.', image_url: 'images/michi2.png', is_leader: false, sort_order: 30 },
    { id: 'nils', name: 'Disccave (Nils)', role: 'Breacher / OG', description: 'Einer der OGs. Experte für Improvisation.', image_url: 'images/nils.png', is_leader: false, sort_order: 40 },
    { id: 'nathan', name: 'Nathan Goldstein (Nathan)', role: 'Support', description: 'Gibt Feuerschutz mit hohem Munitionsdurchsatz.', image_url: 'images/nathan.png', is_leader: false, sort_order: 50 },
    { id: 'riccardo', name: 'Gemeral Richard (Riccardo)', role: 'Breacher', description: 'Spezialist für CQB.', image_url: 'images/riccardo.png', is_leader: false, sort_order: 60 },
    { id: 'wolfgang', name: 'Wolfgang', role: 'Techniker', description: 'Hält die Markierer am Laufen.', image_url: 'images/wolfgang.png', is_leader: false, sort_order: 70 }
  ];
}

function resolveTeamMemberImage(path) {
  return path || 'images/logo.png';
}

function resolveStoragePathFromPublicUrl(url) {
  const normalized = String(url || '').trim();
  if (!normalized || !window.SUPABASE_URL) return '';

  try {
    const publicPrefix = `${new URL(window.SUPABASE_URL).origin}/storage/v1/object/public/photos/`;
    if (!normalized.startsWith(publicPrefix)) return '';
    return decodeURIComponent(normalized.slice(publicPrefix.length));
  } catch {
    return '';
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'team-member';
}

function updateInstagramPreview() {
  if (!instagramPreview) return;

  const payload = collectInstagramFormValues();
  const hasPost = Boolean(payload.postUrl || payload.imageUrl || payload.title || payload.caption);

  if (!hasPost) {
    instagramPreview.innerHTML = buildInstagramPreviewPlaceholder();
    return;
  }

  const isReel = /instagram\.com\/(reel|p)\//i.test(payload.postUrl) && /\/reel\//i.test(payload.postUrl);
  const fallbackTitle = isReel ? 'Neuester Instagram-Reel' : 'Neuester Instagram-Beitrag';

  const imageMarkup = payload.imageUrl
    ? `<img class="instagram-post-image" src="${escapeHtmlAttr(payload.imageUrl)}" alt="${escapeHtmlAttr(payload.title || 'Instagram-Vorschau')}">`
    : `
      <div class="instagram-post-placeholder-inner">
        <strong>${escapeHtml(payload.username || 'die_ragebaiters')}</strong>
        <span>Cover-Bild fehlt noch</span>
      </div>`;

  const primaryAction = payload.postUrl
    ? `<a href="${escapeHtmlAttr(payload.postUrl)}" target="_blank" rel="noopener">Beitrag ansehen</a>`
    : `<span class="btn-secondary" style="pointer-events:none;">Link fehlt noch</span>`;

  instagramPreview.innerHTML = `
    <article class="card instagram-post-card">
      <div class="instagram-post-grid">
        <div class="instagram-post-image-wrap ${payload.imageUrl ? '' : 'instagram-post-placeholder'}">
          ${imageMarkup}
          <span class="instagram-post-badge">Instagram</span>
        </div>
        <div class="instagram-post-copy">
          <span class="instagram-post-kicker">Vorschau</span>
          <h3>${escapeHtml(payload.title || fallbackTitle)}</h3>
          <p>${escapeHtml(payload.caption || 'Hier erscheint dein hinterlegter Instagram-Beitrag im Look der Startseite.')}</p>
          <div class="instagram-post-meta">
            <span>@${escapeHtml(payload.username || 'die_ragebaiters')}</span>
            <span>${escapeHtml(formatInstagramPreviewDate(payload.postedAt))}</span>
          </div>
          <div class="instagram-post-actions">
            ${primaryAction}
            <a class="instagram-post-secondary" href="https://www.instagram.com/die_ragebaiters/" target="_blank" rel="noopener">Profil öffnen</a>
          </div>
        </div>
      </div>
    </article>`;
}

function buildInstagramPreviewPlaceholder() {
  return `
    <article class="card instagram-post-card instagram-post-card-empty">
      <div class="instagram-post-grid">
        <div class="instagram-post-image-wrap instagram-post-placeholder">
          <span class="instagram-post-badge">Instagram</span>
          <div class="instagram-post-placeholder-inner">
            <strong>die_ragebaiters</strong>
            <span>Noch kein Beitrag eingetragen</span>
          </div>
        </div>
        <div class="instagram-post-copy">
          <span class="instagram-post-kicker">Vorschau</span>
          <h3>Neuester Instagram-Beitrag</h3>
          <p>Trage oben einen Link, ein Cover-Bild und optional Titel oder Text ein. Danach erscheint die Karte genauso auf der Startseite.</p>
          <div class="instagram-post-meta">
            <span>@die_ragebaiters</span>
            <span>Wartet auf Eingabe</span>
          </div>
        </div>
      </div>
    </article>`;
}

function collectInstagramFormValues() {
  return {
    postUrl: String(instagramPostUrlInput?.value || '').trim(),
    imageUrl: String(instagramImageUrlInput?.value || '').trim(),
    title: String(instagramTitleInput?.value || '').trim(),
    username: String(instagramUsernameInput?.value || '').trim(),
    postedAt: String(instagramPostedAtInput?.value || '').trim(),
    caption: String(instagramCaptionInput?.value || '').trim()
  };
}

function toDateTimeLocalValue(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatInstagramPreviewDate(value) {
  if (!value) return 'Neuester Beitrag';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Neuester Beitrag';

  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isProbablyUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadUsers() {
  if (!state.canViewUsers) return;

  if (state.isAdmin) {
    userTableHead.innerHTML = `
      <tr>
        <th>Benutzer</th>
        <th>E-Mail</th>
        <th>Rolle</th>
        <th>Erstellt</th>
        <th>Letzter Login</th>
        <th>Aktionen</th>
      </tr>`;
    userRows.innerHTML = '<tr><td colspan="6" class="table-empty">Benutzer werden geladen...</td></tr>';
  } else {
    userTableHead.innerHTML = `
      <tr>
        <th>Benutzer</th>
        <th>Rolle</th>
        <th>Mitglied seit</th>
      </tr>`;
    userRows.innerHTML = '<tr><td colspan="3" class="table-empty">Mitglieder werden geladen...</td></tr>';
  }

  const rpcName = state.isAdmin ? 'admin_list_users' : 'dashboard_list_members';
  const { data, error } = await supabase.rpc(rpcName);

  if (error) {
    const colspan = state.isAdmin ? 6 : 3;
    userRows.innerHTML = `<tr><td colspan="${colspan}" class="table-empty">Fehler: ${escapeHtml(error.message)}</td></tr>`;
    setMessage(userMessage, `Benutzer konnten nicht geladen werden: ${error.message}`, 'error');
    return;
  }

  const users = data || [];

  if (!users.length) {
    const colspan = state.isAdmin ? 6 : 3;
    userRows.innerHTML = `<tr><td colspan="${colspan}" class="table-empty">Keine Benutzer gefunden.</td></tr>`;
    return;
  }

  if (!state.isAdmin) {
    userRows.innerHTML = users.map(entry => `
      <tr>
        <td>${escapeHtml(entry.username || 'Unbekannt')}</td>
        <td><span class="status-pill role-${normalizeRole(entry.role)}">${roleLabel(entry.role)}</span></td>
        <td>${formatDateTime(entry.created_at)}</td>
      </tr>`).join('');
    setMessage(userMessage, '', 'info', true);
    return;
  }

  userRows.innerHTML = users.map(entry => `
    <tr data-user-id="${entry.id}">
      <td>
        <label class="inline-field">
          <span>Benutzername</span>
          <input type="text" value="${escapeHtmlAttr(entry.username || '')}" data-field="username" maxlength="32">
        </label>
      </td>
      <td>${escapeHtml(entry.email || '-')}</td>
      <td>
        <label class="inline-field">
          <span>Rolle</span>
          <select data-field="role">
            <option value="observer" ${entry.role === 'observer' ? 'selected' : ''}>observer</option>
            <option value="member" ${entry.role === 'member' ? 'selected' : ''}>member</option>
            <option value="admin" ${entry.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </label>
      </td>
      <td>${formatDateTime(entry.created_at)}</td>
      <td>${entry.last_sign_in_at ? formatDateTime(entry.last_sign_in_at) : '-'}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-tertiary" data-action="save-user">Speichern</button>
          <button type="button" class="btn-danger" data-action="delete-user" ${entry.id === state.user.id ? 'disabled' : ''}>Löschen</button>
        </div>
      </td>
    </tr>`).join('');

  userRows.querySelectorAll('[data-action="save-user"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const userId = row.dataset.userId;
      const username = row.querySelector('[data-field="username"]').value.trim();
      const role = row.querySelector('[data-field="role"]').value;

      const { error: saveError } = await supabase.rpc('admin_update_user', {
        p_user_id: userId,
        p_username: username,
        p_role: role
      });

      if (saveError) {
        setMessage(userMessage, `Benutzer konnte nicht gespeichert werden: ${saveError.message}`, 'error');
        return;
      }

      setMessage(userMessage, 'Benutzer aktualisiert.', 'success');
      loadUsers();
    });
  });

  userRows.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const row = btn.closest('tr');
      const userId = row.dataset.userId;
      if (!userId) {
        setMessage(userMessage, 'Benutzer-ID fehlt. Bitte Liste neu laden und erneut versuchen.', 'error');
        return;
      }

      const username = row.querySelector('[data-field="username"]').value.trim() || 'dieses Konto';
      if (!confirm(`Benutzer ${username} wirklich löschen?`)) return;

      btn.disabled = true;
      await removeUserPhotosFromStorage(userId);
      const { data: deleted, error: deleteError } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
      btn.disabled = false;

      if (deleteError) {
        setMessage(userMessage, `Benutzer konnte nicht gelöscht werden: ${deleteError.message}`, 'error');
        return;
      }

      if (!deleted) {
        setMessage(userMessage, 'Benutzer konnte nicht gelöscht werden. Bitte Seite neu laden und erneut versuchen.', 'error');
        return;
      }

      setMessage(userMessage, `Benutzer gelöscht: ${username}`, 'success');
      await loadUsers();
    });
  });
}

async function removeUserPhotosFromStorage(userId) {
  if (!userId) return;

  const { data, error } = await supabase
    .from('photos')
    .select('storage_path')
    .eq('user_id', userId);

  if (error) {
    console.warn('[Ragebaiters] User-Fotos konnten vor dem Löschen nicht geladen werden:', error);
    return;
  }

  const paths = (data || [])
    .map(entry => String(entry.storage_path || ''))
    .filter(path => path && !isLocalPhotoPath(path));

  if (!paths.length) return;

  const { error: storageError } = await supabase.storage.from('photos').remove(paths);
  if (storageError) {
    console.warn('[Ragebaiters] User-Fotos konnten vor dem Löschen nicht vollständig entfernt werden:', storageError);
  }
}

async function ensureProfile(user) {
  const base = (user.user_metadata?.username || user.email?.split('@')[0] || 'member')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, 24) || 'member';
  const candidate = `${base}-${user.id.slice(0, 6)}`.slice(0, 32);
  const payload = { id: user.id, username: candidate, role: 'member' };

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[Ragebaiters] Profil-Reparatur fehlgeschlagen:', error);
    return null;
  }

  return payload;
}

function buildInviteCode() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RAGE-${stamp}-${suffix}`;
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '');
}

function readImageDims(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function setMessage(el, text, type = 'info', hidden = false) {
  if (!el) return;

  if (hidden || !text) {
    el.hidden = true;
    el.textContent = '';
    el.className = 'admin-message';
    return;
  }

  el.hidden = false;
  el.textContent = text;
  el.className = `admin-message is-${type}`;
}

function normalizeRole(role) {
  const allowed = ['observer', 'member', 'admin'];
  return allowed.includes(role) ? role : 'observer';
}

function roleLabel(role) {
  const labels = {
    observer: 'Beobachter',
    member: 'Mitglied',
    admin: 'Admin'
  };
  return labels[normalizeRole(role)] || 'Beobachter';
}

function isLocalPhotoPath(path) {
  return String(path || '').startsWith('__local__/');
}

function resolvePhotoUrl(path) {
  if (isLocalPhotoPath(path)) {
    return path.replace('__local__/', '');
  }
  const { data: pub } = supabase.storage.from('photos').getPublicUrl(path);
  return pub.publicUrl;
}

function capabilityCard(title, stateLabel, copy) {
  return `
    <article class="card capability-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(stateLabel)}</strong>
      <p>${escapeHtml(copy)}</p>
    </article>`;
}

function photoStatusLabel(visibility) {
  if (state.role === 'observer' && visibility === 'troll_internal') {
    return 'Wartet auf Freigabe';
  }

  const labels = {
    public: 'Oeffentlich',
    pending_review: 'Wartet auf Freigabe',
    troll_internal: 'Nur intern'
  };
  return labels[visibility] || 'Intern';
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function clearExpiredTestAccountHandoffs() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith(TEST_HANDOFF_PREFIX)) continue;

    try {
      const payload = JSON.parse(localStorage.getItem(key) || 'null');
      if (!payload?.expiresAt || Date.now() > Number(payload.expiresAt)) {
        localStorage.removeItem(key);
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
}

function createTestAccountHandoffId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function mapTestAccountError(error) {
  const message = String(error?.message || error || '');

  if (/admin_get_test_account_access/i.test(message) && /schema cache/i.test(message)) {
    return 'Die neue Supabase-Funktion fehlt noch. Bitte die aktuelle supabase_admin_dashboard.sql einmal komplett im Supabase SQL Editor ausführen.';
  }

  if (/admin_rotate_test_account_access/i.test(message) && /schema cache/i.test(message)) {
    return 'Die automatische Testaccount-Rotation fehlt noch in Supabase. Bitte die aktuelle supabase_admin_dashboard.sql einmal komplett ausführen.';
  }

  if (/admin_prepare_test_account/i.test(message) && /schema cache/i.test(message)) {
    return 'Die Testaccount-Vorbereitung fehlt noch in Supabase. Bitte die aktuelle supabase_admin_dashboard.sql einmal komplett ausführen.';
  }

  return message || 'Unbekannter Fehler';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
