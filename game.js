'use strict';

const SIZE = 4;
const LONGEST = 10;
const POINTS = { 3: 1, 4: 2, 5: 4, 6: 6, 7: 9, 8: 12, 9: 16, 10: 25 };
const BONUS_POINTS = 10;
const MIN_BOARD_WORDS = 25;
const HINT_PENALTY = 5;

// Signal-strength bars: one, two or three lit
const bars = n => [[14, 22], [34, 36], [54, 50]].map(([x, h], k) =>
  `<rect fill="#fff" x="${x}" y="${66 - h}" width="13" height="${h}" rx="3" opacity="${k < n ? 1 : 0.32}"/>`).join('');

// Shown as three difficulty levels plus a timed mode. The ids are the original game's mode names.
const MODES = {
  rasyonel: { name: 'KOLAY', desc: 'Her kelime 1 puan', seconds: 90, flat: true, icon: bars(1) },
  klasik: { name: 'ORTA', desc: 'Uzun kelime, çok puan', seconds: 90, icon: bars(2) },
  idealist: { name: 'UZMAN', desc: '10 harfli kelimeyi bul', seconds: 120, icon: bars(3) },
  marjinal: { name: 'ZAMANLI', desc: 'Kelime buldukça süre kazan', seconds: 30, gain: true,
    icon: '<circle fill="#fff" cx="34" cy="48" r="22"/><rect fill="#fff" x="28" y="15" width="12" height="9" rx="2"/><path d="M34 35v13l8 6" fill="none" stroke="#ec8112" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M65 14v12M59 20h12" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>' },
};

// Filler letters, weighted by how often each appears in Turkish text
const FILLER = 'aaaaaaaaaaaaeeeeeeeeeiiiiiiiiinnnnnnnnrrrrrrrllllllııııııkkkkkdddddmmmmyyyuuutttsssbbbooüüşşzzgçhğvcöpf';

const upper = s => s.toLocaleUpperCase('tr-TR');
const $ = id => document.getElementById(id);

/* ---------- Board ---------- */

const WORDS = new Set(WORD_LIST);
const PREFIXES = new Set();
for (const w of WORD_LIST) for (let i = 1; i < w.length; i++) PREFIXES.add(w.slice(0, i));

const NEIGHBORS = [];
for (let i = 0; i < SIZE * SIZE; i++) {
  const r = Math.floor(i / SIZE), c = i % SIZE, list = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    const rr = r + dr, cc = c + dc;
    if ((dr || dc) && rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) list.push(rr * SIZE + cc);
  }
  NEIGHBORS.push(list);
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomPath(rng, length) {
  const walk = path => {
    if (path.length === length) return path;
    for (const n of shuffled(NEIGHBORS[path[path.length - 1]], rng)) {
      if (path.includes(n)) continue;
      const done = walk(path.concat(n));
      if (done) return done;
    }
    return null;
  };
  return walk([Math.floor(rng() * SIZE * SIZE)]);
}

function solve(letters) {
  const found = new Set();
  const visit = (i, word, used) => {
    word += letters[i];
    if (word.length >= 3 && WORDS.has(word)) found.add(word);
    if (word.length === LONGEST || !PREFIXES.has(word)) return;
    used |= 1 << i;
    for (const n of NEIGHBORS[i]) if (!(used & (1 << n))) visit(n, word, used);
  };
  for (let i = 0; i < letters.length; i++) visit(i, '', 0);
  return [...found];
}

// Same seed -> same board for every player
function makeBoard(seed) {
  for (let attempt = 0; ; attempt++) {
    const rng = rngFrom(seed + attempt * 7919);
    const secret = SEED_WORDS[Math.floor(rng() * SEED_WORDS.length)];
    const path = randomPath(rng, LONGEST);
    if (!path) continue;
    const letters = Array(SIZE * SIZE).fill('');
    path.forEach((cell, i) => { letters[cell] = secret[i]; });
    for (let i = 0; i < letters.length; i++) if (!letters[i]) letters[i] = FILLER[Math.floor(rng() * FILLER.length)];
    const words = solve(letters).sort((a, b) => b.length - a.length || a.localeCompare(b, 'tr'));
    if (words.length < MIN_BOARD_WORDS) continue;
    const clued = shuffled(words.filter(w => CLUES[w] && w.length >= 4 && w.length < LONGEST), rng);
    const bonus = clued[0] || null;
    const shown = bonus ? shuffled([...bonus].map((_, i) => i), rng).slice(0, Math.floor(bonus.length / 2)) : [];
    return { letters, words, bonus, shown };
  }
}

/* ---------- Particle effects (same engine as the civics flashcards app) ---------- */

