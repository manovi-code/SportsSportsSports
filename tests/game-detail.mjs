/**
 * Game-detail checks for Mann's Sports Dashboard.
 * Real ESPN public scoreboards where noted. Cases tagged FIXTURE stub the
 * summary request in the page (slow, failed, or reordered) and say so.
 *
 * Run: NODE_PATH=/tmp/pw/node_modules node tests/game-detail.mjs
 * Serves ../index.html itself if GAME_URL is unset.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import pw from '/tmp/pw/node_modules/playwright/index.js';
const { chromium, webkit } = pw;
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'index.html'));
const CHROME_WIDTHS = [360, 390, 412, 744, 768, 820, 1024, 1280];
const WEBKIT_WIDTHS = [390, 744, 768, 1024];
const SHOTS = { phone: [390, 844], ipad: [768, 1024], desktop: [1280, 800] };

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(HTML);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

async function sb(path) {
  const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/' + path + '/scoreboard?limit=80');
  if (!r.ok) throw new Error('scoreboard ' + path + ' ' + r.status);
  const d = await r.json();
  return (d.events || []).map(e => {
    const c = (e.competitions || [])[0] || {};
    const ty = ((c.status || {}).type) || {};
    const names = (c.competitors || []).map(x => (x.team || {}).abbreviation || '?').join('-');
    return { id: String(e.id), state: ty.state || '', detail: ty.shortDetail || '', names };
  });
}
function pick(list, state) { return list.find(g => g.state === state) || null; }

const boards = {};
for (const [k, path] of [['nfl', 'football/nfl'], ['nba', 'basketball/nba'], ['nhl', 'hockey/nhl'], ['mlb', 'baseball/mlb'], ['epl', 'soccer/eng.1'], ['cfb', 'football/college-football']]) {
  try { boards[k] = await sb(path); } catch (e) { boards[k] = []; console.error('board', k, e.message); }
}
const live = ['cfb', 'nba', 'nhl', 'nfl', 'mlb', 'epl'].map(k => ({ k, g: pick(boards[k], 'in') })).find(x => x.g);
const G = {
  nflFinal: pick(boards.nfl, 'post') || { id: '401873037', names: 'BAL-JAX', state: 'post' },
  nflPre: pick(boards.nfl, 'pre') || { id: '401873038', names: 'ATL-CIN', state: 'pre' },
  epl: pick(boards.epl, 'post') || pick(boards.epl, 'pre') || { id: '401878758', names: 'LEE-TOT', state: 'post' },
  mlb: pick(boards.mlb, 'post') || pick(boards.mlb, 'pre') || { id: '401908046', names: 'TB-MIL', state: 'post' },
  live
};

function key(lg, g) { return lg + ':' + g.id; }

async function boot(page) {
  const errors = [];
  page.on('pageerror', err => errors.push('pageerror: ' + (err && err.message ? err.message : err)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text().slice(0, 240)); });
  await page.addInitScript(() => {
    localStorage.setItem('mannProfile.v1', JSON.stringify({ t: 1, existing: true }));
    localStorage.setItem('mannSportsSelected.v1', JSON.stringify(['nfl', 'nba', 'nhl', 'mlb', 'epl', 'cfb']));
    localStorage.setItem('mannSportsTab.v2', 'nfl');
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof ltOpen === 'function' && typeof gvRender === 'function' && typeof ltRender === 'function', { timeout: 20000 });
  return errors;
}

async function snap(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const box = document.querySelector('#ltView .ps-box');
    const nested = [];
    const wide = [];
    if (box) {
      for (const el of box.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        const sy = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4;
        const sx = (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4;
        if (sy || sx) nested.push(String(el.className || el.tagName).slice(0, 60));
        if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 4 && (s.overflowX === 'visible' || s.overflowX === 'auto' || s.overflowX === 'scroll'))
          wide.push(String(el.className || el.tagName).slice(0, 60) + ' ' + el.scrollWidth + '>' + el.clientWidth);
      }
    }
    const gv = document.querySelector('#ltView [data-gv]');
    const tab = document.querySelector('.tab.active');
    const tabs = document.querySelector('.tabs');
    return {
      pageOverflow: root.scrollWidth - root.clientWidth,
      nested, wide: wide.slice(0, 8),
      gv: gv && gv.getAttribute('data-gv'),
      key: gv && gv.getAttribute('data-gv-key'),
      state: gv && gv.getAttribute('data-gv-state'),
      wp: (document.querySelector('#ltView [data-gv-wp]') || {}).getAttribute && document.querySelector('#ltView [data-gv-wp]').getAttribute('data-gv-wp'),
      sweat: (document.querySelector('#ltView [data-gv-sweat]') || {}).getAttribute && document.querySelector('#ltView [data-gv-sweat]').getAttribute('data-gv-sweat'),
      len: box ? box.innerText.trim().length : 0,
      text: box ? box.innerText.replace(/\s+/g, ' ').trim().slice(0, 280) : '',
      names: [...document.querySelectorAll('#ltView .gv-nm')].map(n => n.textContent.trim()),
      yttv: !!document.querySelector('#ltView .yttv-pill'),
      reddit: !!document.querySelector('#ltView .rd-chip'),
      drives: !!document.querySelector('#ltView .gv-dr'),
      boxNote: !!document.querySelector('#ltView [data-gv-box]'),
      hidden: !document.getElementById('ltView') || document.getElementById('ltView').hidden,
      tab: tab ? tab.dataset.tab : '',
      tabWrap: tabs ? tabs.scrollWidth - tabs.clientWidth : null,
      y: window.scrollY
    };
  });
}

async function openKey(page, k) {
  await page.evaluate(id => ltOpen(id), k);
  await page.waitForSelector('#ltView [data-gv="ready"], #ltView [data-gv="error"]', { timeout: 25000 });
  return snap(page);
}
async function closeSheet(page) {
  const open = await page.evaluate(() => { const o = document.getElementById('ltView'); return !!(o && !o.hidden); });
  if (!open) return;
  await page.click('#ltView [data-ltx]');
  await page.waitForFunction(() => { const o = document.getElementById('ltView'); return !o || o.hidden; }, { timeout: 5000 });
}

async function runChrome() {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  // Headless Chrome's default UA is rejected by ESPN (403 with no CORS header). A normal desktop UA matches what a real browser sends.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  const errors = await boot(page);
  const out = { browser: 'chrome', errors: [], checks: [], shots: [] };
  const fail = (name, detail) => out.checks.push({ name, ok: false, detail });
  const ok = (name, detail) => out.checks.push({ name, ok: true, detail });

  const clash = await page.evaluate(() => ({ trades: ltRender.toString().includes('fzLgTr'), view: gvRender.toString().includes('data-gv'), load: gvLoad.toString().includes('summary?event=') }));
  if (clash.trades && clash.view && clash.load) ok('name clash still isolated', 'ltRender is league trades; gvRender paints the sheet');
  else fail('name clash still isolated', JSON.stringify(clash));

  // blank-game regression on a real final
  const fin = await openKey(page, key('nfl', G.nflFinal));
  if (fin.gv === 'ready' && fin.len > 80 && fin.names.length === 2) ok('blank regression final', fin.names.join(' vs ') + ' · ' + fin.len + ' chars');
  else fail('blank regression final', JSON.stringify(fin));
  if (fin.wp === 'espn' || fin.wp === 'predictor' || fin.wp === 'none') ok('final win source labeled', fin.wp);
  else fail('final win source labeled', String(fin.wp));
  if (fin.state === 'post' && !fin.yttv) ok('youtube tv hidden on final', 'no pill');
  else fail('youtube tv hidden on final', 'yttv=' + fin.yttv + ' state=' + fin.state);
  if (fin.reddit) ok('reddit link visible on final', 'chip');
  else fail('reddit link visible on final', fin.text);
  if (fin.drives || /Scoring drives|Touchdown|Field Goal|FG|TD/i.test(fin.text)) ok('football scoring drives', fin.drives ? 'drive list' : 'text');
  else fail('football scoring drives', fin.text);

  for (const w of CHROME_WIDTHS) {
    await page.setViewportSize({ width: w, height: w >= 1000 ? 800 : 900 });
    await page.waitForTimeout(120);
    const s = await snap(page);
    const bad = s.pageOverflow > 1 || s.nested.length || s.wide.length || s.gv !== 'ready';
    if (bad) fail('chrome ' + w, JSON.stringify({ overflow: s.pageOverflow, nested: s.nested, wide: s.wide, gv: s.gv, names: s.names }));
    else ok('chrome ' + w, 'no overflow, no nested scroller');
    if (w === 768 || w === 820 || w === 1024) {
      if (s.tabWrap != null && s.tabWrap <= 2) ok('ipad tab wrap ' + w, 'tabs fit');
      else fail('ipad tab wrap ' + w, 'tab overflow ' + s.tabWrap);
    }
  }
  for (const [name, [w, h]] of Object.entries(SHOTS)) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(180);
    const file = `/opt/cursor/artifacts/game-detail-${name}.png`;
    await page.screenshot({ path: file, fullPage: false });
    out.shots.push(file);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  const tabBefore = fin.tab;
  await closeSheet(page);
  await page.evaluate(() => { const el = document.querySelector('main, #games') || document.body; if (!document.getElementById('gvPad')) el.insertAdjacentHTML('beforeend', '<div id="gvPad" style="height:1400px"></div>'); window.scrollTo(0, 640); });
  const yOpen = await page.evaluate(() => window.scrollY);
  await openKey(page, key('nfl', G.nflFinal));
  await closeSheet(page);
  const yClose = await page.evaluate(() => window.scrollY);
  const tabAfter = await page.evaluate(() => (document.querySelector('.tab.active') || {}).dataset.tab || '');
  if (tabAfter === tabBefore) ok('tab preserved on close', tabAfter);
  else fail('tab preserved on close', tabBefore + ' -> ' + tabAfter);
  if (Math.abs(yClose - yOpen) <= 4) ok('scroll preserved on close', yOpen + ' -> ' + yClose);
  else fail('scroll preserved on close', yOpen + ' -> ' + yClose);
  if ((await snap(page)).hidden) ok('close hides sheet', 'hidden');
  else fail('close hides sheet', 'still open');

  // back button
  await openKey(page, key('nfl', G.nflFinal));
  await page.waitForFunction(() => history.state && history.state.ovl === 'lt', { timeout: 4000 }).catch(() => {});
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(e => out.checks.push({ name: 'back gesture', ok: false, detail: e.message }));
  await page.waitForTimeout(300);
  const afterBack = await snap(page);
  if (afterBack.hidden) ok('back closes sheet', 'hidden');
  else fail('back closes sheet', JSON.stringify({ hidden: afterBack.hidden, gv: afterBack.gv }));

  // pregame: predictor or an explicit none, no sweat, no invented live odds
  const pre = await openKey(page, key('nfl', G.nflPre));
  if (pre.gv === 'ready' && pre.state === 'pre') ok('pregame opens', pre.names.join(' vs '));
  else fail('pregame opens', JSON.stringify(pre));
  if (!pre.sweat) ok('no sweat before kickoff', 'hidden');
  else fail('no sweat before kickoff', pre.sweat);
  if (pre.wp === 'predictor' && /ESPN Predictor/.test(pre.text) && /not a live win probability/i.test(pre.text)) ok('pregame win is labeled predictor', pre.text.slice(0, 180));
  else if (pre.wp === 'none' && /no win probability/i.test(pre.text)) ok('pregame win unavailable and said so', 'none');
  else fail('pregame win labeling', pre.wp + ' ' + pre.text.slice(0, 180));
  await closeSheet(page);

  // missing player box / missing win probability (soccer final is the real example we saw)
  const epl = await openKey(page, key('epl', G.epl));
  if (epl.gv === 'ready') ok('soccer game opens', epl.names.join(' vs ') + ' wp=' + epl.wp);
  else fail('soccer game opens', JSON.stringify(epl));
  if (epl.wp === 'none') {
    if (/no win probability/i.test(epl.text) && !/\b\d{1,3}%\s*win/i.test(epl.text)) ok('soccer does not invent a win %', 'note only');
    else fail('soccer does not invent a win %', epl.text.slice(0, 200));
  } else ok('soccer had a real feed probability', epl.wp);
  if (epl.boxNote || /Box score|Leaders|Possession|Goal/i.test(epl.text)) ok('soccer shows stats or says box is missing', epl.boxNote ? 'missing box explained' : 'stats present');
  else fail('soccer shows stats or says box is missing', epl.text.slice(0, 200));
  await closeSheet(page);

  const mlb = await openKey(page, key('mlb', G.mlb));
  if (mlb.gv === 'ready' && (mlb.wp === 'espn' || mlb.wp === 'none' || mlb.wp === 'predictor')) ok('mlb lines and win source', mlb.wp + ' ' + (mlb.text.includes('Batting') || mlb.text.includes('Pitching') || mlb.len > 40));
  else fail('mlb lines and win source', JSON.stringify(mlb));
  await closeSheet(page);

  if (G.live) {
    const lv = await openKey(page, key(G.live.k, G.live.g));
    if (lv.gv === 'ready' && lv.state === 'in') ok('live game ' + G.live.k, lv.names.join(' vs ') + ' ' + G.live.g.detail);
    else fail('live game ' + G.live.k, JSON.stringify(lv));
    if (lv.sweat != null && lv.sweat !== '') ok('live sweat uses site meter', lv.sweat);
    else fail('live sweat uses site meter', 'missing');
    if (lv.yttv) ok('youtube tv on live game', 'pill');
    else fail('youtube tv on live game', 'missing');
    if (lv.reddit) ok('reddit on live game', 'chip');
    else fail('reddit on live game', 'missing');
    if (G.live.k === 'cfb' || G.live.k === 'nfl') {
      if (lv.drives) ok('live football drives', 'list');
      else fail('live football drives', lv.text.slice(0, 160));
    }
    if (lv.wp === 'espn') ok('live win probability from feed', 'espn');
    else if (lv.wp === 'none') ok('live win probability absent and labeled', G.live.k);
    else fail('live win probability', lv.wp);
    // refresh should not blank the sheet
    await page.waitForTimeout(400);
    const again = await snap(page);
    if (again.gv === 'ready' && again.key === lv.key) ok('sheet stays filled', again.key);
    else fail('sheet stays filled', JSON.stringify(again));
    await closeSheet(page);
  } else ok('live game skipped', 'no live event on the public scoreboards right now');

  // FIXTURE: failed summary, then retry
  await page.evaluate(() => {
    const orig = getJSON;
    window.__gvOrig = orig;
    window.__gvFail = true;
    getJSON = function (url, ms) {
      if (String(url).includes('/summary?event=') && window.__gvFail) return Promise.reject(new Error('FIXTURE fail'));
      return orig(url, ms);
    };
  });
  await page.evaluate(id => ltOpen(id), key('nba', pick(boards.nba, 'post') || pick(boards.nba, 'in') || { id: '401909938' }));
  await page.waitForSelector('#ltView [data-gv="error"]', { timeout: 8000 });
  const errSnap = await snap(page);
  if (errSnap.gv === 'error' && /Retry/i.test(errSnap.text)) ok('FIXTURE failed response shows retry', 'error');
  else fail('FIXTURE failed response shows retry', JSON.stringify(errSnap));
  await page.evaluate(() => { window.__gvFail = false; });
  await page.locator('#ltView [data-gvretry]').click();
  try { await page.waitForSelector('#ltView [data-gv="ready"]', { timeout: 40000 }); }
  catch (e) {
    const dump = await snap(page);
    fail('FIXTURE retry recovers', (e.message || e).toString().split('\n')[0] + ' ' + JSON.stringify(dump));
  }
  const retried = await snap(page);
  if (retried.gv === 'ready' && retried.len > 40) ok('FIXTURE retry recovers', retried.names.join(' vs '));
  else fail('FIXTURE retry recovers', JSON.stringify(retried));
  await closeSheet(page);

  // FIXTURE: slow response keeps the loading state, then fills
  await page.evaluate(() => {
    const orig = window.__gvOrig || getJSON;
    getJSON = function (url, ms) {
      if (String(url).includes('/summary?event=') && window.__gvSlow) {
        return new Promise((res, rej) => setTimeout(() => Promise.resolve(orig(url, ms)).then(res, rej), 1600));
      }
      return orig(url, ms);
    };
    window.__gvSlow = true;
  });
  const slowId = key('nhl', pick(boards.nhl, 'post') || pick(boards.nhl, 'in') || { id: '401892662' });
  await page.evaluate(id => ltOpen(id), slowId);
  const loading = await page.waitForSelector('#ltView [data-gv="loading"]', { timeout: 3000 }).then(() => true).catch(() => false);
  if (loading) ok('FIXTURE slow response shows loading', 'loading');
  else fail('FIXTURE slow response shows loading', 'no loading state');
  await page.waitForSelector('#ltView [data-gv="ready"], #ltView [data-gv="error"]', { timeout: 40000 });
  const slowDone = await snap(page);
  if (slowDone.gv === 'ready' && slowDone.key === slowId) ok('FIXTURE slow response resolves', slowDone.names.join(' vs '));
  else fail('FIXTURE slow response resolves', JSON.stringify(slowDone));

  // FIXTURE: switch games while the first summary is still in flight
  await page.evaluate(() => { window.__gvSlow = false; window.__gvDelay = {}; });
  const aId = key('nfl', G.nflFinal);
  const bId = key('epl', G.epl);
  await page.evaluate(({ a, b }) => {
    const orig = window.__gvOrig || getJSON;
    window.__gvDelay = { [a.split(':')[1]]: 1800, [b.split(':')[1]]: 40 };
    getJSON = function (url, ms) {
      const m = String(url).match(/summary\?event=(\d+)/);
      const wait = m && window.__gvDelay[m[1]];
      if (wait) return new Promise((res, rej) => setTimeout(() => Promise.resolve(orig(url, ms)).then(res, rej), wait));
      return orig(url, ms);
    };
  }, { a: aId, b: bId });
  await page.evaluate(id => ltOpen(id), aId);
  await page.evaluate(id => ltOpen(id), bId);
  await page.waitForFunction(id => { const n = document.querySelector('#ltView [data-gv="ready"]'); return n && n.getAttribute('data-gv-key') === id; }, bId, { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(2200);
  const raced = await snap(page);
  if (raced.key === bId && raced.gv === 'ready') ok('FIXTURE switch ignores the slower game', raced.key + ' ' + raced.names.join(' vs '));
  else fail('FIXTURE switch ignores the slower game', JSON.stringify(raced));
  await closeSheet(page);
  await page.evaluate(() => { window.__gvDelay = {}; getJSON = window.__gvOrig || getJSON; });

  // entry points on real boards
  const tabs = ['nfl', 'nba', 'nhl', 'mlb', 'epl', 'cfb'];
  for (const tab of tabs) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.waitForSelector('#games .gr[data-grx], #games .card.gm[data-gmd], #games .empty, #games .err, #games .nu-note', { timeout: 25000 }).catch(() => {});
    const hit = page.locator('#games .gr[data-grx] .gr-st, #games .card.gm[data-gmd] .card-top').first();
    if (!(await hit.count())) { ok('entry ' + tab, 'no game row on this board'); continue; }
    const before = await page.evaluate(() => (document.querySelector('.tab.active') || {}).dataset.tab);
    await hit.click();
    await page.waitForSelector('#ltView [data-gv="ready"], #ltView [data-gv="error"]', { timeout: 25000 });
    const s = await snap(page);
    if (s.gv === 'ready' && s.len > 40 && s.tab === before) ok('entry ' + tab, s.key + ' ' + s.names.join(' vs '));
    else fail('entry ' + tab, JSON.stringify(s));
    await closeSheet(page);
  }
  // favorite status line, once a schedule exists
  await page.click('.tab[data-tab="mynews"]').catch(() => {});
  await page.waitForSelector('.fl-st[data-gvk], .ft-slot[data-gmd]', { timeout: 20000 }).catch(() => {});
  const fav = page.locator('.fl-st[data-gvk], .ft-slot[data-gmd]').first();
  if (await fav.count()) {
    await fav.click();
    await page.waitForSelector('#ltView [data-gv="ready"], #ltView [data-gv="error"]', { timeout: 25000 });
    const s = await snap(page);
    if (s.gv === 'ready' && s.len > 40) ok('entry favorite', s.key + ' ' + s.names.join(' vs '));
    else fail('entry favorite', JSON.stringify(s));
    await closeSheet(page);
  } else ok('entry favorite', 'no favorite game row yet');

  const tick = page.locator('#ticker .tk-game[data-ltk], #ticker .tk-game[data-tkg]').first();
  if (await tick.count()) {
    await tick.click({ force: true });
    await page.waitForSelector('#ltView [data-gv="ready"], #ltView [data-gv="error"]', { timeout: 25000 }).catch(() => {});
    const s = await snap(page);
    if (s.gv === 'ready') ok('entry ticker', s.key);
    else fail('entry ticker', JSON.stringify(s));
    if (!s.hidden) await closeSheet(page);
  } else ok('entry ticker', 'ticker had no game link yet');

  const noise = /favicon|net::|Failed to load resource|ResizeObserver|status of 4|Access-Control-Allow-Origin|access control checks|blocked by CORS/i;
  const fresh = errors.filter(e => !noise.test(e));
  out.errors = fresh;
  out.noise = errors.filter(e => noise.test(e));
  if (fresh.length) fail('chrome js errors', fresh.slice(0, 8).join(' | '));
  else ok('chrome js errors', fresh.length ? '' : 'none' + (out.noise.length ? ' (ignored ' + out.noise.length + ' pre-existing ESPN/CORS console notes)' : ''));
  await browser.close();
  return out;
}

async function runWebKit() {
  const browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = await boot(page);
  const out = { browser: 'webkit', errors: [], checks: [] };
  const fail = (name, detail) => out.checks.push({ name, ok: false, detail });
  const ok = (name, detail) => out.checks.push({ name, ok: true, detail });
  const fin = await openKey(page, key('nfl', G.nflFinal));
  if (fin.gv === 'ready' && fin.len > 80) ok('webkit blank regression', fin.names.join(' vs '));
  else fail('webkit blank regression', JSON.stringify(fin));
  for (const w of WEBKIT_WIDTHS) {
    await page.setViewportSize({ width: w, height: w >= 1000 ? 800 : 900 });
    await page.waitForTimeout(150);
    const s = await snap(page);
    if (s.pageOverflow > 1 || s.nested.length || s.wide.length || s.gv !== 'ready') fail('webkit ' + w, JSON.stringify({ overflow: s.pageOverflow, nested: s.nested, wide: s.wide, gv: s.gv }));
    else ok('webkit ' + w, 'no overflow, no nested scroller');
  }
  await closeSheet(page);
  const noise = /favicon|net::|Failed to load resource|ResizeObserver|status of 4|Access-Control-Allow-Origin|access control checks|blocked by CORS/i;
  const fresh = errors.filter(e => !noise.test(e));
  out.errors = fresh;
  out.noise = errors.filter(e => noise.test(e));
  if (fresh.length) fail('webkit js errors', fresh.slice(0, 8).join(' | '));
  else ok('webkit js errors', 'none' + (out.noise.length ? ' (ignored ' + out.noise.length + ' pre-existing ESPN/CORS console notes)' : ''));
  await browser.close();
  return out;
}

const results = { games: { nflFinal: G.nflFinal, nflPre: G.nflPre, epl: G.epl, mlb: G.mlb, live: G.live }, chrome: null, webkit: null };
try { results.chrome = await runChrome(); }
catch (e) { results.chrome = { crashed: String(e && e.stack || e) }; }
try { results.webkit = await runWebKit(); }
catch (e) { results.webkit = { crashed: String(e && e.stack || e) }; }
server.close();
const fails = [results.chrome, results.webkit].flatMap(r => (r && r.checks || []).filter(c => !c.ok).map(c => (r.browser || '?') + ' ' + c.name + ': ' + c.detail));
const crashes = [results.chrome, results.webkit].filter(r => r && r.crashed);
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('/opt/cursor/artifacts', { recursive: true });
writeFileSync('/opt/cursor/artifacts/game-detail-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({ fails, crashes: crashes.map(c => c.crashed.split('\n')[0]), shots: (results.chrome && results.chrome.shots) || [], checks: [results.chrome, results.webkit].flatMap(r => (r && r.checks) || []) }, null, 2));
process.exit(fails.length || crashes.length ? 1 : 0);
