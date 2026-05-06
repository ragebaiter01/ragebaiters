import {
  initPage,
  getSessionUser,
  getProfile,
  buildScopedUrl,
  supabase
} from './auth.js?v=2026-04-23-1';

await initPage('secret-game');

const user = await getSessionUser();
if (!user) {
  location.href = buildScopedUrl('login.html');
  throw new Error('redirecting-to-login');
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gameTitleEl = document.getElementById('gameTitle');
const gameIntroEl = document.getElementById('gameIntro');
const gameMetaKickerEl = document.getElementById('gameMetaKicker');
const gameMetaTitleEl = document.getElementById('gameMetaTitle');
const gameRulesEl = document.getElementById('gameRules');
const statusTextEl = document.getElementById('gameStatusText');
const touchButtons = [...document.querySelectorAll('[data-touch]')];
const selectorButtons = [...document.querySelectorAll('[data-game]')];
const playerAvatarCard = document.getElementById('playerAvatarCard');
const playerAvatarPreview = document.getElementById('playerAvatarPreview');
const playerAvatarName = document.getElementById('playerAvatarName');
const playerAvatarHint = document.getElementById('playerAvatarHint');
const scoreboardTitleEl = document.getElementById('scoreboardTitle');
const myBestScoreEl = document.getElementById('myBestScore');
const globalBestScoreEl = document.getElementById('globalBestScore');
const leaderboardListEl = document.getElementById('leaderboardList');

const FIXED_STEP = 1000 / 60;
const GAME_STATE_MENU = 0;
const GAME_STATE_PLAYING = 1;
const GAME_STATE_GAME_OVER = 2;
const GAME_STATE_WIN = 3;
const DEFAULT_PLAYER_SPRITE = 'images/doodle-jason-face.png';

const PLAYER_BY_USER_ID = {
  '0126bc68-2349-48f9-a9e8-6fa7b052697f': { key: 'jason', label: 'Jason', sprite: 'images/jason.png' },
  'c67579e7-6643-4a1a-920d-616f4352210c': { key: 'tobi', label: 'Tobi', sprite: 'images/doodletobi.png' },
  'a4bb0f6e-e0f3-4741-95b8-b12d82ce17b0': { key: 'nils', label: 'Nils', sprite: 'images/doodlenils.png' },
  '943a0797-2509-46a3-9259-834242cefb23': { key: 'michael', label: 'Micha', sprite: 'images/doodlemicha.png' },
  'dbb35b2a-c1c0-4e54-bdc6-3ff9a8b0527a': { key: 'ben', label: 'Yotzek', sprite: 'images/doodleben.png' }
};

const PLAYER_BY_LOGIN_ID = {
  jason: { key: 'jason', label: 'Jason', sprite: 'images/jason.png' },
  sneiper0: { key: 'jason', label: 'Jason', sprite: 'images/jason.png' },
  nils: { key: 'nils', label: 'Nils', sprite: 'images/doodlenils.png' },
  disccave: { key: 'nils', label: 'Nils', sprite: 'images/doodlenils.png' },
  michael: { key: 'michael', label: 'Michael', sprite: 'images/doodlemicha.png' },
  mundmbrothers: { key: 'michael', label: 'Michael', sprite: 'images/doodlemicha.png' },
  michi: { key: 'michael', label: 'Michael', sprite: 'images/doodlemicha.png' },
  nathan: { key: 'nathan', label: 'Nathan', sprite: 'images/doodlenathan.png' },
  nathangoldstein: { key: 'nathan', label: 'Nathan', sprite: 'images/doodlenathan.png' },
  goldstein: { key: 'nathan', label: 'Nathan', sprite: 'images/doodlenathan.png' },
  ben: { key: 'ben', label: 'Ben', sprite: 'images/doodleben.png' },
  yotzek: { key: 'ben', label: 'Ben', sprite: 'images/doodleben.png' },
  benluca: { key: 'benluca', label: 'Benluca', sprite: 'images/doodlebenluca.png' },
  tobi: { key: 'tobi', label: 'Tobi', sprite: 'images/doodletobi.png' },
  tobias: { key: 'tobi', label: 'Tobi', sprite: 'images/doodletobi.png' }
};

const GAME_CONFIGS = {
  doodle_jason: {
    key: 'doodle_jason',
    title: 'Doodle Jason',
    intro: 'Spring mit dem Gesicht des eingeloggten Users so hoch wie moeglich und knack den persoenlichen sowie globalen Rekord.',
    metaKicker: 'Steuerung',
    metaTitle: 'Springender Kopf',
    scoreboardTitle: 'Doodle Jason Highscores',
    canvasWidth: 400,
    canvasHeight: 700,
    canvasLabel: 'Doodle Jason Spielbereich',
    showAvatarCard: true,
    touchActions: ['left', 'right'],
    rules: [
      { title: 'Bewegen', copy: 'Mit den Pfeiltasten oder den Touch-Buttons links und rechts steuern.' },
      { title: 'Starten', copy: 'Im Menue auf SPIELEN klicken oder `Enter` bzw. `Leertaste` druecken.' },
      { title: 'Ueberleben', copy: 'Normale Plattformen tragen dich, blaue bewegen sich und braune brechen weg.' },
      { title: 'Bonus', copy: 'Federn geben Superspruenge, Jetpacks schieben dich kurz brutal nach oben.' }
    ]
  },
  space_invaders: {
    key: 'space_invaders',
    title: 'Space Invaders Klone',
    intro: 'Ein klassischer Ragebaiters-Arcade-Modus: Aliens abschiessen, ausweichen und den globalen Highscore verteidigen.',
    metaKicker: 'Steuerung',
    metaTitle: 'Retro-Feuerkampf',
    scoreboardTitle: 'Space Invaders Klone Highscores',
    canvasWidth: 800,
    canvasHeight: 600,
    canvasLabel: 'Space Invaders Klone Spielbereich',
    showAvatarCard: false,
    touchActions: ['left', 'fire', 'right'],
    rules: [
      { title: 'Bewegen', copy: 'Mit Pfeiltasten oder den Touch-Buttons links und rechts manoevrieren.' },
      { title: 'Schiessen', copy: 'Mit `Leertaste` oder dem Feuer-Button gruene Schuesse auf die Alien-Reihe abgeben.' },
      { title: 'Ueberleben', copy: 'Rote Alien-Schuesse ausweichen. Sobald dich ein Treffer erwischt, ist der Lauf vorbei.' },
      { title: 'Neustart', copy: 'Nach Niederlage oder Sieg `R`, `Enter` oder die Menue-Schaltflaeche nutzen.' }
    ]
  }
};

const userProfile = await getProfile(user.id);
const playerIdentity = resolvePlayerIdentity(user, userProfile);
const playerImg = new Image();
playerImg.src = playerIdentity.sprite;

let activeGameKey = normalizeGameKey(localStorage.getItem('ragebaiters:arcade:selected-game')) || 'doodle_jason';
let activeGame = null;
let activeHighScore = 0;
let activeLeaderboardEntries = [];
const submittingScores = new Set();
let leaderboardLoadToken = 0;

setupSelector();
setupSharedInput();
await selectGame(activeGameKey);

let lastTime = performance.now();
let accumulator = 0;
requestAnimationFrame(loop);

function setupSelector() {
  selectorButtons.forEach(button => {
    button.addEventListener('click', async () => {
      const nextGame = normalizeGameKey(button.dataset.game);
      if (!nextGame || nextGame === activeGameKey) return;
      await selectGame(nextGame);
    });
  });
}

function setupSharedInput() {
  window.addEventListener('keydown', event => {
    activeGame?.handleKeyDown?.(event);
  });

  window.addEventListener('keyup', event => {
    activeGame?.handleKeyUp?.(event);
  });

  canvas.addEventListener('pointerdown', event => {
    activeGame?.handlePointerDown?.(getCanvasPoint(event));
  });

  canvas.addEventListener('pointermove', event => {
    activeGame?.handlePointerMove?.(getCanvasPoint(event));
  });

  canvas.addEventListener('pointerleave', () => {
    activeGame?.handlePointerLeave?.();
  });

  touchButtons.forEach(button => {
    const action = button.dataset.touch;
    const setPressed = pressed => {
      button.classList.toggle('is-active', pressed);
      activeGame?.handleTouchAction?.(action, pressed);
    };

    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      setPressed(true);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
      button.addEventListener(type, () => setPressed(false));
    });
  });
}