const FX = (function () {
  const cv = document.createElement('canvas');
  Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 });
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const COLORS = ['#ffd766', '#f9a53c', '#ffffff', '#8be08f', '#63c26a', '#ffe9ad', '#ff9b6b'];
  let W, H, k, parts = [], raf = null, lastFrame = 0;
  function resize() {
    W = cv.width = innerWidth; H = cv.height = innerHeight;
    k = Math.max(0.6, Math.min(1, W / 700));      // slower, smaller sparks on phone-sized screens
  }
  addEventListener('resize', resize); resize();
  function add(p) { parts.push(p); if (!raf) { lastFrame = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    // Step by elapsed time, not by frame, so it runs at the same speed on 60 Hz and 120 Hz screens
    const f = Math.min(3, (now - lastFrame) / 16.667);
    lastFrame = now;
    ctx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += p.g * f;
      if (p.drag) { const d = Math.pow(p.drag, f); p.vx *= d; p.vy *= d; }
      p.x += p.vx * f; p.y += p.vy * f; p.rot += (p.spin || 0) * f; p.life -= p.decay * f;
      if (p.life <= 0 || p.y > H + 40) { parts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      if (p.type === 'star') { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.2)); drawStar(p); }
      else if (p.type === 'rect') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (!parts.length) { cancelAnimationFrame(raf); raf = null; ctx.clearRect(0, 0, W, H); }
  }
  function confetti(x, y) {
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * 6.2832, sp = (Math.random() * 7 + 2) * k;
      add({ type: 'rect', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5 * k, g: 0.32 * k, drag: 0.994,
        s: (Math.random() * 6 + 5) * k, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4,
        color: COLORS[(Math.random() * COLORS.length) | 0], life: 1, decay: 0.012 });
    }
  }
  function burst(x, y) {
    const n = 120, main = COLORS[(Math.random() * COLORS.length) | 0];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + Math.random() * 0.12, sp = (Math.random() * 5.5 + 1.5) * k;
      add({ type: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.055 * k, drag: 0.985,
        s: (Math.random() * 2 + 1.4) * Math.max(k, 0.8), color: Math.random() < 0.5 ? main : COLORS[(Math.random() * COLORS.length) | 0],
        life: 1, decay: 0.007 + Math.random() * 0.006 });
    }
  }
  function fireworks() {
    let c = 0;
    (function shoot() {
      if (c++ >= 10) return;
      burst(W * (0.12 + Math.random() * 0.76), H * (0.12 + Math.random() * 0.5));
      setTimeout(shoot, 220 + Math.random() * 260);
    })();
  }
  function drawStar(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? p.s * 0.44 : p.s, a = -Math.PI / 2 + i * Math.PI / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // Gold stars thrown out wide in every direction; drawn on the same canvas as the fireworks so
  // they move with the same fluid motion
  function stars(x, y) {
    const n = 18, tones = ['#ffd84f', '#ffe58a', '#f6bd2a', '#fff3c4'];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + Math.random() * 0.35, sp = (Math.random() * 4.5 + 5.5) * Math.max(k, 0.8);
      add({ type: 'star', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, g: 0.11, drag: 0.972,
        s: (Math.random() * 6 + 7) * Math.max(k, 0.8), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.16,
        color: tones[i % tones.length], life: 1, decay: 0.0125 + Math.random() * 0.004 });
    }
  }
  function sparkle(x, y) {
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * 6.2832, sp = (Math.random() * 3.2 + 0.6) * k;
      add({ type: 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.02, drag: 0.97,
        s: Math.random() * 1.8 + 1, color: Math.random() < 0.6 ? '#ffe58a' : '#ffffff', life: 1, decay: 0.02 + Math.random() * 0.015 });
    }
  }
  return { confetti, fireworks, sparkle, stars };
})();

/* ---------- Game state ---------- */

let mode = 'rasyonel';
let board, found, score, maxScore, timeLeft, elapsed, startedAt, ticker, playing, secret, hintWord, hints, penalty, solvedAt, lastLength, tenLanded;
let reviewRun = 0;
let player = '';
try { player = localStorage.getItem('kelime-avi-name') || ''; } catch (e) { /* private mode */ }
let path = [];

// Rasyonel: every word is worth the same, so there is no bonus word either
function isBonus(w) { return w === board.bonus && !MODES[mode].flat; }
// Seconds into the round: since the shared start when online, since you began when practising
function elapsedNow() {
  return (online ? (netNow() - round.start) : (performance.now() - startedAt)) / 1000 + penalty;
}

function wordPoints(w) { return MODES[mode].flat ? 1 : POINTS[w.length] + (isBonus(w) ? BONUS_POINTS : 0); }

// Screens in the order a player moves through them, so going forward slides in from the right
// and going back slides in from the left
const SCREENS = ['name', 'play', 'settings', 'history', 'home', 'lobby', 'game', 'results'];
let currentScreen = '';
function show(screen) {
  reviewRun++;      // leaving the results screen stops its slideshow
  $('sheet').hidden = true;
  const back = SCREENS.indexOf(screen) < SCREENS.indexOf(currentScreen);
  for (const id of SCREENS) {
    const el = $(id);
    el.hidden = id !== screen;
    el.classList.remove('enter', 'enterBack');
  }
  if (currentScreen && currentScreen !== screen) {
    void $(screen).offsetWidth;                       // restart the animation if the same screen re-enters
    $(screen).classList.add(back ? 'enterBack' : 'enter');
  }
  if (screen === 'play') renderLifetime();
  currentScreen = screen;
  window.scrollTo(0, 0);
}

