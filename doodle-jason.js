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
const statusText = document.getElementById('gameStatusText');
const touchButtons = [...document.querySelectorAll('[data-touch]')];
const playerAvatarPreview = document.getElementById('playerAvatarPreview');
const playerAvatarName = document.getElementById('playerAvatarName');
const playerAvatarHint = document.getElementById('playerAvatarHint');
const myBestScoreEl = document.getElementById('myBestScore');
const globalBestScoreEl = document.getElementById('globalBestScore');
const leaderboardList = document.getElementById('leaderboardList');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const MENU = 0;
const PLAYING = 1;
const GAME_OVER = 2;
const GRAVITY = 0.45;
const JUMP_FORCE = -11.5;
const SUPER_JUMP = -18.0;
const MOVE_SPEED = 5.5;
const PLAYER_W = 50;
const PLAYER_H = 50;
const PLATFORM_W = 70;
const PLATFORM_H = 14;
const JETPACK_DUR = 120;
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

const userProfile = await getProfile(user.id);
const playerIdentity = resolvePlayerIdentity(user, userProfile);
const LOCAL_SCORE_KEY = `ragebaiters:doodle-jason-highscore:${playerIdentity.key}:${user.id}`;

let state = MENU;
let frameCount = 0;
let menuBounce = 0;
let px = 0;
let py = 0;
let vx = 0;
let vy = 0;
let cam = 0;
let keyL = false;
let keyR = false;
let facingR = true;
let score = 0;
let highScore = Number(localStorage.getItem(LOCAL_SCORE_KEY) || 0) || 0;
let lastRunWasHighScore = false;
let jetpack = false;
let jetpackTimer = 0;
let leaderboardEntries = [];
let scoreSubmitPending = false;

let platforms = [];
let powerUps = [];
let particles = [];
let clouds = [];

const playerImg = new Image();
playerImg.src = playerIdentity.sprite;

setupClouds();
setupInput();
syncPlayerUi();
await loadLeaderboard();
setStatus(`${playerIdentity.label} ist freigeschaltet.`);

let lastTime = performance.now();
let accumulator = 0;
const FIXED_STEP = 1000 / 60;

requestAnimationFrame(loop);

function setupClouds() {
  clouds = [];
  for (let i = 0; i < 10; i += 1) {
    clouds.push({
      x: rand(0, WIDTH),
      y: rand(-2000, HEIGHT),
      size: rand(60, 130),
      speed: rand(0.15, 0.45)
    });
  }
}

function setupInput() {
  window.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keyL = true;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keyR = true;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (state !== PLAYING) startGame();
    }
  });

  window.addEventListener('keyup', event => {
    if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') keyL = false;
    if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') keyR = false;
  });

  canvas.addEventListener('pointerdown', event => {
    const { x, y } = getCanvasPoint(event);
    if (state === MENU && hitButton(x, y, WIDTH / 2, HEIGHT / 2 + 40, 210, 54)) {
      startGame();
    } else if (state === GAME_OVER && hitButton(x, y, WIDTH / 2, HEIGHT / 2 + 85, 200, 48)) {
      startGame();
    }
  });

  touchButtons.forEach(button => {
    const direction = button.dataset.touch;
    const setPressed = pressed => {
      button.classList.toggle('is-active', pressed);
      if (direction === 'left') keyL = pressed;
      if (direction === 'right') keyR = pressed;
    };

    ['pointerdown', 'pointerenter'].forEach(type => {
      button.addEventListener(type, event => {
        if (event.buttons === 0 && type === 'pointerenter') return;
        setPressed(true);
      });
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => {
      button.addEventListener(type, () => setPressed(false));
    });
  });
}

function startGame() {
  state = PLAYING;
  initGame();
  setStatus(`${playerIdentity.label} ist unterwegs.`);
}

