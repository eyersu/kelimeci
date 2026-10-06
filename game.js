'use strict';

const SIZE = 4;
const LONGEST = 10;
const POINTS = { 3: 1, 4: 2, 5: 4, 6: 6, 7: 9, 8: 12, 9: 16, 10: 25 };
const BONUS_POINTS = 10;
const MIN_BOARD_WORDS = 25;
const HINT_PENALTY = 3;

// Signal-strength bars: one, two or three lit
const bars = n => [[14, 22], [34, 36], [54, 50]].map(([x, h], k) =>
  `<rect fill="#fff" x="${x}" y="${66 - h}" width="13" height="${h}" rx="3" opacity="${k < n ? 1 : 0.32}"/>`).join('');

// Level icons: white glyphs with a fainter "ghost" layer
const ICON = {
  dots: [0, 1, 2].map(r => [0, 1, 2].map(c => `<circle fill="#fff" cx="${22 + c * 18}" cy="${24 + r * 18}" r="6.5" opacity="${(r + c) % 2 ? 0.45 : 1}"/>`).join('')).join(''),
  rising: '<rect fill="#fff" opacity=".45" x="17" y="44" width="12" height="22" rx="6"/><rect fill="#fff" opacity=".7" x="34" y="30" width="12" height="36" rx="6"/><rect fill="#fff" x="51" y="14" width="12" height="52" rx="6"/>',
  // stopwatch with three quarters of its face filled and one quarter faded, a faded button and a "+"
  clock: '<path fill="#fff" d="M34 48H56A22 22 0 1 1 34 26z"/><path fill="#fff" opacity=".45" d="M34 48V26a22 22 0 0 1 22 22z"/><rect fill="#fff" opacity=".7" x="28" y="15" width="12" height="9" rx="2"/><path d="M65 14v14M58 21h14" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
  target: '<circle cx="40" cy="41" r="25" fill="none" stroke="#fff" stroke-width="6" opacity=".45"/><circle cx="40" cy="41" r="14" fill="none" stroke="#fff" stroke-width="6" opacity=".7"/><circle fill="#fff" cx="40" cy="41" r="5.5"/>',
};
// Shown as three difficulty levels plus a timed mode. The ids are the original game's mode names.
const MODES = {
  // Named by what counts in each one (her choice, 2026-10-06): every word equal, longer words worth more,
  // one target word, and against the clock.
  rasyonel: { name: 'EŞİT', desc: 'Her kelime 1 puan', seconds: 90, flat: true, icon: ICON.dots },
  klasik: { name: 'ARTAN', desc: 'Uzun kelime, çok puan', seconds: 90, icon: ICON.rising },
  idealist: { name: 'HEDEF', desc: '10 harfli kelimeyi bul', seconds: 120, icon: ICON.target },
  marjinal: { name: 'HIZLI', desc: 'Kelime buldukça süre kazan', seconds: 30, gain: true, icon: ICON.clock },
};