function start(seed) {
  board = makeBoard(seed);
  found = [];
  score = 0;
  maxScore = board.words.reduce((sum, w) => sum + wordPoints(w), 0);
  timeLeft = MODES[mode].seconds;
  if (online) timeLeft = Math.min(MODES[mode].gain ? timeLeft : Infinity, (round.playEnd - netNow()) / 1000);
  elapsed = 0;
  path = [];
  playing = true;
  secret = board.words.find(w => w.length === LONGEST);
  hintWord = secret;       // the 10-letter word the hint button is currently spelling out
  tenLanded = false;       // the tick only appears top-left once it has flown there
  hints = 0;
  penalty = 0;
  solvedAt = null;
  lastLength = 0;

  $('modeName').textContent = MODES[mode].name;
  $('board').innerHTML = board.letters.map(l => `<div class="t">${upper(l)}</div>`).join('');
  $('board').classList.remove('deal');
  void $('board').offsetWidth;
  $('board').classList.add('deal');          // tiles drop in one after another
  setTimeout(() => $('board').classList.remove('deal'), 700);   // otherwise tiles would re-deal after every swipe
  renderHint();
  setPop('', '');
  renderStatus();
  show('game');

  startedAt = performance.now();
  let last = startedAt;
  cancelAnimationFrame(ticker);
  // Runs every frame so the ring around the clock drains smoothly
  const tick = now => {
    if (!playing) return;
    ticker = requestAnimationFrame(tick);
    if (online) {
      // Everyone's clock for a shared round comes from the same schedule, not from when they joined
      const left = (round.playEnd - netNow()) / 1000 - penalty;      // hints cost you time off the shared clock
      timeLeft = MODES[mode].gain ? Math.min(timeLeft - (now - last) / 1000, left) : left;
    } else {
      timeLeft -= (now - last) / 1000;
    }
    elapsed = elapsedNow();
    last = now;
    if (timeLeft <= 0) { timeLeft = 0; finish(); }
    renderTimer();
  };
  ticker = requestAnimationFrame(tick);
}

function finish() {
  if (!playing) return;
  playing = false;
  cancelAnimationFrame(ticker);
  path = [];

  remember();
  $('resTitle').textContent = MODES[mode].name + ' · SONUÇ';
  $('pbName').textContent = upper(player);
  $('pbScore').innerHTML = `<i>${score} <small>/ ${maxScore} puan</small></i><i>${dots(loadStats().points)} <small>toplam</small></i>`;
  $('again').hidden = online;
  // Status panel up top: play mode, countdown, score
  $('resKind').textContent = online ? 'CANLI' : 'SOLO';
  $('resKindIcon').innerHTML = online ? KIND_ICON.canli : KIND_ICON.solo;
  $('resScore').textContent = score;
  $('resScoreMax').textContent = maxScore;
  $('resMeter').style.width = (100 * score / maxScore) + '%';
  // Solo has no next round to count down to: the ring is hidden, except in Uzman where it holds your time
  const timeOnly = !online && mode === 'idealist' && solvedAt !== null;
  $('resDial').style.visibility = timeOnly ? 'visible' : 'hidden';      // in Canlı the countdown only appears with the scoreboard, not over the word lists
  $('resDial').classList.toggle('timeOnly', timeOnly);
  if (!online) { $('resCount').textContent = timeOnly ? formatTime(solvedAt) : ''; $('resDial').style.setProperty('--p', '360deg'); }
  $('resSolved').textContent = '';      // the time is already in your scoreboard row; repeating it under the countdown was redundant
  document.querySelector('.playerBar').hidden = false;
  $('toHome').textContent = online ? 'Çık' : 'Ana menü';
  $('review').hidden = false;
  $('scoreboard').hidden = true;
  show('results');
  startReview();
  if (online) { announce(); awaitNextRound(); }
}

/* ---------- Last 25 hidden words (kept on the device) ---------- */

const HISTORY_KEY = 'kelime-avi-history', HISTORY_MAX = 25;
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
}
// Called when a round ends: notes its 10-letter word and whether you found it
function remember() {
  const list = loadHistory();
  list.unshift({ w: secret, hit: found.some(w => w.length === LONGEST), level: mode });
  const stats = loadStats();
  stats.points += score; stats.rounds += 1; stats.tens += found.some(w => w.length === LONGEST) ? 1 : 0;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) { /* private mode */ }
}
// Lifetime totals, kept on the device: every point scored, rounds finished, 10-letter words found
const STATS_KEY = 'kelime-avi-stats';
function loadStats() {
  try { return Object.assign({ points: 0, rounds: 0, tens: 0 }, JSON.parse(localStorage.getItem(STATS_KEY))); } catch (e) { return { points: 0, rounds: 0, tens: 0 }; }
}
const dots = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');      // 12480 -> 12.480
function renderLifetime() {
  const s = loadStats();
  $('lifePoints').textContent = dots(s.points);
  $('lifeNote').textContent = s.rounds ? `${dots(s.rounds)} tur · ${dots(s.tens)} kez 10 harfli kelime` : 'İlk turunu oyna, puanların burada birikir';
}

function renderHistory() {
  const list = loadHistory();
  $('histList').innerHTML = list.length
    ? list.map(r => `<div class="row ${r.hit ? '' : 'missed'}" data-w="${r.w}">${upper(r.w)}<small>${(MODES[r.level] || {}).name || ''}</small></div>`).join('')
    : '<div class="histEmpty">Henüz bitirdiğin bir tur yok.</div>';
}
$('histList').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) describe(r.dataset.w); });
$('openHistory').addEventListener('click', () => { renderHistory(); show('history'); });
renderLifetime();
$('closeHistory').addEventListener('click', () => show('play'));

/* ---------- Post-game review ---------- */