async function selectGame(gameKey) {
  const normalized = normalizeGameKey(gameKey) || 'doodle_jason';
  const config = GAME_CONFIGS[normalized];
  if (!config) return;

  activeGameKey = normalized;
  localStorage.setItem('ragebaiters:arcade:selected-game', normalized);

  selectorButtons.forEach(button => {
    button.classList.toggle('is-active', button.dataset.game === normalized);
  });

  applyGameUi(config);
  configureCanvas(config.canvasWidth, config.canvasHeight, config.canvasLabel);
  configureTouchButtons(config.touchActions);

  activeGame = normalized === 'space_invaders'
    ? createSpaceInvadersGame({
        onStatus: setStatus,
        onScore: points => submitArcadeScore(normalized, points)
      })
    : createDoodleGame({
        onStatus: setStatus,
        onScore: points => submitArcadeScore(normalized, points),
        sprite: playerImg,
        label: playerIdentity.label
      });

  await refreshScoreboard(normalized);
  activeGame.onActivate?.();
}

function applyGameUi(config) {
  if (gameTitleEl) gameTitleEl.textContent = config.title;
  if (gameIntroEl) gameIntroEl.textContent = config.intro;
  if (gameMetaKickerEl) gameMetaKickerEl.textContent = config.metaKicker;
  if (gameMetaTitleEl) gameMetaTitleEl.textContent = config.metaTitle;
  if (scoreboardTitleEl) scoreboardTitleEl.textContent = config.scoreboardTitle;
  if (canvas) canvas.setAttribute('aria-label', config.canvasLabel);

  renderRules(config.rules);

  if (playerAvatarCard) {
    playerAvatarCard.hidden = !config.showAvatarCard;
  }

  if (config.showAvatarCard) {
    if (playerAvatarPreview) {
      playerAvatarPreview.src = playerIdentity.sprite;
      playerAvatarPreview.alt = `${playerIdentity.label} Spielfigur`;
    }
    if (playerAvatarName) {
      playerAvatarName.textContent = `${playerIdentity.label} ist der springende Kopf`;
    }
    if (playerAvatarHint) {
      playerAvatarHint.textContent = `Im Spiel huepft direkt ${playerIdentity.assetLabel} als Avatar herum.`;
    }
  }
}

function renderRules(rules) {
  if (!gameRulesEl) return;
  gameRulesEl.innerHTML = (rules || [])
    .map((rule, index) => `
      <div class="game-rule">
        <div class="game-rule-badge">${index + 1}</div>
        <div class="game-rule-copy">
          <strong>${escapeHtml(rule.title)}</strong>
          <span>${escapeHtml(rule.copy)}</span>
        </div>
      </div>`)
    .join('');
}

function configureCanvas(width, height, label) {
  canvas.width = width;
  canvas.height = height;
  canvas.style.setProperty('--game-canvas-max-width', `${width}px`);
  if (label) canvas.setAttribute('aria-label', label);
}

function configureTouchButtons(visibleActions) {
  const allowed = new Set(visibleActions || []);
  touchButtons.forEach(button => {
    button.classList.toggle('is-hidden', !allowed.has(button.dataset.touch));
  });
}

function loop(now) {
  accumulator += Math.min(80, now - lastTime);
  lastTime = now;

  while (accumulator >= FIXED_STEP) {
    activeGame?.tick?.();
    accumulator -= FIXED_STEP;
  }

  activeGame?.render?.();
  requestAnimationFrame(loop);
}

function setStatus(text) {
  if (statusTextEl) statusTextEl.textContent = text;
}

async function refreshScoreboard(gameKey) {
  const token = ++leaderboardLoadToken;
  const localKey = buildLocalHighscoreKey(gameKey);
  let localScore = Number(localStorage.getItem(localKey) || 0) || 0;
  let leaderboardMessage = '';

  try {
    const [{ data: myData, error: myError }, { data: leaderboardData, error: leaderboardError }] = await Promise.all([
      supabase.rpc('get_arcade_my_highscore', { p_game_key: gameKey }),
      supabase.rpc('get_arcade_leaderboard', { p_game_key: gameKey })
    ]);

    if (myError) {
      console.error('[Arcade] Eigener Highscore konnte nicht geladen werden:', myError);
      leaderboardMessage = 'Highscore konnte gerade nicht geladen werden.';
    } else {
      localScore = Math.max(localScore, Number(myData || 0) || 0);
      localStorage.setItem(localKey, String(localScore));
    }

    if (leaderboardError) {
      console.error('[Arcade] Leaderboard konnte nicht geladen werden:', leaderboardError);
      if (!leaderboardMessage) leaderboardMessage = 'Leaderboard konnte gerade nicht geladen werden.';
      activeLeaderboardEntries = [];
    } else {
      activeLeaderboardEntries = Array.isArray(leaderboardData) ? leaderboardData : [];
    }
  } catch (error) {
    console.error('[Arcade] Leaderboard-Request fehlgeschlagen:', error);
    activeLeaderboardEntries = [];
    leaderboardMessage = 'Leaderboard konnte gerade nicht geladen werden.';
  }

  if (token !== leaderboardLoadToken) return;
  activeHighScore = localScore;
  updateScoreUi();
  renderLeaderboard(leaderboardMessage);
}