// Filler letters, weighted by how often each appears in Turkish text
const FILLER = 'aaaaaaaaaaaaeeeeeeeeeiiiiiiiiinnnnnnnnrrrrrrrllllllııııııkkkkkdddddmmmmyyyuuutttsssbbbooüüşşzzgçhğvcöpfjj';      // two j's: a J tile on about 1 board in 6 (it used to appear only inside the hidden word)

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
const VERB_SHARE = 0.1, isVerb = w => /m[ae]k$/.test(w);
const SEED_VERBS = SEED_WORDS.filter(isVerb), SEED_OTHERS = SEED_WORDS.filter(w => !isVerb(w));
// "Zor tahtalar" (a switch in settings): the hidden word comes from HARD_SEEDS instead, specialty and older
// 10-letter words (see tools/build_words.py). Every word still counts; nothing is refused. Off by default.
const HARD_MAX_WORDS = 55;      // and the board is a lean one: no more than this many words to find (a usual board has about 75)
const HARD_KEY = 'kelime-avi-hard';
let hardBoards = false;
try { hardBoards = localStorage.getItem(HARD_KEY) === '1'; } catch (e) { /* private mode */ }
document.documentElement.classList.toggle('hardOn', hardBoards);      // red clock, bars and countdowns everywhere
const HARD_BADGE = '<span class="hardBadge" aria-label="Zor tahta"><svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="13.5,2 5,13.5 11,13.5 9.5,22 19,10 12.5,10"/></svg></span>';
function makeBoard(seed, hard = hardBoards) {
  for (let attempt = 0; ; attempt++) {
    const rng = rngFrom(seed + attempt * 7919);
    // Verbs make up 3 in 10 of the 10-letter words and also pass the board test more easily, so hidden words
    // used to come up as verbs about half the time. Now roughly 1 board in 8 is built on a verb.
    const pool = hard ? HARD_SEEDS : rng() < VERB_SHARE ? SEED_VERBS : SEED_OTHERS;
    const secret = pool[Math.floor(rng() * pool.length)];
    const path = randomPath(rng, LONGEST);
    if (!path) continue;
    const letters = Array(SIZE * SIZE).fill('');
    path.forEach((cell, i) => { letters[cell] = secret[i]; });
    for (let i = 0; i < letters.length; i++) if (!letters[i]) letters[i] = FILLER[Math.floor(rng() * FILLER.length)];
    const words = solve(letters).sort((a, b) => b.length - a.length || a.localeCompare(b, 'tr'));
    if (words.length < MIN_BOARD_WORDS || (hard && words.length > HARD_MAX_WORDS)) continue;
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

// A level's name with its bar icon in front, for screen titles
// A title row: the level's icon, its name (plus an optional " · SONUÇ" kind of tail) and the red badge when Zor tahtalar is on
const levelTitle = (id, tail = '') => `<svg class="ic" viewBox="0 0 80 80" aria-hidden="true">${MODES[id].icon}</svg>${MODES[id].name}${tail}${hardBoards ? HARD_BADGE : ''}`;

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
  if (screen === 'play') { renderLifetime(); setTimeout(checkUpdate, 0); }
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
  hints = 0; revealed = [];
  penalty = 0;
  $('dial').classList.remove('hit'); landed = hintGold = null; clearTimeout(goldTimer);
  solvedAt = null;
  lastLength = 0;

  $('modeName').innerHTML = levelTitle(mode);
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
  if (online && MODES[mode].gain) timedDone();
  $('resTitle').innerHTML = levelTitle(mode, ' · SONUÇ');
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
  // Over the word lists the circle is there but not counting: empty, or holding your Uzman time.
  // The countdown itself only runs in it once the scoreboard is up.
  const timeOnly = mode === 'idealist' && solvedAt !== null;
  $('resDial').style.visibility = 'visible';
  $('resDial').classList.toggle('timeOnly', timeOnly);
  $('resCount').textContent = timeOnly ? formatTime(solvedAt) : '';
  $('resDial').style.setProperty('--p', '360deg');
  $('resSolved').textContent = '';      // the time is already in your scoreboard row; repeating it under the countdown was redundant
  document.querySelector('.playerBar').hidden = false;
  $('toHome').hidden = online;      // in Canlı the X in the header is the way out
  $('review').hidden = false;
  $('scoreboard').hidden = true;
  show('results');
  startReview();
  if (online) { announce(); awaitNextRound(); }
}

/* ---------- Last 25 hidden words (kept on the device) ---------- */

const HISTORY_KEY = 'kelime-avi-history', HISTORY_MAX = 25, LOBBY_WORDS = 10;
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
}
// Called when a round ends: notes its 10-letter word and whether you found it
function remember() {
  const list = loadHistory();
  list.unshift({ w: secret, hit: found.some(w => w.length === LONGEST), level: mode, t: Date.now(), n: online ? round.n : null });
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

// Canlı rounds run on the clock whether or not anyone is playing, so their hidden words can be worked
// out for any past round. That fills the list from the very first visit. The round being played right
// now is left out, so the list never gives its word away.
function pastRounds(count, only) {
  const rounds = [];
  for (const level of only ? [only] : Object.keys(MODES).filter(l => !MODES[l].gain)) {      // Zamanlı has no clock rounds
    const slot = slotSeconds(level) * 1000, cycle = slot + BREAK * 1000;
    let n = Math.floor(netNow() / cycle);
    if (netNow() < n * cycle + slot) n -= 1;
    for (let k = 0; k < count; k++, n--) rounds.push({ level, n, t: n * cycle + slot });
  }
  return rounds.sort((a, b) => b.t - a.t).slice(0, count);
}
// The newest hidden words, her own rounds first-class among them; `only` narrows it to one level's Canlı rounds.
function recentWords(count, only) {
  const mine = loadHistory().map((r, i) => ({ ...r, mine: true, t: r.t || Date.now() - (i + 1) * 3600e3 }));
  const played = r => mine.find(m => m.level === r.level && m.n === r.n);
  const list = only ? pastRounds(count, only).map(r => played(r) || r)
    : mine.concat(pastRounds(count).filter(r => !played(r))).sort((a, b) => b.t - a.t).slice(0, count);
  for (const r of list) if (!r.w) r.w = makeBoard(roundSeed(r.level, r.n)).words.find(w => w.length === LONGEST);
  return list;
}
const wordRows = (list, tag) => list.map(r =>
  `<div class="row ${r.mine ? (r.hit ? '' : 'missed') : 'unplayed'}" data-w="${r.w}">${upper(r.w)}${tag ? `<small>${(MODES[r.level] || {}).name || ''}</small>` : ''}</div>`).join('');
function renderHistory() { $('histList').innerHTML = wordRows(recentWords(HISTORY_MAX), true); }
// Up to ten of the level's last words on the waiting screen (the CSS hides whole rows that don't fit the phone).
function renderLobbyWords(level) { $('lobbyWords').innerHTML = wordRows(recentWords(LOBBY_WORDS, level)); }
$('lobbyWords').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) describe(r.dataset.w); });
$('histList').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) describe(r.dataset.w); });
$('openHistory').addEventListener('click', () => { renderHistory(); show('history'); });
renderLifetime();
$('closeHistory').addEventListener('click', () => show('play'));