function initGame() {
  platforms = [];
  powerUps = [];
  particles = [];

  px = WIDTH / 2;
  py = HEIGHT - 120;
  vx = 0;
  vy = 0;
  cam = 0;
  score = 0;
  lastRunWasHighScore = false;
  jetpack = false;
  jetpackTimer = 0;
  keyL = false;
  keyR = false;
  facingR = true;

  platforms.push({ x: WIDTH / 2, y: HEIGHT - 60, type: 0, dir: 0, alive: true });

  let y = HEIGHT - 160;
  while (y > -HEIGHT * 3) {
    const x = rand(PLATFORM_W / 2 + 5, WIDTH - PLATFORM_W / 2 - 5);
    let type = 0;
    const roll = Math.random();
    if (y < HEIGHT - 400 && roll < 0.10) type = 2;
    else if (y < HEIGHT - 250 && roll < 0.22) type = 1;

    const dir = Math.random() > 0.5 ? 1 : -1;
    platforms.push({ x, y, type, dir, alive: true });

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

function loop(now) {
  accumulator += Math.min(80, now - lastTime);
  lastTime = now;

  while (accumulator >= FIXED_STEP) {
    tick();
    accumulator -= FIXED_STEP;
  }

  render();
  requestAnimationFrame(loop);
}

function tick() {
  frameCount += 1;
  if (state === MENU) {
    menuBounce += 0.04;
    return;
  }

  if (state !== PLAYING) return;
  updateGame();
}

function updateGame() {
  if (keyL) {
    vx = -MOVE_SPEED;
    facingR = false;
  } else if (keyR) {
    vx = MOVE_SPEED;
    facingR = true;
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
    lastRunWasHighScore = score > highScore;
    if (lastRunWasHighScore) {
      highScore = score;
      localStorage.setItem(LOCAL_SCORE_KEY, String(highScore));
    }
    state = GAME_OVER;
    syncScoreUi();
    void persistHighScore(score);
    setStatus(lastRunWasHighScore ? `${playerIdentity.label} hat einen neuen Rekord gesetzt.` : `${playerIdentity.label} ist abgestuerzt.`);
  }
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

function render() {
  drawSky();
  drawClouds(state === MENU ? 0 : cam);

  if (state === MENU) {
    drawMenu();
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
  drawHud();

  if (state === GAME_OVER) drawGameOver();
}

function drawMenu() {
  const bounce = Math.sin(menuBounce) * 8;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.font = 'bold 48px Arial';
  ctx.fillText('DOODLE', WIDTH / 2 + 2, HEIGHT / 4 - 26 + bounce + 2);
  ctx.fillText('JASON', WIDTH / 2 + 2, HEIGHT / 4 + 32 + bounce + 2);

  ctx.fillStyle = '#FFD700';
  ctx.fillText('DOODLE', WIDTH / 2, HEIGHT / 4 - 26 + bounce);
  ctx.fillStyle = '#32CD32';
  ctx.fillText('JASON', WIDTH / 2, HEIGHT / 4 + 32 + bounce);

  ctx.fillStyle = '#505050';
  ctx.font = '16px Arial';
  ctx.fillText('Ein Doodle Jump Klon', WIDTH / 2, HEIGHT / 4 + 78);

  drawButton(WIDTH / 2, HEIGHT / 2 + 40, 210, 54, 'SPIELEN', '#2EAE2E', '#4ADE4A');

  if (highScore > 0) {
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Rekord: ${highScore}`, WIDTH / 2, HEIGHT / 2 + 95);
  }

  ctx.fillStyle = '#666';
  ctx.fillText('Pfeiltasten oder Touch-Buttons zum Steuern', WIDTH / 2, HEIGHT - 55);
  ctx.fillText('Springe auf Plattformen nach oben', WIDTH / 2, HEIGHT - 32);
}

function drawButton(x, y, width, height, label, baseColor, hoverColor) {
  const hovered = hitButton(lastPointer.x, lastPointer.y, x, y, width, height);
  roundedRect(x - width / 2, y - height / 2, width, height, 14, hovered ? hoverColor : baseColor);
  roundedRect(x - (width - 10) / 2, y - height / 2, width - 10, height / 2 - 2, 12, 'rgba(255,255,255,0.22)');

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y - 1);
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, '#87CEEB');
  gradient.addColorStop(1, '#D6EEFF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawClouds(camOffset) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  clouds.forEach(cloud => {
    let y = (cloud.y - camOffset * cloud.speed) % (HEIGHT + 200);
    if (y < -100) y += HEIGHT + 300;
    drawCloud(cloud.x, y, cloud.size);
  });
}

function drawCloud(x, y, size) {
  ctx.beginPath();
  ctx.ellipse(x, y, size / 2, size * 0.25, 0, 0, Math.PI * 2);
  ctx.ellipse(x - size * 0.3, y + 5, size * 0.35, size * 0.175, 0, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.35, y + 5, size * 0.3, size * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatform(platform) {
  if (platform.type === 0) {
    roundedRect(platform.x - PLATFORM_W / 2, platform.y - PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, 6, '#22A822');
    roundedRect(platform.x - (PLATFORM_W - 6) / 2, platform.y - PLATFORM_H / 2 - 2, PLATFORM_W - 6, PLATFORM_H - 5, 5, '#3CD83C');
    return;
  }

  if (platform.type === 1) {
    roundedRect(platform.x - PLATFORM_W / 2, platform.y - PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, 6, '#2878C8');
    roundedRect(platform.x - (PLATFORM_W - 6) / 2, platform.y - PLATFORM_H / 2 - 2, PLATFORM_W - 6, PLATFORM_H - 5, 5, '#48A8F0');
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

  roundedRect(platform.x - PLATFORM_W / 2, platform.y - PLATFORM_H / 2, PLATFORM_W, PLATFORM_H, 6, '#8B5E3C');
  roundedRect(platform.x - (PLATFORM_W - 6) / 2, platform.y - PLATFORM_H / 2 - 2, PLATFORM_W - 6, PLATFORM_H - 5, 5, '#A97B50');
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
    roundedRect(-11, 7, 22, 7, 2, '#DD3333');
    ctx.strokeStyle = '#DD3333';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const top = -6 + Math.sin(frameCount * 0.12) * 3;
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
    roundedRect(-10, -14, 20, 28, 5, '#606878');
    roundedRect(-7, -12, 14, 18, 3, '#7888A0');
    const flameHeight = 10 + Math.sin(frameCount * 0.35) * 5;
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
  if (!facingR) ctx.scale(-1, 1);

  if (playerImg.complete && playerImg.naturalWidth > 0) {
    const bounceScaleY = 1 + Math.min(Math.abs(vy) / 40, 0.08);
    const bounceScaleX = 1 - Math.min(Math.abs(vy) / 60, 0.05);
    const glowRadius = 34;

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
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(playerImg, -glowRadius, -glowRadius, glowRadius * 2, glowRadius * 2);
    ctx.restore();

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = '#3090FF';
    ctx.beginPath();
    ctx.ellipse(0, 0, PLAYER_W / 2, PLAYER_H / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (jetpack) {
    const flameHeight = 18 + Math.sin(frameCount * 0.35) * 10;
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

async function loadLeaderboard() {
  let myResult;
  let leaderboardResult;

  try {
    [myResult, leaderboardResult] = await Promise.all([
      supabase.rpc('get_doodle_jason_my_highscore'),
      supabase.rpc('get_doodle_jason_leaderboard')
    ]);
  } catch (error) {
    console.error('[Doodle Jason] Leaderboard-Request ist fehlgeschlagen:', error);
    syncScoreUi();
    renderLeaderboard('Leaderboard konnte gerade nicht geladen werden.');
    return;
  }

  if (!myResult.error) {
    const remoteHighScore = Number(myResult.data || 0) || 0;
    highScore = Math.max(highScore, remoteHighScore);
    localStorage.setItem(LOCAL_SCORE_KEY, String(highScore));
  } else {
    console.error('[Doodle Jason] Eigener Highscore konnte nicht geladen werden:', myResult.error);
  }

  if (!leaderboardResult.error) {
    leaderboardEntries = Array.isArray(leaderboardResult.data) ? leaderboardResult.data : [];
  } else {
    console.error('[Doodle Jason] Leaderboard konnte nicht geladen werden:', leaderboardResult.error);
    leaderboardEntries = [];
  }

  syncScoreUi();
  renderLeaderboard(leaderboardResult?.error ? 'Leaderboard konnte gerade nicht geladen werden.' : '');
}

async function persistHighScore(points) {
  if (scoreSubmitPending || !Number.isFinite(points) || points <= 0) return;
  scoreSubmitPending = true;

  try {
    const { data, error } = await supabase.rpc('submit_doodle_jason_score', {
      p_score: Math.max(0, Math.floor(points))
    });

    if (error) {
      console.error('[Doodle Jason] Highscore konnte nicht gespeichert werden:', error);
      return;
    }

    highScore = Math.max(highScore, Number(data || 0) || 0);
    localStorage.setItem(LOCAL_SCORE_KEY, String(highScore));
    await loadLeaderboard();
  } finally {
    scoreSubmitPending = false;
  }
}

function syncPlayerUi() {
  if (playerAvatarPreview) {
    playerAvatarPreview.src = playerIdentity.sprite;
    playerAvatarPreview.alt = `${playerIdentity.label} Spielfigur`;
  }

  if (playerAvatarName) {
    playerAvatarName.textContent = `${playerIdentity.label} ist der springende Kopf`;
  }

  if (playerAvatarHint) {
    playerAvatarHint.textContent = `Login erkannt als ${playerIdentity.username}. Im Spiel huepft direkt ${playerIdentity.assetLabel} als Ball herum.`;
  }

  syncScoreUi();
}

function syncScoreUi() {
  if (myBestScoreEl) myBestScoreEl.textContent = String(highScore || 0);

  if (globalBestScoreEl) {
    const champion = leaderboardEntries[0];
    globalBestScoreEl.textContent = champion
      ? `${champion.username || 'Unbekannt'} · ${champion.best_score || 0}`
      : '-';
  }
}

function renderLeaderboard(message = '') {
  if (!leaderboardList) return;

  if (!leaderboardEntries.length) {
    leaderboardList.innerHTML = `<div class="game-scoreboard-empty">${escapeHtml(message || 'Noch kein globaler Highscore verfuegbar.')}</div>`;
    return;
  }

  leaderboardList.innerHTML = leaderboardEntries
    .map((entry, index) => {
      const username = escapeHtml(entry.username || 'Unbekannt');
      const scoreValue = Number(entry.best_score || 0) || 0;
      const isCurrentUser = Boolean(entry.is_current_user)
        || normalizeLookupKey(entry.username) === normalizeLookupKey(playerIdentity.username);

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

function beautifyUsername(value) {
  const cleaned = String(value || 'Mitglied').trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Mitglied';
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

function drawParticles() {
  particles.forEach(particle => {
    const alpha = clamp(mapRange(particle.life, 0, 40, 0, 1), 0, 1);
    ctx.fillStyle = `rgba(${particle.color[0]}, ${particle.color[1]}, ${particle.color[2]}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(particle.x, particle.y, 2.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHud() {
  roundedRect(10, 10, 160, 42, 10, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`Punkte: ${score}`, 22, 31);

  if (highScore > 0) {
    ctx.font = '16px Arial';
    const label = `Rekord: ${highScore}`;
    const width = ctx.measureText(label).width + 26;
    roundedRect(WIDTH - width - 10, 10, width, 34, 10, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'right';
    ctx.fillText(label, WIDTH - 18, 27);
  }

  if (jetpack) {
    const barWidth = 130;
    const barHeight = 26;
    const pct = jetpackTimer / JETPACK_DUR;
    roundedRect(WIDTH / 2 - (barWidth + 10) / 2, 58 - (barHeight + 6) / 2, barWidth + 10, barHeight + 6, 8, 'rgba(0,0,0,0.5)');
    roundedRect(WIDTH / 2 - barWidth / 2, 58 - barHeight / 2, barWidth * pct, barHeight, 6, '#FF8800');
    ctx.fillStyle = '#fff';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('JETPACK', WIDTH / 2, 58);
  }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.66)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  roundedRect(WIDTH / 2 - 155, HEIGHT / 2 - 160, 310, 300, 16, 'rgba(35,35,55,0.92)');
  ctx.strokeStyle = '#FF5555';
  ctx.lineWidth = 3;
  pathRoundedRect(WIDTH / 2 - 155, HEIGHT / 2 - 160, 310, 300, 16);
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
  ctx.font = '16px Arial';
  if (lastRunWasHighScore && score > 0) {
    ctx.fillText('NEUER REKORD!', WIDTH / 2, HEIGHT / 2 - 10);
  }
  ctx.font = '18px Arial';
  ctx.fillText(`Rekord: ${highScore}`, WIDTH / 2, HEIGHT / 2 + 20);

  drawButton(WIDTH / 2, HEIGHT / 2 + 85, 200, 48, 'NOCHMAL', '#2EAE2E', '#4ADE4A');
}

const lastPointer = { x: -9999, y: -9999 };
canvas.addEventListener('pointermove', event => {
  const point = getCanvasPoint(event);
  lastPointer.x = point.x;
  lastPointer.y = point.y;
});
canvas.addEventListener('pointerleave', () => {
  lastPointer.x = -9999;
  lastPointer.y = -9999;
});

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function hitButton(x, y, bx, by, bw, bh) {
  return x > bx - bw / 2 && x < bx + bw / 2 && y > by - bh / 2 && y < by + bh / 2;
}

function roundedRect(x, y, width, height, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  pathRoundedRect(x, y, width, height, radius);
  ctx.fill();
}

function pathRoundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function mapRange(value, inMin, inMax, outMin, outMax) {
  const ratio = (value - inMin) / (inMax - inMin || 1);
  return outMin + ratio * (outMax - outMin);
}
