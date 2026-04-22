import { supabase, initPage, getSessionUser, getProfile, getPhotoUrls, isLocalPhotoPath } from './auth.js';

await initPage('dashboard');

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILES_PER_BATCH = 10;
const NATHAN_ROLE_SENTINEL = '__local__/images/nathanrole.png';
const NATHAN_ROLE_CAPTION = 'schabbat schalom';
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

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const captionInput = document.getElementById('captionInput');
const uploadList = document.getElementById('uploadList');
const myPhotos = document.getElementById('myPhotos');
const photoSectionTitle = document.getElementById('photoSectionTitle');
const photoSectionIntro = document.getElementById('photoSectionIntro');

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
  canViewUsers: false
};

state.user = await getSessionUser();
if (!state.user) {
  location.href = 'login.html';
  throw new Error('redirecting-to-login');
}

state.profile = await getProfile(state.user.id);
if (!state.profile) {
  state.profile = await ensureProfile(state.user);
}

state.role = normalizeRole(state.profile?.role);
state.isAdmin = state.role === 'admin';
state.canUpload = state.role === 'member' || state.role === 'admin' || state.role === 'nathan';
state.canViewUsers = state.role === 'member' || state.role === 'admin';
helloEl.textContent = state.profile?.username || state.user.email || 'Mitglied';
roleBadge.textContent = roleLabel(state.role);
if (!state.isAdmin) {
  memberNote.hidden = false;
  adminOnlyNodes.forEach(node => {
    node.hidden = true;
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
if (state.canViewUsers) {
  refreshUsersBtn.addEventListener('click', () => loadUsers());
}
setupAdminActions();

loadingSection.hidden = true;
mainSection.hidden = false;

if (state.canUpload) {
  await loadMyPhotos();
}
if (state.canViewUsers) {
  await loadUsers();
}
if (state.isAdmin) {
  await Promise.all([
    loadInvites(),
    loadBannerSetting()
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
  window.addEventListener('hashchange', () => setActiveView(normalizeView((location.hash || '').replace('#', ''))));
}

function normalizeView(view) {
  const allowed = ['welcome'];
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
  if (state.role === 'nathan') {
    captionInput.value = NATHAN_ROLE_CAPTION;
    captionInput.disabled = true;
    captionInput.placeholder = 'Fester Bildtext fuer Nathan-Uploads';
  }

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

}

function setupWelcome() {
  const introByRole = {
    observer: 'Du bist als Beobachter eingeloggt. Aktuell steht dir nur dieser Willkommensbereich zur Verfuegung.',
    member: 'Du bist als Mitglied eingeloggt. Du kannst Bilder hochladen und die Mitgliederliste ansehen.',
    nathan: 'Du bist als Nathan eingeloggt. Deine Uploads werden intern nur fuer Nathan und Admins sichtbar und mit dem Nathan-Rollenbild veroeffentlicht.',
    admin: 'Du bist als Admin eingeloggt. Alle Bereiche des Dashboards stehen dir vollstaendig zur Verfuegung.'
  };

  welcomeIntro.textContent = introByRole[state.role] || introByRole.observer;

  const cards = [
    capabilityCard('Willkommensbereich', 'Immer sichtbar', 'Deine aktuelle Rolle und deine freigeschalteten Bereiche.'),
    capabilityCard('Uploads', state.canUpload ? 'Freigeschaltet' : 'Gesperrt', state.role === 'nathan'
      ? 'Ein Bild gleichzeitig hochladen. Es wird automatisch durch das Nathan-Rollenbild mit festem Text ersetzt und nur intern angezeigt.'
      : state.canUpload
        ? 'Bilder hochladen und eigene Uploads verwalten.'
        : 'Nur fuer Mitglieder, Nathan und Admins freigeschaltet.'),
    capabilityCard('Mitglieder', state.canViewUsers ? 'Freigeschaltet' : 'Gesperrt', state.canViewUsers ? (state.isAdmin ? 'Alle Benutzer sehen und verwalten.' : 'Mitgliederliste in reiner Lesesicht.') : 'Nur fuer Mitglieder und Admins freigeschaltet.'),
    capabilityCard('Admin-Funktionen', state.isAdmin ? 'Freigeschaltet' : 'Gesperrt', state.isAdmin ? 'Einladungscodes, Banner und Benutzerverwaltung komplett verfuegbar.' : 'Nur fuer Admins sichtbar.')
  ];

  welcomeCapabilities.innerHTML = cards.join('');
}

function setupUserSectionCopy() {
  if (state.isAdmin) {
    photoSectionTitle.innerHTML = 'Mediathek verwalten (<span id="count">0</span>)';
    photoSectionIntro.textContent = 'Als Admin siehst du hier alle hochgeladenen Bilder und kannst sie direkt loeschen.';
  }

  if (state.isAdmin) {
    usersTitle.textContent = 'Benutzerverwaltung';
    usersIntro.textContent = 'Alle Benutzer ansehen, Rollen anpassen, Benutzernamen aendern und Accounts loeschen.';
    return;
  }

  usersTitle.textContent = 'Mitglieder';
  usersIntro.textContent = 'Hier kannst du alle Benutzer der Website ansehen. Bearbeiten ist fuer Mitglieder nicht moeglich.';
}

function handleUploadFiles(files) {
  const caption = state.role === 'nathan'
    ? NATHAN_ROLE_CAPTION
    : captionInput.value.trim().slice(0, 500);
  const uploadFiles = state.role === 'nathan'
    ? [...files].slice(0, 1)
    : [...files].slice(0, MAX_FILES_PER_BATCH);
  uploadFiles.forEach(file => uploadOne(file, caption));
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

  let key = null;
  let uploadFile = file;
  let mime = file.type;
  let sizeBytes = file.size;
  let dims = await readImageDims(file).catch(() => ({ width: null, height: null }));
  let title = stripExt(file.name).slice(0, 160);
  let finalCaption = caption || null;
  let visibility = 'public';

  if (state.role === 'nathan') {
    key = NATHAN_ROLE_SENTINEL;
    mime = 'image/png';
    sizeBytes = null;
    dims = { width: null, height: null };
    title = 'Nathan Role';
    finalCaption = NATHAN_ROLE_CAPTION;
    visibility = 'nathan_only';
    bar.style.width = '70%';
    status.textContent = '70 %';
  } else {
    // Client-seitig neu rendern, um EXIF/Metadaten zu entfernen (kein Sicherheitsersatz für RLS/Policies, aber sinnvoll)
    const sanitized = await sanitizeUploadImage(file);
    uploadFile = sanitized.file;
    mime = sanitized.mime;
    sizeBytes = uploadFile.size;
    dims = await readImageDims(uploadFile).catch(() => dims);

    if (!ALLOWED_MIME.includes(mime)) return failUpload(row, status, 'Dateityp nicht erlaubt');
    if (uploadFile.size > MAX_BYTES) return failUpload(row, status, 'Datei zu gross (max. 8 MB)');

    const ext = extFromMime(mime);
    const nonce = Math.random().toString(36).slice(2, 8).toLowerCase();
    key = `${state.user.id}/${Date.now()}_${nonce}.${ext}`;

    bar.style.width = '70%';
    status.textContent = '70 %';
  }

  // WICHTIG: Erst DB-Insert, dann Storage-Upload.
  // Dadurch kann Storage per Policy erzwingen, dass ein passender DB-Row existiert (Anti-Spam / Anti-Abuse).
  const { data: inserted, error: dbError } = await supabase.from('photos').insert({
    user_id: state.user.id,
    storage_path: key,
    title,
    caption: finalCaption,
    mime,
    size_bytes: sizeBytes,
    width: dims.width,
    height: dims.height,
    visibility
  }).select('id').maybeSingle();
  if (dbError) return failUpload(row, status, dbError.message);

  if (state.role !== 'nathan') {
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(key, uploadFile, { cacheControl: '3600', contentType: mime, upsert: false });

    if (uploadError) {
      // DB-Row wieder entfernen, wenn Storage-Upload fehlschlägt
      await supabase.from('photos').delete().eq('user_id', state.user.id).eq('storage_path', key);
      return failUpload(row, status, uploadError.message);
    }
  }

  bar.style.width = '100%';
  status.textContent = 'fertig';
  row.classList.add('is-done');
  if (state.role !== 'nathan' && captionInput.value.trim() === caption) captionInput.value = '';
  setTimeout(loadMyPhotos, 400);
}

function failUpload(row, status, message) {
  status.textContent = `Fehler: ${message}`;
  row.classList.add('is-error');
}

async function loadMyPhotos() {
  const photoSource = state.isAdmin
    ? await supabase.rpc('admin_list_photos')
    : await supabase
      .from('photos')
      .select('id, storage_path, title, caption, uploaded_at')
      .eq('user_id', state.user.id)
      .order('uploaded_at', { ascending: false });

  const { data, error } = photoSource;

  if (error) {
    myPhotos.innerHTML = `<div class="alert alert-error">${escapeHtml(error.message)}</div>`;
    return;
  }

  const photos = Array.isArray(data) ? data : [];
  const countNode = document.getElementById('count');
  if (countNode) countNode.textContent = String(photos.length);

  if (!photos.length) {
    myPhotos.innerHTML = `<div class="card" style="text-align:center; color: var(--muted);">${state.isAdmin ? 'Es sind noch keine Bilder in der Mediathek vorhanden.' : 'Noch keine Bilder hochgeladen.'}</div>`;
    return;
  }

  const urlMap = await getPhotoUrls(photos.map(photo => photo.storage_path));
  myPhotos.innerHTML = '<div class="photo-grid"></div>';
  const grid = myPhotos.querySelector('.photo-grid');
  for (const photo of photos) {
    const imageUrl = urlMap.get(photo.storage_path) || '';
    if (!imageUrl) continue;
    const fig = document.createElement('figure');
    fig.className = 'photo-item';
    const metaLine = state.isAdmin
      ? `<small>${escapeHtml(photo.author || 'anonym')} · ${photo.visibility === 'nathan_only' ? 'nur intern' : 'oeffentlich'}</small>`
      : '';
    const actions = `<button class="btn-delete" type="button" data-id="${photo.id}" data-path="${encodeURIComponent(photo.storage_path)}" title="Loeschen">x</button>`;
    fig.innerHTML = `
      <a href="${imageUrl}" target="_blank" rel="noopener">
        <img src="${imageUrl}" alt="${escapeHtml(photo.title || '')}" loading="lazy">
      </a>
      <figcaption>
        <div class="photo-copy">
          <span>${escapeHtml(photo.title || '')}</span>
          ${photo.caption ? `<small>${escapeHtml(photo.caption)}</small>` : ''}
          ${metaLine}
        </div>
        ${actions}
      </figcaption>`;
    grid.appendChild(fig);
  }

  if (!grid.children.length) {
    myPhotos.innerHTML = '<div class="card" style="text-align:center; color: var(--muted);">Die Bilder konnten gerade nicht geladen werden.</div>';
    return;
  }

  grid.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Dieses Foto wirklich loeschen?')) return;
      const id = Number(btn.dataset.id);
      if (state.isAdmin) {
        const { data: deleted, error: deleteError } = await supabase.rpc('admin_delete_photo', { p_photo_id: id });
        if (deleteError) return alert(deleteError.message);
        if (!deleted) return alert('Foto konnte nicht geloescht werden.');
      } else {
        const path = decodeURIComponent(btn.dataset.path);
        if (!isLocalPhotoPath(path)) {
          const { error: storageError } = await supabase.storage.from('photos').remove([path]);
          if (storageError) return alert(storageError.message);
        }
        const { error: dbError } = await supabase.from('photos').delete().eq('id', id);
        if (dbError) return alert(dbError.message);
      }
      loadMyPhotos();
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
          <button type="button" class="btn-danger" data-action="delete-invite" data-code="${escapeHtmlAttr(invite.code)}">Loeschen</button>
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
      if (!confirm(`Einladungscode ${code} wirklich loeschen?`)) return;
      const { error: deleteError } = await supabase.rpc('admin_delete_invite', { p_code: code });
      if (deleteError) {
        setMessage(inviteMessage, `Code konnte nicht geloescht werden: ${deleteError.message}`, 'error');
        return;
      }
      setMessage(inviteMessage, `Code geloescht: ${code}`, 'success');
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
            <option value="nathan" ${entry.role === 'nathan' ? 'selected' : ''}>nathan</option>
            <option value="admin" ${entry.role === 'admin' ? 'selected' : ''}>admin</option>
          </select>
        </label>
      </td>
      <td>${formatDateTime(entry.created_at)}</td>
      <td>${entry.last_sign_in_at ? formatDateTime(entry.last_sign_in_at) : '-'}</td>
      <td>
        <div class="table-actions">
          <button type="button" class="btn-tertiary" data-action="save-user">Speichern</button>
          <button type="button" class="btn-danger" data-action="delete-user" ${entry.id === state.user.id ? 'disabled' : ''}>Loeschen</button>
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
      if (!confirm(`Benutzer ${username} wirklich loeschen?`)) return;

      btn.disabled = true;
      const { data: deleted, error: deleteError } = await supabase.rpc('admin_delete_user', { p_user_id: userId });
      btn.disabled = false;

      if (deleteError) {
        setMessage(userMessage, `Benutzer konnte nicht geloescht werden: ${deleteError.message}`, 'error');
        return;
      }

      if (!deleted) {
        setMessage(userMessage, 'Benutzer konnte nicht geloescht werden. Bitte Seite neu laden und erneut versuchen.', 'error');
        return;
      }

      setMessage(userMessage, `Benutzer geloescht: ${username}`, 'success');
      await loadUsers();
    });
  });
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

function extFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'jpg';
}

async function sanitizeUploadImage(file) {
  // GIF nicht anfassen (Animation); andere Formate als WebP neu rendern -> entfernt Metadaten/EXIF zuverlässig.
  try {
    if (!file || file.type === 'image/gif') return { file, mime: file?.type || 'application/octet-stream' };
    if (!file.type || !file.type.startsWith('image/')) return { file, mime: file.type || 'application/octet-stream' };

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { alpha: true });
    ctx.drawImage(bitmap, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.92));
    if (!blob) return { file, mime: file.type };

    const outName = `${stripExt(file.name)}.webp`;
    const outFile = new File([blob], outName, { type: 'image/webp' });
    return { file: outFile, mime: 'image/webp' };
  } catch {
    return { file, mime: file?.type || 'application/octet-stream' };
  }
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
  const allowed = ['observer', 'member', 'nathan', 'admin'];
  return allowed.includes(role) ? role : 'observer';
}

function roleLabel(role) {
  const labels = {
    observer: 'Beobachter',
    member: 'Mitglied',
    nathan: 'Nathan',
    admin: 'Admin'
  };
  return labels[normalizeRole(role)] || 'Beobachter';
}

function capabilityCard(title, stateLabel, copy) {
  return `
    <article class="card capability-card">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(stateLabel)}</strong>
      <p>${escapeHtml(copy)}</p>
    </article>`;
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