async function submitArcadeScore(gameKey, points) {
  const safePoints = Math.max(0, Math.floor(Number(points) || 0));
  if (!safePoints) return;
  if (submittingScores.has(gameKey)) return;

  submittingScores.add(gameKey);
  try {
    const { data, error } = await supabase.rpc('submit_arcade_score', {
      p_game_key: gameKey,
      p_score: safePoints
    });

    if (error) {
      console.error('[Arcade] Highscore konnte nicht gespeichert werden:', error);
      return;
    }

    const best = Math.max(safePoints, Number(data || 0) || 0);
    activeHighScore = Math.max(activeHighScore, best);
    localStorage.setItem(buildLocalHighscoreKey(gameKey), String(activeHighScore));

    if (activeGameKey === gameKey) {
      await refreshScoreboard(gameKey);
    }
  } finally {
    submittingScores.delete(gameKey);
  }
}

function updateScoreUi() {
  if (myBestScoreEl) myBestScoreEl.textContent = String(activeHighScore || 0);

  if (globalBestScoreEl) {
    const champion = activeLeaderboardEntries[0];
    globalBestScoreEl.textContent = champion
      ? `${champion.username || 'Unbekannt'} · ${champion.best_score || 0}`
      : '-';
  }
}

function renderLeaderboard(message = '') {
  if (!leaderboardListEl) return;

  if (!activeLeaderboardEntries.length) {
    leaderboardListEl.innerHTML = `<div class="game-scoreboard-empty">${escapeHtml(message || 'Noch kein globaler Highscore verfuegbar.')}</div>`;
    return;
  }

  leaderboardListEl.innerHTML = activeLeaderboardEntries
    .map((entry, index) => {
      const username = escapeHtml(entry.username || 'Unbekannt');
      const scoreValue = Number(entry.best_score || 0) || 0;
      const isCurrentUser = Boolean(entry.is_current_user);

      return `
        <div class="game-scoreboard-row ${isCurrentUser ? 'is-current-user' : ''}">
          <div class="game-scoreboard-rank">${index + 1}</div>
          <div class="game-scoreboard-name">
            <strong>${username}</strong>
            <span>${isCurrentUser ? 'Das bist du' : 'Globaler Bestwert'}</span>
          </div>
          <div class="game-scoreboard-value">${scoreValue}</div>
        </div>`;
    })
    .join('');
}

function buildLocalHighscoreKey(gameKey) {
  return `ragebaiters:arcade-highscore:${gameKey}:${playerIdentity.key}:${user.id}`;
}