// Like the original: your found words slide in and the first few light up on the small board one
// after another, then that list slides away and the words you missed do the same.
const REVIEW_SHOWN = 7, REVIEW_STEP = 1100;      // 7 words from each list; the scoreboard gets what's left of the break
function startReview() {
  const run = ++reviewRun;
  // The slideshow holds still while a word's description is open
  const wait = ms => new Promise((resolve, reject) => {
    const check = () => (run !== reviewRun ? reject() : $('sheet').hidden ? resolve() : setTimeout(check, 200));
    setTimeout(check, ms);
  });
  const byLength = (a, b) => b.length - a.length || a.localeCompare(b, 'tr');
  const mine = found.slice().sort(byLength);
  const missed = board.words.filter(w => !found.includes(w)).sort(byLength);
  const list = $('wordList'), tiles = $('miniBoard').children;
  $('miniBoard').innerHTML = board.letters.map(l => `<div class="t">${upper(l)}</div>`).join('');

  const light = (word, cls) => {
    const cells = word ? pathFor(word) : [];
    for (let n = 0; n < tiles.length; n++) tiles[n].className = 't' + (cells.includes(n) ? ' ' + cls : '');
    list.querySelectorAll('.row').forEach(r => r.classList.toggle('cur', r.dataset.w === word));
  };
  const phase = async (title, words, missedList) => {
    list.className = 'wordList';
    list.scrollTop = 0;
    list.innerHTML = `<div class="sec">${title} · ${words.length}</div>` + words.map((w, i) =>
      `<div class="row ${missedList ? 'missed' : ''}" data-w="${w}" style="--i:${Math.min(i + 1, 14)}">${upper(w)}${isBonus(w) ? '<i>★</i>' : ''}</div>`).join('');
    list.onclick = e => {
      const r = e.target.closest('.row');
      if (!r) return;
      light(r.dataset.w, missedList ? 'miss' : 'ok');
      describe(r.dataset.w);
    };
    await wait(700);
    for (const w of words.slice(0, REVIEW_SHOWN)) {
      light(w, missedList ? 'miss' : 'ok');
      await wait(REVIEW_STEP);
    }
    light('', '');
  };
  (async () => {
    if (mine.length) {
      await phase('BULDUKLARIN', mine, false);
      list.className = 'wordList leaving';
      await wait(600);
    }
    await phase('BULAMADIKLARIN', missed, true);
    if (online) showScoreboard();
  })().catch(() => { /* left the screen mid-slideshow */ });
}

/* ---------- Word descriptions (looked up live from TDK's online dictionary) ---------- */

const definitions = {};       // word -> { meta, meanings } or { note }
async function lookUp(word) {
  if (definitions[word]) return definitions[word];
  for (const [set, text] of [[COUNTRIES, 'Bir ülke adı.'], [CITIES, 'Bir şehir adı.'], [NAMES, 'Bir kişi adı.']]) {
    if (set.has(word)) return (definitions[word] = { meta: 'özel isim', meanings: [['', text]], own: true });
  }
  try {
    // Place and people names are capitalised in the dictionary, so try that spelling second
    const capital = word[0].toLocaleUpperCase('tr-TR') + word.slice(1);
    let data = null;
    for (const spelling of [word, capital]) {
      const res = await fetch('https://sozluk.gov.tr/gts?ara=' + encodeURIComponent(spelling));
      data = await res.json();
      if (Array.isArray(data) && data.length) break;
    }
    if (!Array.isArray(data) || !data.length) return (definitions[word] = { note: 'Bu kelime için tanım bulunamadı.' });
    const entry = data[0];
    const meanings = (entry.anlamlarListe || []).slice(0, 4).map(a => [((a.ozelliklerListe || [])[0] || {}).tam_adi || '', a.anlam]);
    return (definitions[word] = { meta: entry.lisan || '', meanings });
  } catch (e) {
    return { note: 'Tanım yüklenemedi. İnternet bağlantını kontrol et.' };      // not cached, so it can be retried
  }
}

async function describe(word) {
  $('defWord').textContent = upper(word);
  $('defMeta').textContent = '';
  $('defList').className = 'defList plain';
  $('defList').innerHTML = '<li>Yükleniyor…</li>';
  $('defSrc').textContent = '';
  $('sheet').hidden = false;
  const d = await lookUp(word);
  if ($('defWord').textContent !== upper(word)) return;       // another word was tapped meanwhile
  $('defList').innerHTML = '';
  if (d.note) {
    $('defList').appendChild(Object.assign(document.createElement('li'), { textContent: d.note }));
    return;
  }
  $('defMeta').textContent = d.meta;
  $('defList').className = 'defList';
  for (const [kind, text] of d.meanings) {
    const li = document.createElement('li');
    if (kind) li.appendChild(Object.assign(document.createElement('em'), { textContent: kind }));
    li.appendChild(document.createTextNode(text));
    $('defList').appendChild(li);
  }
  if (!d.own) $('defSrc').textContent = 'Kaynak: TDK Güncel Türkçe Sözlük';
}
$('sheetClose').addEventListener('click', () => { $('sheet').hidden = true; });
$('sheet').addEventListener('click', e => { if (e.target === $('sheet')) $('sheet').hidden = true; });

function submit(word, tiles) {
  if (!playing || word.length < 3) return setPop('', '');
  if (found.includes(word)) return flash(word, tiles, 'dup');
  if (!board.words.includes(word)) return flash(word, tiles, 'bad');

  found.push(word);
  score += wordPoints(word);
  lastLength = word.length;
  if (MODES[mode].gain) {
    timeLeft += word.length - 1;
    $('dial').classList.add('plus');
    setTimeout(() => $('dial').classList.remove('plus'), 400);
  }
  // In İdealist the long word stops your clock, but the round carries on
  if (word.length === LONGEST) {
    if (mode === 'idealist' && solvedAt === null) solvedAt = elapsedNow();
    // Some boards hide more than one 10-letter word: the hint then starts over on the next one
    hintWord = board.words.find(w => w.length === LONGEST && !found.includes(w)) || null;
    hints = 0;
    renderHint();
  }
  renderStatus();
  if (online) announce();

  // The long word and the hidden bonus word get the same green flash, held longer, plus a celebration
  if (word.length === LONGEST) {
    flash(word, tiles, 'ok', 2600, true);
    $('pop').classList.add('gold');
    FX.fireworks();
    starBurst();
    if (!tenLanded) checkFly();
  } else if (isBonus(word)) {
    flash(word, tiles, 'ok', 1200, true);
    starFly(BONUS_POINTS);
  } else {
    flash(word, tiles, 'ok');
  }
  if (found.length === board.words.length) setTimeout(finish, 900);
}