/* ---------- Post-game review ---------- */

// Only the words you didn't find are listed (her call, 2026-10-05): they slide in and the first few light up
// on the small board one after another. A perfect round has nothing missed, so it lists what you found.
const REVIEW_SHOWN = 7, REVIEW_STEP = 1100;      // 7 words light up; the scoreboard gets what's left of the break
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
      light(r.dataset.w, 'ok');
      describe(r.dataset.w);
    };
    await wait(700);
    // Always the first 7 words, no more. In Canlı they slow down a little (up to 2 s each) when hints ended
    // your round early, so the player list still only stays a few seconds.
    const shown = words.slice(0, REVIEW_SHOWN);
    const step = online ? Math.max(REVIEW_STEP, Math.min(2000, (round.next - netNow() - 5500) / shown.length)) : REVIEW_STEP;
    for (const w of shown) {
      light(w, 'ok');
      await wait(step);
    }
    light('', '');
  };
  (async () => {
    if (missed.length) await phase('BULAMADIKLARIN', missed, true);
    else await phase('BULDUKLARIN', mine, false);
    if (online) showScoreboard();
  })().catch(() => { /* left the screen mid-slideshow */ });
}

/* ---------- Word descriptions (looked up live from TDK's online dictionary) ---------- */

const definitions = {};       // word -> { meta, meanings } or { note }
async function lookUp(word) {
  if (definitions[word]) return definitions[word];
  for (const [set, text] of [[COUNTRIES, 'Bir ülke adı.'], [CITIES, 'Bir yer adı (şehir, ada ya da bölge).'], [NAMES, 'Bir kişi adı.']]) {
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
    hints = 0; revealed = [];
    for (const t of $('board').children) delete t.dataset.hint;
    // The found word fills the ten boxes in gold for a moment before the row clears (or starts on the next word)
    hintGold = word;
    clearTimeout(goldTimer);
    goldTimer = setTimeout(() => { hintGold = null; if (playing) renderHint(); }, 2600);      // as long as the green tiles
    renderHint();
  }
  renderStatus();
  if (online) announce();

  // The long word and the hidden bonus word get the same green flash, held longer, plus a celebration
  if (word.length === LONGEST) {
    flash(word, tiles, 'ok', 2600, true);
    // With the hint row on, the word is spelled out there in gold, so no label over the grid as well.
    // With the hint switched off there is no row, and the gold label is back where every other word's is.
    if (showHint) setPop('', ''); else $('pop').classList.add('gold');
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
let revealed = [], hitTimer = 0, landed = null, hintGold = null, goldTimer = 0;
const HINT_ORDER_KEY = 'kelime-avi-hint-order';
const HINT_SHOW_KEY = 'kelime-avi-hint-show';
let hintOrder = 'sira', showHint = true;      // the hint can be switched off altogether in settings
try { hintOrder = localStorage.getItem(HINT_ORDER_KEY) || hintOrder; showHint = localStorage.getItem(HINT_SHOW_KEY) !== '0'; } catch (e) { /* private mode */ }
const HINT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>';
function useHint() {
  if (!playing || !showHint || !hintWord || hintGold || revealed.length >= LONGEST) return;      // no limit: every letter can be bought
  hints++;
  // The first hint is always the word's first letter. After that: the next letter in order, or (her setting)
  // any letter not shown yet.
  const hidden = [...hintWord].map((_, i) => i).filter(i => !revealed.includes(i));
  const at = !revealed.length || hintOrder !== 'karisik' ? hidden[0] : hidden[Math.floor(Math.random() * hidden.length)];
  revealed.push(at);
  // A hint takes 3 seconds off your clock, and the clock says so: it flashes red with "−3 sn"
  penalty += HINT_PENALTY;
  timeLeft -= HINT_PENALTY;
  const dial = $('dial');
  dial.classList.remove('hit'); void dial.offsetWidth; dial.classList.add('hit');
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => dial.classList.remove('hit'), 1100);
  // The tile flashes gold, then keeps a gold outline until the word is found; the letter appears in its box
  const tile = $('board').children[pathFor(hintWord)[at]];
  tile.dataset.hint = '1';
  tile.classList.add('hinted');
  setTimeout(() => tile.classList.remove('hinted'), 1200);
  landed = at;
  renderHint();
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
  const word = showHint ? hintGold || hintWord : null;
  $('hintRow').hidden = $('hintNote').hidden = !word;      // every level has the hint; it goes once every 10-letter word is found
  $('hintRow').classList.toggle('used', hints > 0);
  // The ten boxes are there from the start, so each letter's position in the word is always readable.
  // A revealed letter is a small tile.
  $('hintSlots').innerHTML = [...(word || '')].map((l, i) => {
    const got = hintGold || revealed.includes(i);
    return `<i class="${hintGold ? 'gold' : got ? 'got' : ''}${i === landed ? ' land' : ''}">${got ? upper(l) : ''}</i>`;
  }).join('');
  landed = null;
  $('hint').innerHTML = HINT_ICON;
  $('hint').setAttribute('aria-label', 'İpucu: sürenizi 3 saniye kısaltır');
  $('hint').disabled = !!hintGold || revealed.length >= LONGEST;
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
// Where the word label would sit: top centre of the grid (the 10-letter word no longer shows that label)
function labelSpot() {
  if (!showHint) return $('pop').getBoundingClientRect();
  const b = $('board').getBoundingClientRect();
  return { left: b.left, width: b.width, top: b.top - 26, height: 44 };
}
function starBurst() {
  const from = labelSpot();
  FX.stars(from.left + from.width / 2, from.top + from.height / 2);
}

// The gold tick pops over the grid like the bonus star, then flies up into its square at the top left
function checkFly() {
  const from = labelSpot(), to = $('tenMark').getBoundingClientRect();
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
  // Red for the last 10 seconds (back at her request); copper for the whole round when "Oyunu zorlaştır" is on
  $('dial').classList.toggle('low', timeLeft <= 10);
  $('dial').classList.toggle('hard', hardBoards);
  document.documentElement.classList.toggle('hardOn', hardBoards);      // also turns the score bar red
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
    return `<button class="mode" data-mode="${id}"><svg viewBox="0 0 80 80">${m.icon}</svg><b>${m.name}</b><span>${m.desc}</span>${n ? `<em>● ${n} oyuncu</em>` : ''}${hardBoards ? HARD_BADGE : ''}</button>`;
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
const BREAK = 14;          // seconds between rounds: ~8.5 s of missed words lighting up, then ~5 s of scoreboard
const JOIN_MIN = 15;       // with less than this left in a round, wait for the next one
const myId = Math.random().toString(36).slice(2, 10);
let online = false, menuOnline = false, round = null, client = null, clockOffset = 0, nextTimer;
const peers = {};          // peers[level][id] = { name, round, score, found, solvedAt, at }

const netNow = () => Date.now() + clockOffset;
const slotSeconds = level => MODES[level].seconds;
// With "Zor tahtalar" on, the boards are different ones, so those players form their own Canlı pool
const roundSeed = (level, n) => (Math.imul(n * 4 + Object.keys(MODES).indexOf(level), 2654435761) ^ (hardBoards ? 0x5bd1e995 : 0)) >>> 0;
function roundInfo(level) {
  if (MODES[level].gain) return timedRound(level);
  const cycle = (slotSeconds(level) + BREAK) * 1000;
  const n = Math.floor(netNow() / cycle), start = n * cycle;
  const seed = roundSeed(level, n);
  return { n, start, playEnd: start + slotSeconds(level) * 1000, next: start + cycle, seed };
}

// Zamanlı is the one level that can't run on the shared clock: your time there is your own (30 s, longer with
// every word), so a clock round left you waiting for everyone else. Instead everyone plays the same sequence
// of boards at their own pace: board 0, 1, 2... of the current hour. The next board follows your scoreboard,
// and the scoreboard compares you with whoever has played, or is playing, that same board.
const TIMED_KEY = 'kelime-avi-timed';
let timed = { hour: 0, i: 0 }, myPast = [];
try { timed = JSON.parse(localStorage.getItem(TIMED_KEY)) || timed; } catch (e) { /* private mode */ }
function timedRound(level) {
  const hour = Math.floor(netNow() / 3600e3);
  if (timed.hour !== hour) timed = { hour, i: 0 };
  const n = hour * 1000 + timed.i;
  return { n, start: netNow(), playEnd: Infinity, next: Infinity, seed: roundSeed(level, n) };
}
function timedDone() {
  round.next = netNow() + BREAK * 1000;
  myPast.push({ n: round.n, score, found: found.length, long: longestFound() });
  myPast = myPast.slice(-12);
  timed.i += 1;
  try { localStorage.setItem(TIMED_KEY, JSON.stringify(timed)); } catch (e) { /* private mode */ }
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
  if (!!m.hard !== hardBoards) { if (peers[level]) delete peers[level][m.id]; return; }      // the other pool: not on our boards
  (peers[level] = peers[level] || {})[m.id] = {
    name: m.name.slice(0, 12), round: +m.round, score: +m.score || 0, found: +m.found || 0,
    solvedAt: typeof m.solvedAt === 'number' ? m.solvedAt : null, at: Date.now(),
    long: typeof m.long === 'string' ? m.long.slice(0, LONGEST) : '',
    past: Array.isArray(m.past) ? m.past.slice(-12).map(r => ({ n: +r.n, score: +r.score || 0, found: +r.found || 0, long: typeof r.long === 'string' ? r.long.slice(0, LONGEST) : '' })) : [],
  };
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(() => { refreshQueued = false; refreshOnline(); }, 300);
}

function announce() {
  if (!online || !client || !client.connected) return;
  client.publish(NET.topic + '/' + mode, JSON.stringify({ id: myId, name: player, round: round.n, score, found: found.length, solvedAt, long: longestFound(), hard: hardBoards, past: MODES[mode].gain ? myPast : undefined }));
}
setInterval(announce, 3000);

const activePeers = level => Object.values(peers[level] || {}).filter(p => Date.now() - p.at < 9000);

// This round's table: you plus everyone heard from in the same round
const KIND_ICON = {
  canli: '<svg viewBox="3 12 74 56"><circle fill="#fff" cx="27" cy="26" r="12"/><path fill="#fff" d="M5 66c0-15 9-23 22-23s22 8 22 23z"/><circle fill="#fff" cx="56" cy="30" r="10" opacity=".7"/><path fill="#fff" opacity=".7" d="M54 46c12 0 21 7 21 20H55c0-8-2-14-6-19 2-.6 3-1 5-1z"/></svg>',
  solo: '<svg viewBox="13 11 54 59"><circle fill="#fff" cx="40" cy="26" r="13"/><path fill="#fff" d="M15 68c0-16 10-25 25-25s25 9 25 25z"/></svg>',
};
const longestFound = () => found.reduce((best, w) => (w.length > best.length ? w : best), '');

// This round's table: you plus everyone heard from in the same round.
// Uzman ranks by who found the 10-letter word fastest; the other levels rank by the round's points.
function standings() {
  // Zamanlı: someone who played this board earlier counts too, from the results they carry with them
  const rows = Object.values(peers[mode] || {})
    .map(p => (p.round === round.n ? p : (p.past || []).filter(r => r.n === round.n).map(r => ({ ...r, name: p.name, solvedAt: null }))[0]))
    .filter(Boolean)
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
  $('resTitle').innerHTML = levelTitle(mode, ' · TUR SONUÇLARI');
  $('review').hidden = true;
  $('scoreboard').hidden = false;
  $('resDial').classList.remove('timeOnly');
  $('resCount').textContent = '';
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
}

function enterOnline(level) {
  mode = level;
  online = true;
  const r = roundInfo(level);
  if (netNow() < r.playEnd - JOIN_MIN * 1000) return startOnlineRound(r);
  // Too little of this round left (or it's the results break): wait for the next board
  round = r;
  found = []; score = 0; solvedAt = null;
  $('lobbyTitle').innerHTML = levelTitle(level);
  show('lobby');
  renderLobbyWords(level);
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
    $('lobbyCount').textContent = left;
    if (!$('scoreboard').hidden) {
      $('resCount').textContent = left;
      $('resDial').style.setProperty('--p', 360 * Math.min(1, (next - netNow()) / (BREAK * 1000)) + 'deg');
    }
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
$('resQuit').addEventListener('click', () => { leaveOnline(); renderHome(); show('home'); });
$('offline').addEventListener('click', () => { menuOnline = false; renderHome(); show('home'); });
$('online').addEventListener('click', () => { menuOnline = true; syncClock(); connect(); renderHome(); show('home'); });
$('backToPlay').addEventListener('click', () => show('play'));

/* ---------- Settings: name and colour theme (both kept on the device) ---------- */

const THEMES = {
  nostaljik: { name: 'Nostaljik', desc: 'Ahşap, fildişi ve turuncu', css: '', bar: '#96551f', sw: ['#96551f', '#f6ebd0', '#ec8112'] },
  koyu: { name: 'Koyu', desc: 'Koyu, düz ve serin', css: 'theme-cool.css?v=29', bar: '#0e1726', sw: ['#0e1726', '#17233a', '#4cc9f0'] },
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
function renderHintOrder() {
  $('hardToggle').classList.toggle('on', hardBoards);
  $('hardToggle').setAttribute('aria-checked', hardBoards);
  $('hintShow').classList.toggle('on', showHint);
  $('hintShow').setAttribute('aria-checked', showHint);
  $('hintOrder').classList.toggle('on', hintOrder === 'karisik');
  $('hintOrder').setAttribute('aria-checked', hintOrder === 'karisik');
  $('hintOrder').disabled = !showHint;      // nothing to shuffle when the hint is switched off
}
$('hardToggle').addEventListener('click', () => {
  hardBoards = !hardBoards;
  document.documentElement.classList.toggle('hardOn', hardBoards);
  try { localStorage.setItem(HARD_KEY, hardBoards ? '1' : '0'); } catch (err) { /* not remembered in private mode */ }
  for (const level of Object.keys(peers)) peers[level] = {};      // players seen so far were in the other pool
  myPast = [];
  renderHintOrder();
});
$('hintShow').addEventListener('click', () => {
  showHint = !showHint;
  try { localStorage.setItem(HINT_SHOW_KEY, showHint ? '1' : '0'); } catch (err) { /* not remembered in private mode */ }
  renderHintOrder();
});
$('hintOrder').addEventListener('click', () => {
  hintOrder = hintOrder === 'karisik' ? 'sira' : 'karisik';
  try { localStorage.setItem(HINT_ORDER_KEY, hintOrder); } catch (err) { /* not remembered in private mode */ }
  renderHintOrder();
});
function renderThemes() {
  // One row: "Tema" and a round swatch per theme, with a ring on the chosen one
  $('themes').innerHTML = '<b>Tema</b><span>' + Object.entries(THEMES).map(([id, t]) =>
    `<button type="button" class="${id === theme ? 'on' : ''}" data-theme="${id}" aria-label="${t.name}" aria-pressed="${id === theme}">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</button>`).join('') + '</span>';
}
$('themes').addEventListener('click', e => { const b = e.target.closest('button[data-theme]'); if (b) applyTheme(b.dataset.theme); });
$('openSettings').addEventListener('click', () => { $('nameEdit').value = player; renderThemes(); renderHintOrder(); show('settings'); });
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
  // iPhones can keep the small results board at its sideways size after the phone is upright again;
  // laying the review out afresh once the turn has settled puts it back.
  clearTimeout(relayTimer);
  relayTimer = setTimeout(() => { const r = $('review'); if (r.hidden) return; r.style.display = 'none'; void r.offsetHeight; r.style.display = ''; }, 350);
}
let relayTimer = 0;
addEventListener('resize', lockPortrait);
addEventListener('orientationchange', lockPortrait);
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', lockPortrait);
lockPortrait();

// Tablets: fill the screen by enlarging the phone layout (see the end of style.css). The game is laid out
// about 430 wide and at least 812 tall (a tall phone, so every screen has the room it has on a phone), then
// scaled by --s to the tablet's upright size. The game's own width and height are set in pixels from the
// same measurement as the scale, so the scaled game is exactly the visible screen and nothing hangs off it.
const TABLET_MIN = 600, DESIGN_W = 430, DESIGN_H = 812;
function fitTablet() {
  const w = Math.min(innerWidth, innerHeight), h = Math.max(innerWidth, innerHeight);
  const touch = matchMedia('(pointer: coarse)').matches || /[?&]tablet=1/.test(location.search);
  const root = document.documentElement;
  if (!touch || w < TABLET_MIN) { root.classList.remove('tablet'); return; }
  const s = Math.max(1, Math.min(w / DESIGN_W, h / DESIGN_H));
  root.classList.add('tablet');
  root.style.setProperty('--s', s.toFixed(4));
  root.style.setProperty('--app-w', (w / s).toFixed(2) + 'px');
  root.style.setProperty('--app-h', (h / s).toFixed(2) + 'px');
}
addEventListener('resize', fitTablet);
addEventListener('orientationchange', fitTablet);
if (window.visualViewport) visualViewport.addEventListener('resize', fitTablet);
fitTablet();
setTimeout(fitTablet, 400);      // some tablets report their final size a moment after opening

// Keep the screen awake while the game is open and in front (phones dim after a few idle seconds, and a
// round has plenty of those). The lock is dropped by the phone whenever the app goes to the background, so
// it is asked for again each time it comes back, and on the first touch (some phones want a touch first).
let wakeLock = null;
async function stayAwake() {
  if (!('wakeLock' in navigator) || document.hidden || (wakeLock && !wakeLock.released)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* refused (low battery mode, old phone): nothing to do */ }
}
document.addEventListener('visibilitychange', stayAwake);
addEventListener('pointerdown', stayAwake);
stayAwake();

// Keeps a copy of the game on the phone so Solo opens without a connection
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* no offline copy */ });

// A home-screen app stays open in the background for days, so it would keep running an old version.
// Whenever it comes back to the front, or returns to a menu, it checks the published version number
// and reloads itself if there is a newer one. Never during a round or its results.
const BUILD = (document.querySelector('script[src*="game.js"]').getAttribute('src').match(/v=(\d+)/) || [])[1];
let updateCheckedAt = 0;
async function checkUpdate() {
  if (!BUILD || ['game', 'results', 'lobby'].includes(currentScreen) || Date.now() - updateCheckedAt < 20000) return;
  updateCheckedAt = Date.now();
  try {
    const page = await (await fetch('index.html?fresh=' + Date.now(), { cache: 'no-store' })).text();
    const latest = (page.match(/game\.js\?v=(\d+)/) || [])[1];
    if (latest && +latest > +BUILD && !['game', 'results', 'lobby'].includes(currentScreen)) location.reload();
  } catch (e) { /* offline: keep playing the copy we have */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
checkUpdate();