function createDoodleGame({ onStatus, onScore, sprite, label }) {
  const WIDTH = 400;
  const HEIGHT = 700;
  const GRAVITY = 0.45;
  const JUMP_FORCE = -11.5;
  const SUPER_JUMP = -18.0;
  const MOVE_SPEED = 5.5;
  const PLAYER_W = 50;
  const PLAYER_H = 50;
  const PLATFORM_W = 70;
  const PLATFORM_H = 14;
  const JETPACK_DUR = 120;

  let state = GAME_STATE_MENU;
  let frame = 0;
  let menuBounce = 0;
  let px = WIDTH / 2;
  let py = HEIGHT - 120;
  let vx = 0;
  let vy = 0;
  let cam = 0;
  let keyLeft = false;
  let keyRight = false;
  let facingRight = true;
  let score = 0;
  let scoreSent = false;
  let jetpack = false;
  let jetpackTimer = 0;
  let clouds = createDoodleClouds();
  let platforms = [];
  let powerUps = [];
  let particles = [];
  const pointer = { x: -9999, y: -9999 };

  function onActivate() {
    state = GAME_STATE_MENU;
    menuBounce = 0;
    frame = 0;
    clouds = createDoodleClouds();
    resetRound();
    onStatus(`${label} ist fuer Doodle Jason bereit.`);
  }

  function resetRound() {
    platforms = [];
    powerUps = [];
    particles = [];
    px = WIDTH / 2;
    py = HEIGHT - 120;
    vx = 0;
    vy = 0;
    cam = 0;
    score = 0;
    scoreSent = false;
    jetpack = false;
    jetpackTimer = 0;
    keyLeft = false;
    keyRight = false;
    facingRight = true;

    platforms.push({ x: WIDTH / 2, y: HEIGHT - 60, type: 0, dir: 0, alive: true });
    let y = HEIGHT - 160;
    while (y > -HEIGHT * 3) {
      const x = rand(PLATFORM_W / 2 + 5, WIDTH - PLATFORM_W / 2 - 5);
      let type = 0;
      const roll = Math.random();
      if (y < HEIGHT - 400 && roll < 0.10) type = 2;
      else if (y < HEIGHT - 250 && roll < 0.22) type = 1;

      platforms.push({
        x,
        y,
        type,
        dir: Math.random() > 0.5 ? 1 : -1,
        alive: true
      });

      if (type === 0 && Math.random() < 0.07) {
        powerUps.push({
          x,
          y: y - 25,
          type: Math.random() < 0.72 ? 0 : 1,
          active: true
        });
      }

      y -= rand(55, 90);
    }
  }

  function startGame() {
    state = GAME_STATE_PLAYING;
    resetRound();
    onStatus(`${label} ist unterwegs.`);
  }

  function finishGame() {
    if (scoreSent) return;
    scoreSent = true;
    void onScore(score);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keyLeft = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keyRight = true;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (state !== GAME_STATE_PLAYING) startGame();
    }
  }

  function handleKeyUp(event) {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keyLeft = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keyRight = false;
  }

  function handlePointerDown(point) {
    pointer.x = point.x;
    pointer.y = point.y;
    if (state === GAME_STATE_MENU && hitButton(point.x, point.y, WIDTH / 2, HEIGHT / 2 + 40, 210, 54)) {
      startGame();
    } else if (state === GAME_STATE_GAME_OVER && hitButton(point.x, point.y, WIDTH / 2, HEIGHT / 2 + 85, 200, 48)) {
      startGame();
    }
  }

  function handlePointerMove(point) {
    pointer.x = point.x;
    pointer.y = point.y;
  }

  function handlePointerLeave() {
    pointer.x = -9999;
    pointer.y = -9999;
  }

  function handleTouchAction(action, pressed) {
    if (action === 'left') keyLeft = pressed;
    if (action === 'right') keyRight = pressed;
  }

  function tick() {
    frame += 1;
    if (state === GAME_STATE_MENU) {
      menuBounce += 0.04;
      return;
    }
    if (state !== GAME_STATE_PLAYING) return;

    if (keyLeft) {
      vx = -MOVE_SPEED;
      facingRight = false;
    } else if (keyRight) {
      vx = MOVE_SPEED;
      facingRight = true;
    } else {
      vx *= 0.82;
    }

    if (jetpack) {
      jetpackTimer -= 1;
      vy = -8.5;
      spawnJetpackParticles();
      if (jetpackTimer <= 0) jetpack = false;
    } else {
      vy += GRAVITY;
    }

    px += vx;
    py += vy;

    if (px < -PLAYER_W / 2) px = WIDTH + PLAYER_W / 2;
    if (px > WIDTH + PLAYER_W / 2) px = -PLAYER_W / 2;

    platforms.forEach(platform => {
      if (platform.type === 1 && platform.alive) {
        platform.x += platform.dir * 1.5;
        if (platform.x < PLATFORM_W / 2 || platform.x > WIDTH - PLATFORM_W / 2) {
          platform.dir *= -1;
        }
      }
    });

    if (vy >= 0 && !jetpack) {
      for (let i = platforms.length - 1; i >= 0; i -= 1) {
        const platform = platforms[i];
        if (!platform.alive) continue;

        const overlapX = px + PLAYER_W * 0.4 > platform.x - PLATFORM_W / 2
          && px - PLAYER_W * 0.4 < platform.x + PLATFORM_W / 2;
        const overlapY = py + PLAYER_H / 2 >= platform.y - PLATFORM_H / 2
          && py + PLAYER_H / 2 <= platform.y + PLATFORM_H / 2 + vy + 2;

        if (!overlapX || !overlapY) continue;

        if (platform.type === 2) {
          platform.alive = false;
          spawnBreakParticles(platform.x, platform.y);
        } else {
          py = platform.y - PLATFORM_H / 2 - PLAYER_H / 2;
          vy = JUMP_FORCE;
          spawnLandParticles();
        }
        break;
      }
    }

    powerUps.forEach(powerUp => {
      if (!powerUp.active) return;
      if (distance(px, py, powerUp.x, powerUp.y) < PLAYER_W / 2 + 18) {
        powerUp.active = false;
        if (powerUp.type === 0) {
          vy = SUPER_JUMP;
          spawnSpringParticles();
        } else {
          jetpack = true;
          jetpackTimer = JETPACK_DUR;
        }
      }
    });

    const target = py - HEIGHT * 0.35;
    if (target < cam) {
      cam += (target - cam) * 0.12;
    }

    const climbed = Math.trunc(-(py - (HEIGHT - 120)));
    if (climbed > score) score = climbed;

    generatePlatforms();
    cleanUp();
    updateParticles();

    if (py > cam + HEIGHT + 150) {
      state = GAME_STATE_GAME_OVER;
      finishGame();
      onStatus(score > 0 ? `${label} ist abgestuerzt. ${score} Punkte.` : `${label} ist abgestuerzt.`);
    }
  }

  function render() {
    drawDoodleSky(ctx, WIDTH, HEIGHT);
    drawDoodleClouds(ctx, clouds, state === GAME_STATE_MENU ? 0 : cam, HEIGHT);

    if (state === GAME_STATE_MENU) {
      drawDoodleMenu();
      return;
    }

    ctx.save();
    ctx.translate(0, -cam);

    platforms.forEach(platform => {
      const visibleY = platform.y - cam;
      if (platform.alive && visibleY > -60 && visibleY < HEIGHT + 60) drawPlatform(platform);
    });

    powerUps.forEach(powerUp => {
      if (powerUp.active) drawPowerUp(powerUp);
    });

    drawParticles();
    drawPlayer();

    ctx.restore();
    drawDoodleHud(ctx, WIDTH, score, activeHighScore, jetpack, jetpackTimer, JETPACK_DUR);

    if (state === GAME_STATE_GAME_OVER) drawDoodleGameOver();
  }

  function drawDoodleMenu() {
    const bounce = Math.sin(menuBounce) * 8;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.font = 'bold 48px Arial';
    ctx.fillText('DOODLE', WIDTH / 2 + 2, HEIGHT / 4 - 26 + bounce + 2);
    ctx.fillText(label.toUpperCase(), WIDTH / 2 + 2, HEIGHT / 4 + 32 + bounce + 2);
    ctx.fillStyle = '#FFD700';
    ctx.fillText('DOODLE', WIDTH / 2, HEIGHT / 4 - 26 + bounce);
    ctx.fillStyle = '#32CD32';
    ctx.fillText(label.toUpperCase(), WIDTH / 2, HEIGHT / 4 + 32 + bounce);
    ctx.fillStyle = '#505050';
    ctx.font = '16px Arial';
    ctx.fillText('Spring so hoch wie moeglich', WIDTH / 2, HEIGHT / 4 + 78);
    drawButton(ctx, pointer, WIDTH / 2, HEIGHT / 2 + 40, 210, 54, 'SPIELEN', '#2EAE2E', '#4ADE4A');
    if (activeHighScore > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.fillText(`Rekord: ${activeHighScore}`, WIDTH / 2, HEIGHT / 2 + 95);
    }
    ctx.fillStyle = '#666';
    ctx.fillText('Pfeiltasten oder Touch-Buttons zum Steuern', WIDTH / 2, HEIGHT - 55);
    ctx.fillText('Enter oder Klick startet den Lauf', WIDTH / 2, HEIGHT - 32);
  }

  function drawDoodleGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.66)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    roundedRect(ctx, WIDTH / 2 - 155, HEIGHT / 2 - 160, 310, 300, 16, 'rgba(35,35,55,0.92)');
    ctx.strokeStyle = '#FF5555';
    ctx.lineWidth = 3;
    pathRoundedRect(ctx, WIDTH / 2 - 155, HEIGHT / 2 - 160, 310, 300, 16);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FF6666';
    ctx.font = 'bold 40px Arial';
    ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2 - 105);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`Punkte: ${score}`, WIDTH / 2, HEIGHT / 2 - 45);
    ctx.fillStyle = '#FFD700';
    ctx.font = '18px Arial';
    ctx.fillText(`Rekord: ${activeHighScore}`, WIDTH / 2, HEIGHT / 2 + 20);
    drawButton(ctx, pointer, WIDTH / 2, HEIGHT / 2 + 85, 200, 48, 'NOCHMAL', '#2EAE2E', '#4ADE4A');
  }

  function drawPlatform(platform) {
    if (platform.type === 0) {
      roundedRect(ctx, platform.x - PLATFORM_W / 2, platform.y - PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, 6, '#22A822');
      roundedRect(ctx, platform.x - (PLATFORM_W - 6) / 2, platform.y - PLATFORM_H / 2 - 2, PLATFORM_W - 6, PLATFORM_H - 5, 5, '#3CD83C');
      return;
    }

    if (platform.type === 1) {
      roundedRect(ctx, platform.x - PLATFORM_W / 2, platform.y - PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, 6, '#2878C8');
      roundedRect(ctx, platform.x - (PLATFORM_W - 6) / 2, platform.y - PLATFORM_H / 2 - 2, PLATFORM_W - 6, PLATFORM_H - 5, 5, '#48A8F0');
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const arrowX = platform.dir > 0 ? platform.x + PLATFORM_W / 2 - 6 : platform.x - PLATFORM_W / 2 + 6;
      const dir = platform.dir > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(arrowX, platform.y);
      ctx.lineTo(arrowX - dir * 7, platform.y - 4);
      ctx.lineTo(arrowX - dir * 7, platform.y + 4);
      ctx.closePath();
      ctx.fill();
      return;
    }

    roundedRect(ctx, platform.x - PLATFORM_W / 2, platform.y - PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, 6, '#8B5E3C');
    roundedRect(ctx, platform.x - (PLATFORM_W - 6) / 2, platform.y - PLATFORM_H / 2 - 2, PLATFORM_W - 6, PLATFORM_H - 5, 5, '#A97B50');
    ctx.strokeStyle = '#6B4226';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(platform.x - 18, platform.y - 3);
    ctx.lineTo(platform.x + 4, platform.y + 4);
    ctx.moveTo(platform.x + 8, platform.y - 4);
    ctx.lineTo(platform.x - 6, platform.y + 3);
    ctx.stroke();
  }

  function drawPowerUp(powerUp) {
    ctx.save();
    ctx.translate(powerUp.x, powerUp.y);
    if (powerUp.type === 0) {
      roundedRect(ctx, -11, 7, 22, 7, 2, '#DD3333');
      ctx.strokeStyle = '#DD3333';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const top = -6 + Math.sin(frame * 0.12) * 3;
      let started = false;
      for (let sy = 7; sy > top; sy -= 3) {
        const sx = Math.sin(sy * 1.2) * 8;
        if (!started) {
          ctx.moveTo(sx, sy);
          started = true;
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
      ctx.fillStyle = '#FF6666';
      ctx.beginPath();
      ctx.ellipse(0, top - 2, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      roundedRect(ctx, -10, -14, 20, 28, 5, '#606878');
      roundedRect(ctx, -7, -12, 14, 18, 3, '#7888A0');
      const flameHeight = 10 + Math.sin(frame * 0.35) * 5;
      ctx.fillStyle = 'rgba(255, 153, 0, 0.82)';
      ctx.beginPath();
      ctx.ellipse(-5, 16, 4.5, flameHeight / 2, 0, 0, Math.PI * 2);
      ctx.ellipse(5, 16, 4.5, flameHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 221, 0, 0.82)';
      ctx.beginPath();
      ctx.ellipse(-5, 15, 2.5, flameHeight * 0.275, 0, 0, Math.PI * 2);
      ctx.ellipse(5, 15, 2.5, flameHeight * 0.275, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFDD44';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('J', 0, -3);
    }
    ctx.restore();
  }

  function drawPlayer() {
    ctx.save();
    ctx.translate(px, py);
    if (!facingRight) ctx.scale(-1, 1);

    if (sprite.complete && sprite.naturalWidth > 0) {
      const bounceScaleY = 1 + Math.min(Math.abs(vy) / 40, 0.08);
      const bounceScaleX = 1 - Math.min(Math.abs(vy) / 60, 0.05);
      const radius = 34;
      ctx.save();
      ctx.scale(bounceScaleX, bounceScaleY);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.ellipse(0, 34, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'rgba(255,255,255,0.28)';
      ctx.shadowBlur = 18;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
      ctx.restore();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,0.82)';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#3090FF';
      ctx.beginPath();
      ctx.ellipse(0, 0, PLAYER_W / 2, PLAYER_H / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (jetpack) {
      const flameHeight = 18 + Math.sin(frame * 0.35) * 10;
      ctx.fillStyle = 'rgba(255, 136, 0, 0.82)';
      ctx.beginPath();
      ctx.ellipse(-18, PLAYER_H / 2 + 2, 7, flameHeight / 2, 0, 0, Math.PI * 2);
      ctx.ellipse(18, PLAYER_H / 2 + 2, 7, flameHeight / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 204, 0, 0.82)';
      ctx.beginPath();
      ctx.ellipse(-18, PLAYER_H / 2 + 1, 3.5, flameHeight * 0.275, 0, 0, Math.PI * 2);
      ctx.ellipse(18, PLAYER_H / 2 + 1, 3.5, flameHeight * 0.275, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function spawnLandParticles() {
    for (let i = 0; i < 6; i += 1) {
      particles.push({
        x: px + rand(-12, 12),
        y: py + PLAYER_H / 2,
        vx: rand(-2, 2),
        vy: rand(-3, -0.5),
        life: rand(12, 25),
        color: [255, 255, 255]
      });
    }
  }

  function spawnBreakParticles(x, y) {
    for (let i = 0; i < 10; i += 1) {
      particles.push({
        x: x + rand(-PLATFORM_W / 2, PLATFORM_W / 2),
        y,
        vx: rand(-3.5, 3.5),
        vy: rand(-2, 5),
        life: rand(25, 45),
        color: [139, 90, 43]
      });
    }
  }

  function spawnSpringParticles() {
    for (let i = 0; i < 12; i += 1) {
      particles.push({
        x: px + rand(-18, 18),
        y: py + PLAYER_H / 2,
        vx: rand(-3.5, 3.5),
        vy: rand(-5, -1),
        life: rand(20, 40),
        color: [50, 210, 50]
      });
    }
  }

  function spawnJetpackParticles() {
    for (let i = 0; i < 3; i += 1) {
      particles.push({
        x: px + rand(-14, 14),
        y: py + PLAYER_H / 2 + 5,
        vx: rand(-1.8, 1.8),
        vy: rand(2, 5.5),
        life: rand(18, 35),
        color: [255, rand(120, 220), 0]
      });
    }
  }

  function updateParticles() {
    particles = particles.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= 1;
      return particle.life > 0;
    });
  }

  function drawParticles() {
    particles.forEach(particle => {
      const alpha = clamp(mapRange(particle.life, 0, 40, 0, 1), 0, 1);
      ctx.fillStyle = `rgba(${particle.color[0]}, ${particle.color[1]}, ${particle.color[2]}, ${alpha})`;
      ctx.beginPath();
      ctx.ellipse(particle.x, particle.y, 2.5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function generatePlatforms() {
    let highest = Number.POSITIVE_INFINITY;
    platforms.forEach(platform => {
      if (platform.alive && platform.y < highest) highest = platform.y;
    });

    const diff = clamp(score / 6000, 0, 1);
    const maxGap = 90 + diff * 50;
    const breakChance = 0.06 + diff * 0.12;
    const moveChance = 0.12 + diff * 0.12;

    while (highest > cam - 400) {
      const newY = highest - rand(50, maxGap);
      const newX = rand(PLATFORM_W / 2 + 5, WIDTH - PLATFORM_W / 2 - 5);
      let type = 0;
      const roll = Math.random();
      if (roll < breakChance) type = 2;
      else if (roll < breakChance + moveChance) type = 1;

      platforms.push({
        x: newX,
        y: newY,
        type,
        dir: Math.random() > 0.5 ? 1 : -1,
        alive: true
      });

      if (type === 0 && Math.random() < 0.065) {
        powerUps.push({
          x: newX,
          y: newY - 25,
          type: Math.random() < 0.7 ? 0 : 1,
          active: true
        });
      }

      highest = newY;
    }
  }

  function cleanUp() {
    const bottom = cam + HEIGHT + 200;
    platforms = platforms.filter(platform => platform.alive && platform.y <= bottom);
    powerUps = powerUps.filter(powerUp => powerUp.active && powerUp.y <= bottom);
  }

  return {
    onActivate,
    handleKeyDown,
    handleKeyUp,
    handlePointerDown,
    handlePointerMove,
    handlePointerLeave,
    handleTouchAction,
    tick,
    render
  };

  function createDoodleClouds() {
    const nextClouds = [];
    for (let i = 0; i < 10; i += 1) {
      nextClouds.push({
        x: rand(0, WIDTH),
        y: rand(-2000, HEIGHT),
        size: rand(60, 130),
        speed: rand(0.15, 0.45)
      });
    }
    return nextClouds;
  }
}

function createSpaceInvadersGame({ onStatus, onScore }) {
  const WIDTH = 800;
  const HEIGHT = 600;
  const pointer = { x: -9999, y: -9999 };
  const alienTexture = createAlienTexture();

  let state = GAME_STATE_MENU;
  let score = 0;
  let scoreSent = false;
  let leftPressed = false;
  let rightPressed = false;
  let firePressed = false;
  let fireCooldown = 0;
  let player = null;
  let playerBullets = [];
  let alienBullets = [];
  let aliens = [];
  let stars = [];

  function onActivate() {
    state = GAME_STATE_MENU;
    score = 0;
    scoreSent = false;
    leftPressed = false;
    rightPressed = false;
    firePressed = false;
    fireCooldown = 0;
    setupRound();
    onStatus('Space Invaders Klone ist bereit.');
  }

  function setupRound() {
    player = { x: WIDTH / 2, w: 40, h: 20 };
    playerBullets = [];
    alienBullets = [];
    aliens = [];
    stars = [];
    score = 0;
    scoreSent = false;
    fireCooldown = 0;

    for (let i = 0; i < 150; i += 1) {
      stars.push({
        x: rand(0, WIDTH),
        y: rand(0, HEIGHT),
        size: rand(1, 3)
      });
    }

    for (let i = 0; i < 10; i += 1) {
      for (let j = 0; j < 5; j += 1) {
        aliens.push({
          x: i * 60 + 80,
          y: j * 50 + 50,
          r: 15,
          imgSize: 36,
          xdir: 1,
          speed: 2
        });
      }
    }
  }

  function startGame() {
    state = GAME_STATE_PLAYING;
    setupRound();
    onStatus('Aliens gesichtet. Feuer frei.');
  }

  function finishGame(nextState, message) {
    if (state !== GAME_STATE_PLAYING) return;
    state = nextState;
    if (!scoreSent) {
      scoreSent = true;
      void onScore(score);
    }
    onStatus(message);
  }

  function handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowLeft' || key === 'a') leftPressed = true;
    if (event.key === 'ArrowRight' || key === 'd') rightPressed = true;

    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      firePressed = true;
      if (state === GAME_STATE_MENU) {
        startGame();
        return;
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (state !== GAME_STATE_PLAYING) {
        startGame();
      }
    }

    if (key === 'r' && state !== GAME_STATE_PLAYING) {
      startGame();
    }
  }

  function handleKeyUp(event) {
    const key = event.key.toLowerCase();
    if (event.key === 'ArrowLeft' || key === 'a') leftPressed = false;
    if (event.key === 'ArrowRight' || key === 'd') rightPressed = false;
    if (event.key === ' ' || event.key === 'Spacebar') firePressed = false;
  }

  function handlePointerDown(point) {
    pointer.x = point.x;
    pointer.y = point.y;
    if (state === GAME_STATE_MENU && hitButton(point.x, point.y, WIDTH / 2, HEIGHT / 2 + 45, 240, 56)) {
      startGame();
    } else if (state !== GAME_STATE_PLAYING && hitButton(point.x, point.y, WIDTH / 2, HEIGHT / 2 + 90, 240, 52)) {
      startGame();
    }
  }

  function handlePointerMove(point) {
    pointer.x = point.x;
    pointer.y = point.y;
  }

  function handlePointerLeave() {
    pointer.x = -9999;
    pointer.y = -9999;
  }

  function handleTouchAction(action, pressed) {
    if (action === 'left') leftPressed = pressed;
    if (action === 'right') rightPressed = pressed;
    if (action === 'fire') {
      firePressed = pressed;
      if (pressed && state !== GAME_STATE_PLAYING) {
        startGame();
      }
    }
  }

  function tick() {
    updateStars();

    if (state === GAME_STATE_MENU || state === GAME_STATE_GAME_OVER || state === GAME_STATE_WIN) return;
    if (state !== GAME_STATE_PLAYING) return;

    if (leftPressed) player.x -= 5;
    if (rightPressed) player.x += 5;
    player.x = clamp(player.x, player.w / 2, WIDTH - player.w / 2);

    if (fireCooldown > 0) fireCooldown -= 1;
    if (firePressed) firePlayerBullet();

    for (let i = playerBullets.length - 1; i >= 0; i -= 1) {
      const bullet = playerBullets[i];
      bullet.y += bullet.vy;

      let hit = false;
      for (let j = aliens.length - 1; j >= 0; j -= 1) {
        const alien = aliens[j];
        if (distance(bullet.x, bullet.y, alien.x, alien.y) < bullet.r + alien.r) {
          aliens.splice(j, 1);
          score += 10;
          hit = true;
          break;
        }
      }

      if (hit || bullet.y < 0) {
        playerBullets.splice(i, 1);
      }
    }

    for (let i = alienBullets.length - 1; i >= 0; i -= 1) {
      const bullet = alienBullets[i];
      bullet.y += bullet.vy;

      if (hitsPlayerShip(bullet, player)) {
        finishGame(GAME_STATE_GAME_OVER, `Getroffen. Endstand ${score}.`);
        return;
      }

      if (bullet.y > HEIGHT) {
        alienBullets.splice(i, 1);
      }
    }

    let edgeHit = false;
    aliens.forEach(alien => {
      alien.x += alien.xdir * alien.speed;

      if (Math.random() * 1000 < 1.5) {
        alienBullets.push({ x: alien.x, y: alien.y + alien.r, vy: 5, r: 3 });
      }

      if (alien.x > WIDTH - alien.r || alien.x < alien.r) edgeHit = true;
      if (alien.y > HEIGHT - player.h - alien.r) {
        finishGame(GAME_STATE_GAME_OVER, 'Die Aliens haben die Verteidigung durchbrochen.');
      }
    });

    if (state !== GAME_STATE_PLAYING) return;

    if (edgeHit) {
      aliens.forEach(alien => {
        alien.xdir *= -1;
        alien.y += 20;
      });
    }

    if (!aliens.length) {
      finishGame(GAME_STATE_WIN, `Sieg! Endstand ${score}.`);
    }
  }

  function render() {
    drawSpaceBackground();
    drawStars();

    if (state === GAME_STATE_MENU) {
      drawSpaceMenu();
      return;
    }

    drawPlayerShip();
    drawPlayerBullets();
    drawAlienBullets();
    drawAliens();
    drawSpaceHud();

    if (state === GAME_STATE_GAME_OVER) drawSpaceEndScreen('GAME OVER', '#ff5050', `Endstand: ${score}`);
    if (state === GAME_STATE_WIN) drawSpaceEndScreen('SIEG!', '#5dff7f', `Endstand: ${score}`);
  }

  function firePlayerBullet() {
    if (fireCooldown > 0 || state !== GAME_STATE_PLAYING) return;
    playerBullets.push({ x: player.x, y: HEIGHT - 30, vy: -7, r: 3 });
    fireCooldown = 10;
  }

  function updateStars() {
    stars.forEach(star => {
      star.y += star.size * 0.5;
      if (star.y > HEIGHT) {
        star.y = 0;
        star.x = rand(0, WIDTH);
      }
    });
  }

  function drawSpaceBackground() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  function drawStars() {
    stars.forEach(star => {
      const brightness = rand(150, 255);
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
      ctx.beginPath();
      ctx.ellipse(star.x, star.y, star.size, star.size, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPlayerShip() {
    ctx.save();
    ctx.translate(player.x, HEIGHT - player.h / 2 - 10);
    ctx.fillStyle = '#00ff66';
    ctx.fillRect(-player.w / 2, -player.h / 2, player.w, player.h);
    ctx.fillRect(-5, -player.h / 2 - 15, 10, 15);
    ctx.restore();
  }

  function drawPlayerBullets() {
    playerBullets.forEach(bullet => drawSpaceBullet(bullet, '#00ff66'));
  }

  function drawAlienBullets() {
    alienBullets.forEach(bullet => drawSpaceBullet(bullet, '#ff4545'));
  }

  function drawSpaceBullet(bullet, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(bullet.x, bullet.y, bullet.r * 2, bullet.r * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAliens() {
    aliens.forEach(alien => {
      ctx.drawImage(alienTexture, alien.x - alien.imgSize / 2, alien.y - alien.imgSize / 2, alien.imgSize, alien.imgSize);
    });
  }

  function drawSpaceHud() {
    roundedRect(ctx, 12, 12, 170, 44, 12, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Score: ${score}`, 24, 34);

    if (activeHighScore > 0) {
      ctx.font = '16px Arial';
      const label = `Rekord: ${activeHighScore}`;
      const boxWidth = ctx.measureText(label).width + 28;
      roundedRect(ctx, WIDTH - boxWidth - 12, 12, boxWidth, 36, 12, 'rgba(0,0,0,0.55)');
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd86a';
      ctx.fillText(label, WIDTH - 24, 30);
    }
  }

  function drawSpaceMenu() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5dff7f';
    ctx.font = 'bold 56px Arial';
    ctx.fillText('SPACE', WIDTH / 2, HEIGHT / 2 - 140);
    ctx.fillText('INVADERS', WIDTH / 2, HEIGHT / 2 - 82);
    ctx.fillStyle = '#fff';
    ctx.font = '22px Arial';
    ctx.fillText('KLONE', WIDTH / 2, HEIGHT / 2 - 28);
    drawButton(ctx, pointer, WIDTH / 2, HEIGHT / 2 + 45, 240, 56, 'STARTEN', '#2EAE2E', '#4ADE4A');
    ctx.fillStyle = '#9aa4b2';
    ctx.font = '18px Arial';
    ctx.fillText('Links / Rechts bewegen, Leertaste feuert', WIDTH / 2, HEIGHT - 70);
    ctx.fillText('Aliens abschiessen und roten Schuessen ausweichen', WIDTH / 2, HEIGHT - 40);
  }

  function drawSpaceEndScreen(title, accentColor, subtitle) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    roundedRect(ctx, WIDTH / 2 - 190, HEIGHT / 2 - 140, 380, 280, 18, 'rgba(16, 18, 32, 0.94)');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 48px Arial';
    ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 76);
    ctx.fillStyle = '#fff';
    ctx.font = '24px Arial';
    ctx.fillText(subtitle, WIDTH / 2, HEIGHT / 2 - 16);
    ctx.font = '18px Arial';
    ctx.fillStyle = '#ffd86a';
    ctx.fillText(`Rekord: ${activeHighScore}`, WIDTH / 2, HEIGHT / 2 + 20);
    drawButton(ctx, pointer, WIDTH / 2, HEIGHT / 2 + 90, 240, 52, 'NOCHMAL', '#2EAE2E', '#4ADE4A');
  }

  function createAlienTexture() {
    const offscreen = document.createElement('canvas');
    offscreen.width = 16;
    offscreen.height = 16;
    const off = offscreen.getContext('2d');
    const pattern = [
      [0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0],
      [0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0],
      [0,1,1,0,1,1,1,0,1,1,1,0,1,1,0,0],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [1,0,1,1,1,1,1,1,1,1,1,1,1,0,1,0],
      [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1,0],
      [0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0]
    ];
    off.clearRect(0, 0, 16, 16);
    off.fillStyle = '#00ff66';

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (pattern[y][x] === 1) {
          off.fillRect(x, y, 1, 1);
          off.fillRect(x, 15 - y, 1, 1);
        }
      }
    }

    return offscreen;
  }

  return {
    onActivate,
    handleKeyDown,
    handleKeyUp,
    handlePointerDown,
    handlePointerMove,
    handlePointerLeave,
    handleTouchAction,
    tick,
    render
  };
}

function resolvePlayerIdentity(currentUser, profile) {
  const userId = normalizeUserId(currentUser?.id);
  const username = resolveUsername(currentUser, profile);
  const loginId = normalizeLookupKey(username);
  const found = PLAYER_BY_USER_ID[userId] || PLAYER_BY_LOGIN_ID[loginId];

  if (found) {
    return {
      ...found,
      username,
      assetLabel: found.sprite.split('/').pop() || found.sprite
    };
  }

  return {
    key: loginId || 'default',
    label: beautifyUsername(username),
    sprite: DEFAULT_PLAYER_SPRITE,
    username,
    assetLabel: DEFAULT_PLAYER_SPRITE.split('/').pop() || DEFAULT_PLAYER_SPRITE
  };
}

function resolveUsername(currentUser, profile) {
  return String(
    profile?.username
      || currentUser?.user_metadata?.username
      || currentUser?.email?.split('@')[0]
      || 'mitglied'
  ).trim();
}

function normalizeLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function normalizeUserId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeGameKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized in GAME_CONFIGS ? normalized : '';
}

function beautifyUsername(value) {
  const cleaned = String(value || 'Mitglied').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Mitglied';
}

function drawDoodleSky(targetCtx, width, height) {
  const gradient = targetCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#D6EEFF');
  targetCtx.fillStyle = gradient;
  targetCtx.fillRect(0, 0, width, height);
}

function drawDoodleClouds(targetCtx, clouds, camOffset, height) {
  targetCtx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  clouds.forEach(cloud => {
    let y = (cloud.y - camOffset * cloud.speed) % (height + 200);
    if (y < -100) y += height + 300;
    drawCloud(targetCtx, cloud.x, y, cloud.size);
  });
}

function drawCloud(targetCtx, x, y, size) {
  targetCtx.beginPath();
  targetCtx.ellipse(x, y, size / 2, size * 0.25, 0, 0, Math.PI * 2);
  targetCtx.ellipse(x - size * 0.3, y + 5, size * 0.35, size * 0.175, 0, 0, Math.PI * 2);
  targetCtx.ellipse(x + size * 0.35, y + 5, size * 0.3, size * 0.15, 0, 0, Math.PI * 2);
  targetCtx.fill();
}

function drawDoodleHud(targetCtx, width, score, highScore, jetpack, jetpackTimer, jetpackDuration) {
  roundedRect(targetCtx, 10, 10, 160, 42, 10, 'rgba(0,0,0,0.5)');
  targetCtx.fillStyle = '#fff';
  targetCtx.font = 'bold 24px Arial';
  targetCtx.textAlign = 'left';
  targetCtx.textBaseline = 'middle';
  targetCtx.fillText(`Punkte: ${score}`, 22, 31);

  if (highScore > 0) {
    targetCtx.font = '16px Arial';
    const label = `Rekord: ${highScore}`;
    const boxWidth = targetCtx.measureText(label).width + 26;
    roundedRect(targetCtx, width - boxWidth - 10, 10, boxWidth, 34, 10, 'rgba(0,0,0,0.5)');
    targetCtx.textAlign = 'right';
    targetCtx.fillStyle = '#FFD700';
    targetCtx.fillText(label, width - 18, 27);
  }

  if (jetpack) {
    const barWidth = 130;
    const barHeight = 26;
    const pct = jetpackTimer / jetpackDuration;
    roundedRect(targetCtx, width / 2 - (barWidth + 10) / 2, 58 - (barHeight + 6) / 2, barWidth + 10, barHeight + 6, 8, 'rgba(0,0,0,0.5)');
    roundedRect(targetCtx, width / 2 - barWidth / 2, 58 - barHeight / 2, barWidth * pct, barHeight, 6, '#FF8800');
    targetCtx.fillStyle = '#fff';
    targetCtx.font = '13px Arial';
    targetCtx.textAlign = 'center';
    targetCtx.fillText('JETPACK', width / 2, 58);
  }
}

function drawButton(targetCtx, pointer, x, y, width, height, label, baseColor, hoverColor) {
  const hovered = hitButton(pointer.x, pointer.y, x, y, width, height);
  roundedRect(targetCtx, x - width / 2, y - height / 2, width, height, 14, hovered ? hoverColor : baseColor);
  roundedRect(targetCtx, x - (width - 10) / 2, y - height / 2, width - 10, height / 2 - 2, 12, 'rgba(255,255,255,0.22)');
  targetCtx.fillStyle = '#fff';
  targetCtx.font = 'bold 24px Arial';
  targetCtx.textAlign = 'center';
  targetCtx.textBaseline = 'middle';
  targetCtx.fillText(label, x, y - 1);
}

function roundedRect(targetCtx, x, y, width, height, radius, fillStyle) {
  targetCtx.fillStyle = fillStyle;
  pathRoundedRect(targetCtx, x, y, width, height, radius);
  targetCtx.fill();
}

function pathRoundedRect(targetCtx, x, y, width, height, radius) {
  targetCtx.beginPath();
  targetCtx.moveTo(x + radius, y);
  targetCtx.lineTo(x + width - radius, y);
  targetCtx.quadraticCurveTo(x + width, y, x + width, y + radius);
  targetCtx.lineTo(x + width, y + height - radius);
  targetCtx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  targetCtx.lineTo(x + radius, y + height);
  targetCtx.quadraticCurveTo(x, y + height, x, y + height - radius);
  targetCtx.lineTo(x, y + radius);
  targetCtx.quadraticCurveTo(x, y, x + radius, y);
  targetCtx.closePath();
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function hitButton(x, y, bx, by, bw, bh) {
  return x > bx - bw / 2 && x < bx + bw / 2 && y > by - bh / 2 && y < by + bh / 2;
}

function hitsPlayerShip(bullet, player) {
  return bullet.x > player.x - player.w / 2
    && bullet.x < player.x + player.w / 2
    && bullet.y > canvas.height - player.h - 20
    && bullet.y < canvas.height;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const ratio = (value - inMin) / (inMax - inMin || 1);
  return outMin + ratio * (outMax - outMin);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