/* ---------- Hint ---------- */

// Each hint reveals the next letter of the hidden word and costs time
function useHint() {
  if (!playing || !hintWord || hints >= LONGEST - 1) return;
  hints++;
  penalty += HINT_PENALTY;
  timeLeft -= HINT_PENALTY;
  renderHint();
  const tile = $('board').children[pathFor(hintWord)[hints - 1]];
  tile.classList.add('hinted');
  setTimeout(() => tile.classList.remove('hinted'), 1200);
}

function pathFor(word) {
  let result = null;
  const walk = (i, k, used) => {
    if (result || board.letters[i] !== word[k]) return;
    used = used.concat(i);
    if (k === word.length - 1) { result = used; return; }
    for (const n of NEIGHBORS[i]) if (!used.includes(n)) walk(n, k + 1, used);
  };
  for (let i = 0; i < board.letters.length; i++) walk(i, 0, []);
  return result;
}

// The button stays quiet, with no letter slots, until the first hint is asked for
function renderHint() {
  const solved = solvedAt !== null;
  $('hintRow').hidden = !hintWord;      // every level has the hint; it goes once every 10-letter word is found
  $('hintRow').classList.toggle('used', hints > 0);
  $('hintSlots').hidden = hints === 0;
  $('hintSlots').innerHTML = [...(hintWord || '')].map((l, i) => `<i>${i < hints ? upper(l) : ''}</i>`).join('');
  $('hint').innerHTML = 'İpucu <small>+5 sn</small>';
  $('hint').disabled = hints >= LONGEST - 1;
  $('solved').textContent = solved ? formatTime(solvedAt) : '';     // your time sits under the clock, as in the original
}

const STAR_POINTS = (() => {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 ? 20 : 46, a = -Math.PI / 2 + k * Math.PI / 5;
    pts.push((50 + r * Math.cos(a)).toFixed(1) + ',' + (52 + r * Math.sin(a)).toFixed(1));
  }
  return pts.join(' ');
})();
const starSvg = `<svg viewBox="0 0 100 100"><polygon fill="#ffd84f" stroke="#e0a516" stroke-width="2.5" stroke-linejoin="round" points="${STAR_POINTS}"/></svg>`;

// A burst of gold stars from the word label, for the 10-letter word
function starBurst() {
  const from = $('pop').getBoundingClientRect();
  FX.stars(from.left + from.width / 2, from.top + from.height / 2);
}

// The gold tick pops over the grid like the bonus star, then flies up into its square at the top left
function checkFly() {
  const from = $('pop').getBoundingClientRect(), to = $('tenMark').getBoundingClientRect();
  const x = from.left + from.width / 2, y = from.top + 78;
  const dx = to.left + to.width / 2 - x, dy = to.top + to.height / 2 - y;
  const el = document.createElement('div');
  el.className = 'starFx checkFx';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = '<span>✓</span>';
  document.body.appendChild(el);
  FX.sparkle(x, y);
  const thisBoard = board;
  const land = () => {
    el.remove();
    if (board !== thisBoard) return;        // a new round began while it was in the air
    tenLanded = true;
    FX.sparkle(x + dx, y + dy);
    if (playing) renderStatus();
  };
  el.animate([
    { transform: 'scale(.2) rotate(-25deg)', opacity: 0 },
    { transform: 'scale(1.15) rotate(6deg)', opacity: 1, offset: 0.16 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.26 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(${(to.width / 76).toFixed(2)}) rotate(0deg)`, opacity: 1 },
  ], { duration: 1500, easing: 'ease-in-out' }).onfinish = land;
}

// A gold star carrying the bonus points pops over the grid, then flies up into the score
function starFly(points) {
  const from = $('pop').getBoundingClientRect(), to = $('score').getBoundingClientRect();
  const x = from.left + from.width / 2, y = from.top + 70;
  const dx = to.left + to.width / 2 - x, dy = to.top + to.height / 2 - y;
  const el = document.createElement('div');
  el.className = 'starFx';
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = starSvg + '<b>' + points + '</b>';
  document.body.appendChild(el);
  FX.sparkle(x, y);
  const fly = el.animate([
    { transform: 'scale(.2) rotate(-25deg)', opacity: 0 },
    { transform: 'scale(1.15) rotate(6deg)', opacity: 1, offset: 0.16 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.26 },
    { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(.25) rotate(40deg)`, opacity: 0.9 },
  ], { duration: 1400, easing: 'ease-in-out' });
  fly.onfinish = () => { el.remove(); FX.sparkle(x + dx, y + dy); };
}

/* ---------- Rendering ---------- */

function formatTime(s) { return s.toFixed(2).replace('.', '"'); }

function renderTimer() {
  $('time').textContent = Math.ceil(timeLeft);
  $('dial').style.setProperty('--p', 360 * Math.min(1, timeLeft / MODES[mode].seconds) + 'deg');
  $('dial').classList.toggle('low', timeLeft <= 10);
}

function renderStatus() {
  let html = '';
  for (let n = LONGEST; n >= 3; n--) {
    const left = board.words.filter(w => w.length === n && !found.includes(w)).length;
    html += `<div class="${n === lastLength ? 'last' : ''}">${n}<i>${left || ''}</i></div>`;
  }
  $('counts').innerHTML = html;
  $('tenMark').classList.toggle('on', tenLanded);
  $('tenMark').textContent = tenLanded ? '✓' : LONGEST;
  $('score').textContent = score;
  $('scoreMax').textContent = ' / ' + maxScore;
  $('meter').style.width = (100 * score / maxScore) + '%';
  renderTimer();
}

function setPop(word, state) {
  const el = $('pop');
  el.className = 'pop ' + state;
  el.textContent = word ? upper(word) : '';
  el.hidden = !word;
}

function paintTiles() {
  const tiles = $('board').children;
  for (let i = 0; i < tiles.length; i++) {
    const cls = 't' + (path.includes(i) ? ' on' : '');
    if (tiles[i].className !== cls) tiles[i].className = cls;
  }
}

// Briefly colours the swiped tiles and the floating label: green, gray or pale red
let flashTimer;
function flash(word, tiles, state, ms = 500, big = false) {
  clearTimeout(flashTimer);
  paintTiles();
  for (const i of tiles) $('board').children[i].className = 't ' + state;
  setPop(word, state + (big ? ' big' : ''));
  flashTimer = setTimeout(() => { paintTiles(); setPop('', ''); }, ms);
}

/* ---------- Swipe input ---------- */

// A tile only counts once the finger is near its centre, so diagonals don't clip the neighbours.
// Centres are measured once per swipe; reading layout on every finger move made selection lag.
let centres = [], reach = 0;
function measureTiles() {
  const tiles = $('board').children;
  centres = [];
  for (let i = 0; i < tiles.length; i++) {
    const r = tiles[i].getBoundingClientRect();
    centres.push([r.left + r.width / 2, r.top + r.height / 2]);
    reach = r.width * 0.48;
  }
}
function tileAt(x, y) {
  for (let i = 0; i < centres.length; i++) {
    if (Math.hypot(x - centres[i][0], y - centres[i][1]) < reach) return i;
  }
  return -1;
}

function extend(e) {
  const i = tileAt(e.clientX, e.clientY);
  if (i < 0) return;
  const last = path[path.length - 1];
  if (path.length > 1 && i === path[path.length - 2]) path.pop();
  else if (!path.length || (!path.includes(i) && NEIGHBORS[last].includes(i))) path.push(i);
  else return;
  clearTimeout(flashTimer);
  paintTiles();
  setPop(path.map(p => board.letters[p]).join(''), '');
}

const boardEl = $('board');
boardEl.addEventListener('pointerdown', e => {
  if (!playing) return;
  e.preventDefault();
  try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety; swiping works without it */ }
  measureTiles();
  path = [];
  extend(e);
});
boardEl.addEventListener('pointermove', e => {
  if (!playing || !path.length) return;
  // A fast swipe can cross a tile between two move events; the in-between points catch it
  const points = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const p of points.length ? points : [e]) extend(p);
});
const release = () => {
  if (!path.length) return;
  const tiles = path;
  path = [];
  paintTiles();
  submit(tiles.map(p => board.letters[p]).join(''), tiles);
};
boardEl.addEventListener('pointerup', release);
boardEl.addEventListener('pointercancel', release);

/* ---------- Home ---------- */

function renderHome() {
  $('homeTag').textContent = menuOnline ? 'CANLI' : 'SOLO';
  const tile = (id, m) => {
    const n = menuOnline ? activePeers(id).length : 0;
    return `<button class="mode" data-mode="${id}"><svg viewBox="0 0 80 80">${m.icon}</svg><b>${m.name}</b><span>${m.desc}</span>${n ? `<em>● ${n} oyuncu</em>` : ''}</button>`;
  };
  $('modes').innerHTML = Object.entries(MODES).map(([id, m]) => tile(id, m)).join('');
}

/* ---------- Online: one ongoing shared game per level ----------
   Rounds run back to back on a fixed schedule. The round number, and so the board, comes from the
   clock, so every phone lands on the same board without a host. A public message relay only carries
   names and scores between players. */

const NET = {
  topic: 'kelimeavi-r7x2q9/v1',
  brokers: ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'],
  lib: 'https://unpkg.com/mqtt@5.16.0/dist/mqtt.min.js',
};
const BREAK = 25;          // seconds of results between rounds
const JOIN_MIN = 15;       // with less than this left in a round, wait for the next one
const TIMED_SLOT = 120;    // Zamanlı rounds stretch, so online they get a fixed slot
const myId = Math.random().toString(36).slice(2, 10);
let online = false, menuOnline = false, round = null, client = null, clockOffset = 0, nextTimer;
const peers = {};          // peers[level][id] = { name, round, score, found, solvedAt, at }

const netNow = () => Date.now() + clockOffset;
const slotSeconds = level => (MODES[level].gain ? TIMED_SLOT : MODES[level].seconds);
function roundInfo(level) {
  const cycle = (slotSeconds(level) + BREAK) * 1000;
  const n = Math.floor(netNow() / cycle), start = n * cycle;
  const seed = Math.imul(n * 4 + Object.keys(MODES).indexOf(level), 2654435761) >>> 0;
  return { n, start, playEnd: start + slotSeconds(level) * 1000, next: start + cycle, seed };
}

// Phone clocks can be seconds apart; line them up against the web server's clock
async function syncClock() {
  try {
    const before = Date.now();
    const res = await fetch(location.href.split('#')[0], { method: 'HEAD', cache: 'no-store' });
    const server = Date.parse(res.headers.get('date'));
    if (!isNaN(server)) clockOffset = server + 500 - (before + Date.now()) / 2;
  } catch (e) { /* offline or blocked: fall back to the phone's own clock */ }
}

function connect() {
  if (client) return;
  const begin = () => {
    client = mqtt.connect(NET.brokers[0], { clientId: 'ka-' + myId, keepalive: 30, reconnectPeriod: 3000, connectTimeout: 8000 });
    let failures = 0;
    client.on('connect', () => client.subscribe(NET.topic + '/#'));
    client.on('error', () => { if (++failures === 2) { client.end(true); client = mqtt.connect(NET.brokers[1], { clientId: 'ka-' + myId }); client.on('connect', () => client.subscribe(NET.topic + '/#')); client.on('message', onMessage); } });
    client.on('message', onMessage);
  };
  if (window.mqtt) return begin();
  const s = document.createElement('script');
  s.src = NET.lib; s.onload = begin;
  document.head.appendChild(s);
}

let refreshQueued = false;
function onMessage(topic, payload) {
  let m;
  try { m = JSON.parse(payload.toString()); } catch (e) { return; }
  const level = topic.split('/').pop();
  if (!MODES[level] || !m || m.id === myId || typeof m.name !== 'string') return;
  (peers[level] = peers[level] || {})[m.id] = {
    name: m.name.slice(0, 12), round: +m.round, score: +m.score || 0, found: +m.found || 0,
    solvedAt: typeof m.solvedAt === 'number' ? m.solvedAt : null, at: Date.now(),
    long: typeof m.long === 'string' ? m.long.slice(0, LONGEST) : '',
  };
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(() => { refreshQueued = false; refreshOnline(); }, 300);
}

function announce() {
  if (!online || !client || !client.connected) return;
  client.publish(NET.topic + '/' + mode, JSON.stringify({ id: myId, name: player, round: round.n, score, found: found.length, solvedAt, long: longestFound() }));
}
setInterval(announce, 3000);

const activePeers = level => Object.values(peers[level] || {}).filter(p => Date.now() - p.at < 9000);

// This round's table: you plus everyone heard from in the same round
const KIND_ICON = {
  canli: '<svg viewBox="6 17 68 46"><circle fill="#fff" cx="29" cy="40" r="21"/><circle fill="#fff" opacity=".65" cx="51" cy="40" r="21"/></svg>',
  solo: '<svg viewBox="17 17 46 46"><circle fill="#fff" cx="40" cy="40" r="21"/></svg>',
};
const longestFound = () => found.reduce((best, w) => (w.length > best.length ? w : best), '');

// This round's table: you plus everyone heard from in the same round.
// Uzman ranks by who found the 10-letter word fastest; the other levels rank by the round's points.
function standings() {
  const rows = Object.values(peers[mode] || {}).filter(p => p.round === round.n)
    .concat({ name: player, score, found: found.length, solvedAt, long: longestFound(), me: true });
  rows.sort(mode === 'idealist'
    ? (a, b) => (a.solvedAt === null) - (b.solvedAt === null) || (a.solvedAt || 0) - (b.solvedAt || 0) || b.score - a.score
    : (a, b) => b.score - a.score);
  return rows;
}
const rankHtml = rows => rows.map((p, i) => `<div class="${p.me ? 'me' : ''}"><i>${i + 1}</i><span>${upper(p.name)}</span><b>${p.value}</b></div>`).join('');

// One scoreboard row, as in the original: rank, name over "% of the board's words · longest word found",
// and one value on the right. In Uzman that value is the time to the 10-letter word and no points are shown.
const rowValue = p => (mode === 'idealist' ? (p.solvedAt === null ? '—' : formatTime(p.solvedAt)) : p.score);
function scoreRows(rows) {
  const words = board ? board.words.length : 1;
  const head = `<div class="head"><i></i><span>OYUNCU</span><em>${mode === 'idealist' ? 'SÜRE' : 'PUAN'}</em></div>`;
  return head + rows.map((p, i) =>
    `<div class="${p.me ? 'me' : ''}"><i>${i + 1}</i><span>${upper(p.name)}<small>%${Math.round(100 * p.found / words)}${p.long ? ' · ' + upper(p.long) : ''}</small></span><em>${rowValue(p)}</em></div>`).join('');
}

// After the words have played, the round's ranking takes over the screen until the next round
function showScoreboard() {
  $('resTitle').textContent = MODES[mode].name + ' · TUR SONUÇLARI';
  $('review').hidden = true;
  $('scoreboard').hidden = false;
  $('resDial').style.visibility = 'visible';
  renderScoreboard();
}
function renderScoreboard() {
  const rows = standings();
  $('rank').innerHTML = scoreRows(rows);
  $('pbName').textContent = (rows.findIndex(p => p.me) + 1) + ' · ' + upper(player);
  $('pbScore').innerHTML = `<i>${rowValue(rows.find(p => p.me))}${mode === 'idealist' ? '' : ' <small>puan</small>'}</i>`;
  // The bar at the bottom repeats your own row, so it only shows when the list is too long to see every row at once
  document.querySelector('.playerBar').hidden = $('rank').scrollHeight <= $('rank').clientHeight + 1;
}

function refreshOnline() {
  if (!$('home').hidden && menuOnline) renderHome();
  if (!online) return;
  if (!$('results').hidden && !$('scoreboard').hidden) renderScoreboard();
  if (!$('lobby').hidden) {
    const here = activePeers(mode);
    $('lobbyPlayers').innerHTML = here.length ? rankHtml(here.map(p => ({ ...p, value: p.score }))) : '<em>Şu an başka oyuncu yok</em>';
  }
}

function enterOnline(level) {
  mode = level;
  online = true;
  const r = roundInfo(level);
  if (netNow() < r.playEnd - JOIN_MIN * 1000) return startOnlineRound(r);
  // Too little of this round left (or it's the results break): wait for the next board
  round = r;
  found = []; score = 0; solvedAt = null;
  $('lobbyTitle').textContent = MODES[level].name;
  show('lobby');
  refreshOnline();
  awaitNextRound();
}

function startOnlineRound(r) {
  clearInterval(nextTimer);
  round = r;
  start(r.seed);
  announce();
}

// Counts down to the next shared round, then deals it
function awaitNextRound() {
  clearInterval(nextTimer);
  const next = round.next;
  const update = () => {
    if (!online) return clearInterval(nextTimer);
    const left = Math.ceil((next - netNow()) / 1000);
    if (left <= 0) return startOnlineRound(roundInfo(mode));
    $('lobbyCount').textContent = $('resCount').textContent = left;
    $('resDial').style.setProperty('--p', 360 * Math.min(1, (next - netNow()) / (BREAK * 1000)) + 'deg');
  };
  update();
  nextTimer = setInterval(update, 250);
  refreshOnline();
}

function leaveOnline() {
  online = false;
  clearInterval(nextTimer);
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);
$('modes').addEventListener('click', e => {
  const button = e.target.closest('.mode');
  if (!button || !button.dataset.mode) return;
  if (menuOnline) return enterOnline(button.dataset.mode);
  mode = button.dataset.mode;
  start(newSeed());
});
$('again').addEventListener('click', () => start(newSeed()));
$('toHome').addEventListener('click', () => { leaveOnline(); renderHome(); show('home'); });
$('lobbyQuit').addEventListener('click', () => { leaveOnline(); renderHome(); show('home'); });
$('leave').addEventListener('click', () => { leaveOnline(); renderHome(); show('home'); });
$('offline').addEventListener('click', () => { menuOnline = false; renderHome(); show('home'); });
$('online').addEventListener('click', () => { menuOnline = true; syncClock(); connect(); renderHome(); show('home'); });
$('backToPlay').addEventListener('click', () => show('play'));

/* ---------- Settings: name and colour theme (both kept on the device) ---------- */

const THEMES = {
  nostaljik: { name: 'Nostaljik', desc: 'Ahşap, fildişi ve turuncu', css: '', bar: '#96551f', sw: ['#96551f', '#f6ebd0', '#ec8112'] },
  acik: { name: 'Açık', desc: 'Aydınlık ve sade', css: 'theme-modern.css?v=14', bar: '#f6f3ee', sw: ['#f6f3ee', '#ffffff', '#ff6b1a'] },
  koyu: { name: 'Koyu', desc: 'Koyu, düz ve serin', css: 'theme-cool.css?v=14', bar: '#0e1726', sw: ['#0e1726', '#17233a', '#4cc9f0'] },
};
let theme = 'nostaljik';
try { theme = localStorage.getItem('kelime-avi-theme') || theme; } catch (e) { /* private mode */ }
if (!THEMES[theme]) theme = 'nostaljik';

function applyTheme(id) {
  theme = id;
  if (THEMES[id].css) $('themeCss').setAttribute('href', THEMES[id].css); else $('themeCss').removeAttribute('href');
  $('themeColor').setAttribute('content', THEMES[id].bar);
  try { localStorage.setItem('kelime-avi-theme', id); } catch (e) { /* not remembered in private mode */ }
  renderThemes();
}
function renderThemes() {
  $('themes').innerHTML = Object.entries(THEMES).map(([id, t]) =>
    `<button type="button" class="themeOpt ${id === theme ? 'on' : ''}" data-theme="${id}"><span class="sw">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span><span><b>${t.name}</b><small>${t.desc}</small></span><span class="tick">✓</span></button>`).join('');
}
$('themes').addEventListener('click', e => { const b = e.target.closest('.themeOpt'); if (b) applyTheme(b.dataset.theme); });
$('openSettings').addEventListener('click', () => { $('nameEdit').value = player; renderThemes(); show('settings'); });
$('closeSettings').addEventListener('click', () => show('play'));
$('settingsForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('nameEdit').value.trim().slice(0, 12);
  if (name) {
    player = name;
    try { localStorage.setItem('kelime-avi-name', player); } catch (err) { /* private mode */ }
    $('hello').textContent = upper(player);
  }
  show('play');
});

$('nameForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('nameInput').value.trim().slice(0, 12);
  if (!name) return $('nameInput').focus();
  player = name;
  try { localStorage.setItem('kelime-avi-name', player); } catch (err) { /* private mode: asked again next time */ }
  $('hello').textContent = upper(player);
  show('play');
});
$('hint').addEventListener('click', useHint);
$('quit').addEventListener('click', () => { playing = false; cancelAnimationFrame(ticker); leaveOnline(); renderHome(); show('home'); });

// A name is asked for once; after that the game opens on the online / practice choice
$('hello').textContent = upper(player);
show(player ? 'play' : 'name');

// Portrait lock. Browsers can't lock rotation for a web page, so when a touch device goes
// landscape the whole game is rotated back the other way (see style.css).
function lockPortrait() {
  // The rotation itself is CSS; this only says which way the phone was turned
  let angle = screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : (window.orientation || 0);
  document.documentElement.classList.toggle('turnR', (angle + 360) % 360 === 270);
}
addEventListener('resize', lockPortrait);
addEventListener('orientationchange', lockPortrait);
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', lockPortrait);
lockPortrait();

// Keeps a copy of the game on the phone so Solo opens without a connection
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* no offline copy */ });
