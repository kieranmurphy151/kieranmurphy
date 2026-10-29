/* Swell Window: app */
(function () {
  'use strict';

  const M = window.SurfModel;
  const CFG = window.SW_CONFIG || {};
  const REGIONS = window.SW_REGIONS;
  const STARTER = window.SW_STARTER_SPOTS;
  const TZ = 'Europe/Dublin';
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.js';
  const FC_TTL = 40 * 60 * 1000;
  const MARINE_VARS = [
    'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
    'secondary_swell_wave_height', 'secondary_swell_wave_period', 'secondary_swell_wave_direction',
    'wind_wave_height', 'wind_wave_period', 'wind_wave_direction',
    'sea_level_height_msl'
  ];
  const TAGS = ['Clean', 'Glassy', 'Bumpy', 'Blown out', 'Closing out', 'Mushy', 'Hollow', 'Flat', 'Crowded'];
  const QUALITY = ['Junk', 'Poor', 'Fair', 'Good', 'Firing'];
  const WIND_CATS = ['offshore', 'cross-off', 'cross-shore', 'cross-on', 'onshore'];

  const $view = document.getElementById('view');
  const $tabs = document.getElementById('tabs');
  const $upd = document.getElementById('upd');
  const $refresh = document.getElementById('refresh');
  const $toast = document.getElementById('toast');

  const S = {
    mode: 'local', signedIn: false, admin: false,
    spots: [], spotsFromDb: false, logs: [],
    series: null, fetchedAt: 0, loading: false, error: null,
    cache: new Map(), lastHash: null
  };

  /* ---------- helpers ---------- */

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const fmtDayF = new Intl.DateTimeFormat('en-IE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
  const fmtWdF = new Intl.DateTimeFormat('en-IE', { timeZone: TZ, weekday: 'short' });
  const fmtHMF = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtHF = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
  const fmtKeyF = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const d8 = (t) => new Date(t * 1000);
  const dayKey = (t) => fmtKeyF.format(d8(t));
  const dayLabel = (t) => fmtDayF.format(d8(t));
  const wd = (t) => fmtWdF.format(d8(t));
  const hm = (t) => fmtHMF.format(d8(t));
  const hourOf = (t) => parseInt(fmtHF.format(d8(t)), 10) % 24;
  const nowS = () => Date.now() / 1000;
  const ft1 = (m) => (m * M.M2FT).toFixed(1);
  const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'spot';
  const regionOf = (id) => REGIONS.find((r) => r.id === id) || REGIONS[0];

  function arrow(dir) {
    if (dir == null) return '';
    return '<svg class="arr" viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(' + Math.round(dir + 180) + 'deg)"><path d="M8 1.5 12.5 12 8 9.5 3.5 12Z"/></svg>';
  }
  function partLabel(p) {
    if (!p) return '–';
    return ft1(p.h) + 'ft ' + Math.round(p.T) + 's ' + arrow(p.d) + ' ' + M.compass(p.d);
  }
  const WCAT_SHORT = { 'offshore': 'offshore', 'cross-off': 'cross-off', 'cross-shore': 'cross', 'cross-on': 'cross-on', 'onshore': 'onshore' };
  function windLabel(w, e, short) {
    if (!w || w.s == null) return '–';
    const base = Math.round(w.s) + 'kn ' + arrow(w.d) + ' ' + M.compass(w.d);
    if (!e || e.wcat == null) return base;
    const light = w.s < 5;
    const cls = light || e.wcat === 'offshore' || e.wcat === 'cross-off' ? 'off' : (e.wcat === 'onshore' || e.wcat === 'cross-on') ? 'on' : '';
    const word = light ? 'light' : WCAT_SHORT[e.wcat];
    return base + ' <span class="' + cls + '">' + word + '</span>';
  }
  function tideLabel(h) {
    if (!h || h.tide == null) return '–';
    const st = M.tideState(h.tide);
    return st.charAt(0).toUpperCase() + st.slice(1) + (h.trend > 0 ? ' ↑' : h.trend < 0 ? ' ↓' : '');
  }
  function chip(e) {
    return '<span class="chip l' + e.level + '">' + e.label + '</span>';
  }
  function toast(msg) {
    $toast.textContent = msg;
    $toast.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { $toast.hidden = true; }, 2600);
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) {
      let reason = '';
      try { reason = (await r.json()).reason || ''; } catch (e) { /* ignore */ }
      throw new Error(reason || ('Forecast service returned ' + r.status));
    }
    return r.json();
  }

  /* ---------- storage: Supabase when configured, this device otherwise ---------- */

  const Store = {
    sb: null,
    async init() {
      if (!(CFG.supabaseUrl && CFG.supabaseKey)) return 'local';
      await loadScript(SUPABASE_JS);
      this.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
      return 'cloud';
    },
    async session() {
      const { data } = await this.sb.auth.getSession();
      return data.session;
    },
    async signIn(email, password) {
      const { error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    },
    async signOut() {
      if (this.sb) await this.sb.auth.signOut();
    },
    async isAdmin() {
      if (S.mode === 'local') return true;
      const { data, error } = await this.sb.rpc('is_admin');
      return !error && data === true;
    },
    async getSpots() {
      if (S.mode === 'local') return lsGet('sw.spots');
      const { data, error } = await this.sb.from('spots').select('id,data');
      if (error) throw error;
      return data.length ? data.map((r) => Object.assign({}, r.data, { id: r.id })) : null;
    },
    async putSpots(list) {
      if (S.mode === 'local') {
        if (!lsSet('sw.spots', list)) throw new Error('This browser could not save the spot.');
        return;
      }
      const stamp = new Date().toISOString();
      const { error } = await this.sb.from('spots').upsert(list.map((sp) => ({ id: sp.id, data: sp, updated_at: stamp })));
      if (error) throw error;
    },
    async delSpot(id) {
      const { error } = await this.sb.from('spots').delete().eq('id', id);
      if (error) throw error;
    },
    async getLogs() {
      if (S.mode === 'local') return lsGet('sw.logs') || [];
      const { data, error } = await this.sb.from('logs').select('*').order('observed_at', { ascending: false }).limit(5000);
      if (error) throw error;
      return data.map((r) => Object.assign(r, { face_ft: Number(r.face_ft) }));
    },
    async addLog(row) {
      if (S.mode === 'local') {
        const r = Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, row);
        if (!lsSet('sw.logs', [r].concat(S.logs))) throw new Error('This browser could not save the log.');
        return r;
      }
      const { data, error } = await this.sb.from('logs').insert(row).select().single();
      if (error) throw error;
      return Object.assign(data, { face_ft: Number(data.face_ft) });
    },
    async delLog(id) {
      if (S.mode === 'local') { lsSet('sw.logs', S.logs.filter((l) => l.id !== id)); return; }
      const { error } = await this.sb.from('logs').delete().eq('id', id);
      if (error) throw error;
    }
  };

  /* ---------- forecast data ---------- */

  const ptKey = (p) => Number(p[0]).toFixed(3) + ',' + Number(p[1]).toFixed(3);

  function forecastPoints() {
    const pts = [];
    const seen = new Set();
    const add = (p) => { const k = ptKey(p); if (!seen.has(k)) { seen.add(k); pts.push(p); } };
    REGIONS.forEach((r) => add(r.pt));
    S.spots.forEach((s) => add(s.pt));
    return pts;
  }

  async function loadForecast(force) {
    const pts = forecastPoints();
    const sig = pts.map(ptKey).join('|');
    let raw = lsGet('sw.fc');
    if (force || !raw || raw.sig !== sig || Date.now() - raw.at > FC_TTL) {
      const lat = pts.map((p) => Number(p[0]).toFixed(3)).join(',');
      const lon = pts.map((p) => Number(p[1]).toFixed(3)).join(',');
      const common = '&past_days=7&forecast_days=7&timeformat=unixtime&timezone=Europe%2FDublin';
      const mUrl = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + lat + '&longitude=' + lon + '&hourly=' + MARINE_VARS.join(',') + common;
      const wUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset&wind_speed_unit=kn' + common;
      const [m, w] = await Promise.all([getJSON(mUrl), getJSON(wUrl)]);
      raw = { sig, at: Date.now(), m: Array.isArray(m) ? m : [m], w: Array.isArray(w) ? w : [w] };
      lsSet('sw.fc', raw);
    }
    const byKey = new Map();
    pts.forEach((p, i) => byKey.set(ptKey(p), buildSeries(raw.m[i], raw.w[i])));
    S.series = byKey;
    S.fetchedAt = raw.at;
    S.cache.clear();
  }

  function buildSeries(mj, wj) {
    const H = (mj && mj.hourly) || {};
    const W = (wj && wj.hourly) || {};
    const D = (wj && wj.daily) || {};
    const times = H.time || W.time || [];
    const wIdx = new Map((W.time || []).map((t, i) => [t, i]));
    const tide = M.tideSeries(H.sea_level_height_msl || times.map(() => null));
    const suns = (D.sunrise || []).map((sr, i) => [sr, D.sunset[i]]);
    const g = (k, i) => (H[k] ? H[k][i] : null);
    const hours = times.map((t, i) => {
      const parts = [
        { kind: 'swell', h: g('swell_wave_height', i), T: g('swell_wave_period', i), d: g('swell_wave_direction', i) },
        { kind: 'swell2', h: g('secondary_swell_wave_height', i), T: g('secondary_swell_wave_period', i), d: g('secondary_swell_wave_direction', i) },
        { kind: 'chop', h: g('wind_wave_height', i), T: g('wind_wave_period', i), d: g('wind_wave_direction', i) }
      ].filter((p) => p.h != null && p.T != null && p.d != null);
      const j = wIdx.get(t);
      const wind = j != null && W.wind_speed_10m && W.wind_speed_10m[j] != null
        ? { s: W.wind_speed_10m[j], d: W.wind_direction_10m[j], g: W.wind_gusts_10m ? W.wind_gusts_10m[j] : null }
        : null;
      const day = suns.some(([sr, ss]) => t >= sr - 2700 && t <= ss - 1800);
      return { t, parts, wind, tide: tide.frac[i], trend: tide.trend[i], day };
    });
    const withSwell = hours.filter((h) => h.parts.length).length;
    return { hours, ok: hours.length > 0 && withSwell > hours.length * 0.5 };
  }

  // Hourly inputs for a spot; falls back to the regional swell when the spot's own point has none.
  function spotSeries(spot) {
    const own = S.series.get(ptKey(spot.pt));
    if (own && own.ok) return { hours: own.hours, fallback: false };
    const reg = S.series.get(ptKey(regionOf(spot.region).pt));
    if (!reg) return { hours: own ? own.hours : [], fallback: false };
    const hours = reg.hours.map((h, i) => {
      const o = own && own.hours[i];
      return Object.assign({}, h, { wind: (o && o.wind) || h.wind });
    });
    return { hours, fallback: true };
  }

  function logsFor(spot) {
    return S.logs
      .filter((l) => l.spot_id === spot.id && l.forecast && l.forecast.parts)
      .map((l) => Object.assign({}, l, { f: M.features(spot, l.forecast) }));
  }

  function evalSpot(spot) {
    if (S.cache.has(spot.id)) return S.cache.get(spot.id);
    const ser = spotSeries(spot);
    const logs = logsFor(spot);
    const evals = ser.hours.map((h) => M.evaluate(spot, h, logs));
    const out = { spot, hours: ser.hours, evals, logs, fallback: ser.fallback };
    S.cache.set(spot.id, out);
    return out;
  }

  function nowIndex(hours) {
    const n = nowS();
    let idx = 0;
    for (let i = 0; i < hours.length; i++) if (hours[i].t <= n) idx = i;
    return idx;
  }

  // Runs of daylight hours that meet the spot's rules or look like well-rated logged days.
  function windowsFor(E) {
    const from = nowS() - 3600;
    const out = [];
    let cur = null;
    const close = () => { if (cur && cur.end - cur.start >= 3600) out.push(cur); cur = null; };
    E.hours.forEach((h, i) => {
      if (h.t < from) return;
      const e = E.evals[i];
      const r = M.flagReason(e);
      if (h.day && r.hit) {
        if (!cur) cur = { E, start: h.t, end: h.t, best: e, hour: h, byRules: r.byRules, byLogs: r.byLogs };
        else {
          cur.end = h.t;
          cur.byRules = cur.byRules || r.byRules;
          cur.byLogs = cur.byLogs || r.byLogs;
          if (e.score > cur.best.score) { cur.best = e; cur.hour = h; }
        }
      } else close();
    });
    close();
    return out;
  }

  function trust(e) {
    const L = e.learn;
    if (!L) return { level: 0, text: 'Model only' };
    const c = Math.max(L.sizeConf, L.qConf);
    if (c >= 0.6) return { level: 2, text: 'Mostly from your logs', c };
    if (c >= 0.15) return { level: 1, text: 'Partly from your logs', c };
    return { level: 0, text: 'Model only', c };
  }

  /* ---------- top bar ---------- */

  function updateBar() {
    $refresh.classList.toggle('spin', S.loading);
    $refresh.disabled = S.loading;
    $upd.textContent = S.loading ? 'Updating…' : S.fetchedAt ? 'Updated ' + hm(S.fetchedAt / 1000) : '';
    $upd.title = S.fetchedAt ? 'Forecast fetched at ' + hm(S.fetchedAt / 1000) : '';
    const h = location.hash.slice(1) || 'home';
    const cur = (k) => (h === k || (k === 'home' && h.startsWith('spot-')) || (k === 'spots' && (h === 'new' || h.startsWith('edit-'))) || (k === 'log' && h.startsWith('log')) ? ' aria-current="page"' : '');
    if (S.mode === 'cloud' && !S.signedIn) { $tabs.innerHTML = ''; return; }
    let html = '<a href="#home"' + cur('home') + '>Forecast</a>';
    if (S.admin) html += '<a class="log-tab" href="#log"' + cur('log') + '>Log a session</a><a href="#spots"' + cur('spots') + '>Spots</a>';
    if (S.mode === 'cloud') {
      if (!S.admin) html += '<button type="button" data-act="admin-in">Admin sign in</button>';
      html += '<button type="button" data-act="sign-out">Sign out</button>';
    }
    $tabs.innerHTML = html;
  }

  $tabs.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button[data-act]');
    if (!b) return;
    await Store.signOut();
    S.signedIn = false;
    S.admin = false;
    renderLogin(b.dataset.act === 'admin-in');
  });
  $refresh.addEventListener('click', () => refreshForecast(true));

  /* ---------- views ---------- */

  function previewBanner() {
    if (S.mode !== 'local') return '';
    return '<div class="banner"><b>Preview mode.</b> Not connected to the database yet, so there is no password and logs and spot edits only save on this device.</div>';
  }
  function errorBox() {
    return S.error ? '<div class="error"><b>Couldn\'t load the forecast.</b> ' + esc(S.error) + ' Check your connection and tap refresh.</div>' : '';
  }

  function renderHome() {
    if (!S.series) {
      $view.innerHTML = previewBanner() + errorBox() + (S.error ? '' : '<p class="skeleton">Loading forecast…</p>');
      return;
    }
    const all = S.spots.map(evalSpot);
    const flags = all.flatMap(windowsFor).sort((a, b) => a.start - b.start);
    const flagSpots = new Set(flags.filter((f) => f.start < nowS() + 48 * 3600).map((f) => f.E.spot.id));

    let fl = '<section class="flags" aria-labelledby="fl-h"><div class="section-head"><div><h2 id="fl-h">Could be working</h2><p class="sub">Next 7 days, daylight hours</p></div></div>';
    if (!flags.length) {
      fl += '<div class="empty">Nothing lines up with any spot\'s rules in the next 7 days. Check each coast below for the best of what\'s coming.</div>';
    } else {
      // one card per spot: its next window, plus the other days it could work
      const bySpot = new Map();
      flags.forEach((w) => { const k = w.E.spot.id; if (!bySpot.has(k)) bySpot.set(k, []); bySpot.get(k).push(w); });
      const groups = Array.from(bySpot.values()).sort((a, b) => a[0].start - b[0].start);
      fl += '<div class="flag-list">' + groups.slice(0, 10).map((g) => flagCard(g[0], g.slice(1))).join('') + '</div>';
      if (groups.length > 10) fl += '<p class="sub">' + (groups.length - 10) + ' more spots later in the week.</p>';
    }
    fl += '</section>';

    const coasts = '<section aria-labelledby="co-h"><div class="section-head"><div><h2 id="co-h">Coasts</h2><p class="sub">Conditions now and the best rating each day</p></div></div><div class="coasts">' +
      REGIONS.map((r) => coastCard(r, all.filter((E) => E.spot.region === r.id), flagSpots)).join('') + '</div></section>';

    $view.innerHTML = previewBanner() + errorBox() + '<div class="home">' + fl + coasts + '</div>';
  }

  function flagCard(w, more) {
    const e = w.best;
    const h = w.hour;
    const sp = w.E.spot;
    const src = w.byRules && w.byLogs ? 'Fits its rules and your logs' : w.byLogs ? 'Like days you rated well' : 'Fits its rules';
    return '<a class="flag" href="#spot-' + esc(sp.id) + '">' +
      '<div class="flag-top"><span class="flag-name">' + esc(sp.name) + '</span>' + chip(e) + '</div>' +
      '<div class="flag-when">' + dayLabel(w.start) + ', ' + hm(w.start) + '–' + hm(w.end + 3600) + ' · ' + M.fmtFt(e.ft) + '</div>' +
      '<div class="sub">' + esc(regionOf(sp.region).name) + '</div>' +
      '<div class="flag-meta">' +
        '<span class="tag">' + (e.dom ? partLabel(e.dom) : '–') + '</span>' +
        '<span class="tag">' + windLabel(h.wind, e) + '</span>' +
        (h.tide != null ? '<span class="tag">' + tideLabel(h) + ' tide</span>' : '') +
        '<span class="tag src' + (w.byLogs ? ' logs' : '') + '">' + src + '</span>' +
      '</div>' + (more && more.length ? '<div class="sub" style="margin-top:6px">Also ' + Array.from(new Set(more.map((m) => wd(m.start) + ' ' + hm(m.start)))).slice(0, 4).join(', ') + '</div>' : '') + '</a>';
  }

  function windowRow(w) {
    const e = w.best;
    const src = w.byRules && w.byLogs ? 'rules and logs' : w.byLogs ? 'your logs' : 'its rules';
    return '<li><div class="l-top"><b>' + dayLabel(w.start) + ', ' + hm(w.start) + '–' + hm(w.end + 3600) + '</b>' + chip(e) + '</div>' +
      '<div class="muted">' + M.fmtFt(e.ft) + ' · ' + (e.dom ? partLabel(e.dom) : '') + ' · ' + windLabel(w.hour.wind, e) + ' · fits ' + src + '</div></li>';
  }

  function coastCard(r, list, flagSpots) {
    const reg = S.series.get(ptKey(r.pt));
    let nowHtml = '';
    if (reg && reg.hours.length) {
      const h = reg.hours[nowIndex(reg.hours)];
      const sw = h.parts.filter((p) => p.kind !== 'chop').sort((a, b) => b.h - a.h)[0] || h.parts[0];
      nowHtml = '<div class="now-row">' +
        '<div class="stat"><span class="k">Swell offshore</span>' + (sw ? '<b>' + ft1(sw.h) + '</b><span class="u">ft</span> ' + Math.round(sw.T) + 's ' + arrow(sw.d) + ' ' + M.compass(sw.d) : '–') + '</div>' +
        '<div class="stat"><span class="k">Wind</span>' + (h.wind ? '<b>' + Math.round(h.wind.s) + '</b><span class="u">kn</span> ' + arrow(h.wind.d) + ' ' + M.compass(h.wind.d) + (h.wind.g ? ' <span class="muted">gust ' + Math.round(h.wind.g) + '</span>' : '') : '–') + '</div>' +
        '</div>';
    }
    // best level each day across the coast's spots
    const start = nowS();
    const days = [];
    for (let k = 0; k < 7; k++) days.push(dayKey(start + k * 86400));
    const best = days.map(() => ({ lv: 0, name: '' }));
    list.forEach((E) => E.hours.forEach((h, i) => {
      if (!h.day || h.t < start - 3600) return;
      const di = days.indexOf(dayKey(h.t));
      if (di < 0) return;
      const e = E.evals[i];
      if (e.level > best[di].lv || (e.level === best[di].lv && !best[di].name)) best[di] = { lv: e.level, name: E.spot.name };
    }));
    const week = '<div class="week" aria-label="Best rating each day">' + days.map((dk, i) => {
      const t = start + i * 86400;
      const lab = i === 0 ? 'Today' : wd(t);
      return '<div class="l' + best[i].lv + '" title="' + esc(lab + ': ' + M.LABELS[best[i].lv] + (best[i].name ? ' at ' + best[i].name : '')) + '">' + lab + '<i></i></div>';
    }).join('') + '</div>';

    const spots = '<ul class="spotlist">' + list.map((E) => {
      const i = nowIndex(E.hours);
      const e = E.evals[i];
      if (!e) return '';
      return '<li><a href="#spot-' + esc(E.spot.id) + '"><span class="nm">' + esc(E.spot.name) + (flagSpots.has(E.spot.id) ? '<span class="dot" title="Could be working in the next 48 hours"></span>' : '') + '</span>' +
        '<span class="sz">' + M.fmtFt(e.ft) + '</span>' + chip(e) + '</a></li>';
    }).join('') + '</ul>';

    return '<article class="coast"><div class="coast-head"><h3>' + esc(r.name) + '</h3><span class="eyebrow">' + esc(r.coast) + '</span></div>' +
      nowHtml + week + (list.length ? spots : '<p class="sub">No spots on this coast yet.</p>') + '</article>';
  }

  /* spot page */

  function renderSpot(id) {
    const spot = S.spots.find((s) => s.id === id);
    if (!spot) { $view.innerHTML = '<a class="back" href="#home">← Forecast</a><div class="empty">That spot isn\'t in the list any more.</div>'; return; }
    if (!S.series) { $view.innerHTML = errorBox() + '<p class="skeleton">Loading forecast…</p>'; return; }
    const E = evalSpot(spot);
    const i = nowIndex(E.hours);
    const e = E.evals[i];
    const h = E.hours[i];
    const reg = regionOf(spot.region);
    const tr = e ? trust(e) : { text: '' };
    const wins = windowsFor(E);

    let html = '<a class="back" href="#home">← Forecast</a>' + errorBox() +
      '<div class="spot-head"><div><div class="eyebrow">' + esc(reg.name) + ' · ' + esc(spot.type || 'beach') + '</div><h1>' + esc(spot.name) + '</h1></div>' +
      (S.admin ? '<div class="actions"><a class="btn signal" href="#log-' + esc(spot.id) + '">Log a session</a><a class="btn ghost" href="#edit-' + esc(spot.id) + '">Edit spot</a></div>' : '') + '</div>';

    if (e) {
      html += '<section class="panel now-panel" aria-label="Now"><div><div class="eyebrow">Now · ' + hm(h.t) + '</div><div class="big">' + M.fmtFt(e.ft) + '</div><div style="margin-top:8px">' + chip(e) + '</div></div>' +
        '<div class="now-lines">' +
        '<div><span class="muted">Swell</span> ' + e.parts.map((p) => partLabel(p) + (p.kind === 'chop' ? ' <span class="muted">(wind chop)</span>' : '')).join(' · ') + '</div>' +
        '<div><span class="muted">Wind</span> ' + windLabel(h.wind, e) + (h.wind && h.wind.g ? ' <span class="muted">gusting ' + Math.round(h.wind.g) + '</span>' : '') + '</div>' +
        '<div><span class="muted">Tide</span> ' + tideLabel(h) + (h.tide != null ? ' <span class="muted">(approx.)</span>' : '') + '</div>' +
        '<div><span class="tag src' + (tr.level ? ' logs' : '') + '">' + tr.text + '</span>' + (E.fallback ? ' <span class="muted">Using the ' + esc(reg.name) + ' offshore swell for this spot.</span>' : '') + '</div>' +
        '</div></section>';
    }

    if (wins.length) {
      html += '<section class="panel flag-panel" style="margin-top:16px"><h2>Could be working</h2><ul class="loglist" style="margin-top:6px">' + wins.slice(0, 5).map(windowRow).join('') + '</ul></section>';
    }

    html += '<div class="spot-grid"><div style="display:grid;gap:16px;min-width:0">' +
      '<section class="panel"><div class="section-head"><h2>Next 7 days</h2><span class="sub">Estimated face height</span></div>' + chartSvg(E) +
      '<div class="legend">' + M.LABELS.map((l, k) => '<span class="chip l' + k + '">' + l + '</span>').join('') + '</div></section>' +
      '<section class="panel" aria-label="Hourly">' + dayTables(E) + '</section></div>' +
      '<div style="display:grid;gap:16px;min-width:0">' + profilePanel(spot) + learnPanel(E, e) + '</div></div>';

    $view.innerHTML = html;
    $view.querySelectorAll('[data-del-log]').forEach((b) => b.addEventListener('click', () => deleteLog(b)));
  }

  function chartSvg(E) {
    const n0 = nowIndex(E.hours);
    const hrs = E.hours.slice(n0, n0 + 168);
    const ev = E.evals.slice(n0, n0 + 168);
    if (!hrs.length) return '<p class="sub">No forecast hours.</p>';
    const W = 720, H = 190, ml = 34, mr = 6, mt = 10, mb = 28;
    const n = hrs.length;
    const bw = (W - ml - mr) / n;
    const mx = Math.max(4, ...ev.map((e) => e.ft));
    const step = mx <= 6 ? 1 : mx <= 12 ? 2 : mx <= 24 ? 4 : 5;
    const top = Math.ceil(mx / step) * step;
    const y = (v) => mt + (H - mt - mb) * (1 - v / top);
    let s = '<div class="chart-wrap"><svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Estimated surf height for the next 7 days">';
    // night shading
    let run = null;
    hrs.forEach((h, i) => {
      if (!h.day && run == null) run = i;
      if ((h.day || i === n - 1) && run != null) {
        const end = h.day ? i : i + 1;
        s += '<rect class="night" x="' + (ml + run * bw).toFixed(1) + '" y="' + mt + '" width="' + ((end - run) * bw).toFixed(1) + '" height="' + (H - mt - mb) + '"/>';
        run = null;
      }
    });
    for (let v = 0; v <= top; v += step) {
      s += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/>';
      s += '<text x="' + (ml - 6) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + 'ft</text>';
    }
    ev.forEach((e, i) => {
      const yy = y(Math.min(e.ft, top));
      const hgt = Math.max(0, H - mb - yy);
      s += '<rect class="b l' + e.level + (hrs[i].day ? '' : ' dim') + '" x="' + (ml + i * bw + 0.4).toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + Math.max(1, bw - 0.8).toFixed(1) + '" height="' + hgt.toFixed(1) + '"/>';
    });
    hrs.forEach((h, i) => {
      const hr = hourOf(h.t);
      if (hr === 0) s += '<line class="grid" x1="' + (ml + i * bw).toFixed(1) + '" x2="' + (ml + i * bw).toFixed(1) + '" y1="' + mt + '" y2="' + (H - mb + 6) + '"/>';
      if (hr === 12) s += '<text x="' + (ml + i * bw).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dayLabel(h.t).replace(/ \w+$/, '') + '</text>';
    });
    s += '<line class="nowline" x1="' + ml + '" x2="' + ml + '" y1="' + mt + '" y2="' + (H - mb) + '"/>';
    return s + '</svg></div>';
  }

  function dayTables(E) {
    const n0 = nowIndex(E.hours);
    const groups = new Map();
    E.hours.forEach((h, i) => {
      if (i < n0 || !h.day) return;
      const k = dayKey(h.t);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    let html = '';
    let first = true;
    for (const [, idx] of groups) {
      if (!idx.length) continue;
      const t0 = E.hours[idx[0]].t;
      let bi = idx[0];
      idx.forEach((i) => { if (E.evals[i].score > E.evals[bi].score) bi = i; });
      const be = E.evals[bi];
      html += '<details class="day"' + (first ? ' open' : '') + '><summary><span><span class="d">' + dayLabel(t0) + '</span> <span class="w">best around ' + hm(E.hours[bi].t) + '</span></span><span class="sz-cell l' + be.level + '">' + M.fmtFt(be.ft) + '</span>' + chip(be) + '</summary>' +
        '<div class="tbl-wrap"><table class="hours"><thead><tr><th>Time</th><th>Surf</th><th>Main swell</th><th>Wind</th><th>Tide</th></tr></thead><tbody>' +
        idx.map((i) => {
          const h = E.hours[i];
          const e = E.evals[i];
          const hit = M.flagReason(e).hit;
          return '<tr class="' + (hit ? 'hit' : '') + '"><td>' + hm(h.t) + '</td><td class="sz-cell l' + e.level + '">' + M.fmtFt(e.ft) + '</td><td>' + (e.dom ? partLabel(e.dom) : '–') + '</td><td>' + windLabel(h.wind, e, true) + '</td><td>' + tideLabel(h) + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
      first = false;
    }
    return html || '<p class="sub">No daylight hours left in the forecast.</p>';
  }

  function compassSvg(sp) {
    const c = 60, r = 42;
    const pt = (deg, rad) => [c + rad * Math.sin(deg * Math.PI / 180), c - rad * Math.cos(deg * Math.PI / 180)];
    const w = sp.swell || { from: 0, to: 0 };
    const span = M.norm(w.to - w.from);
    const [x1, y1] = pt(w.from, r);
    const [x2, y2] = pt(w.to, r);
    const best = w.best != null ? w.best : M.arcMid(w.from, w.to);
    const [bx, by] = pt(best, r);
    const [wx1, wy1] = pt(sp.offshore, r + 14);
    const [wx2, wy2] = pt(sp.offshore, r - 16);
    const ah = (deg) => {
      const tip = pt(deg, r - 20);
      const l = pt(deg - 9, r - 10);
      const rr = pt(deg + 9, r - 10);
      return tip.concat(l, rr).map((v) => v.toFixed(1)).join(' ');
    };
    const lab = [['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([t, d]) => { const [x, y] = pt(d, 53); return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '">' + t + '</text>'; }).join('');
    return '<svg class="compass" viewBox="-2 -2 124 124" role="img" aria-label="Swell window ' + M.compass(w.from) + ' to ' + M.compass(w.to) + ', offshore wind from ' + M.compass(sp.offshore) + '">' +
      '<circle class="ring" cx="' + c + '" cy="' + c + '" r="' + r + '"/>' +
      '<path class="win" d="M' + c + ',' + c + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + (span > 180 ? 1 : 0) + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z"/>' +
      '<line class="best" x1="' + c + '" y1="' + c + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) + '"/>' +
      '<line class="wind" x1="' + wx1.toFixed(1) + '" y1="' + wy1.toFixed(1) + '" x2="' + wx2.toFixed(1) + '" y2="' + wy2.toFixed(1) + '"/>' +
      '<polygon class="windhead" points="' + ah(sp.offshore) + '"/>' + lab + '</svg>';
  }

  function profilePanel(sp) {
    const w = sp.swell;
    const best = w.best != null ? w.best : M.arcMid(w.from, w.to);
    const tide = sp.tide && sp.tide.length && sp.tide.length < 3 ? sp.tide.join(' to ') : 'Any';
    const winds = (sp.windOk && sp.windOk.length ? sp.windOk : ['offshore', 'cross-off']).join(', ');
    return '<section class="panel"><div class="section-head"><h2>Spot profile</h2>' + (sp.starter ? '<span class="tag src">Starter estimate</span>' : '') + '</div>' +
      '<div class="profile">' + compassSvg(sp) +
      '<dl class="rules">' +
      '<dt>Swell</dt><dd>' + M.compass(w.from) + ' to ' + M.compass(w.to) + ', best ' + M.compass(best) + '</dd>' +
      '<dt>Period</dt><dd>' + (sp.minPeriod || 8) + 's or more</dd>' +
      '<dt>Size</dt><dd>' + sp.size[0] + '–' + sp.size[1] + 'ft</dd>' +
      '<dt>Offshore</dt><dd>' + M.compass(sp.offshore) + ' wind</dd>' +
      '<dt>Wind ok</dt><dd>' + esc(winds) + ', up to ' + (sp.maxWind || 25) + 'kn</dd>' +
      '<dt>Tide</dt><dd>' + esc(tide) + '</dd>' +
      '</dl></div>' + (sp.notes ? '<p class="notes">' + esc(sp.notes) + '</p>' : '') + '</section>';
  }

  function learnPanel(E, e) {
    const logs = S.logs.filter((l) => l.spot_id === E.spot.id);
    let html = '<section class="panel"><div class="section-head"><h2>Your logs</h2><span class="sub">' + logs.length + ' logged</span></div>';
    if (e && e.learn) {
      const L = e.learn;
      const pct = Math.round(Math.max(L.sizeConf, L.qConf) * 100);
      html += '<div class="learnbox">';
      if (L.sizeConf >= 0.1) {
        const f = L.factor;
        html += '<div>For swell like now, your logs put it at <b>' + (f < 1 ? Math.round((1 - f) * 100) + '% smaller' : Math.round((f - 1) * 100) + '% bigger') + '</b> than the raw model (' + M.fmtFt(e.rawFt) + ').</div>';
      }
      if (L.q != null && L.qConf >= 0.1) html += '<div>Similar logged days averaged <b>' + L.q.toFixed(1) + '/5</b>.</div>';
      html += '<div class="muted">How much your logs count right now</div><div class="meter" aria-label="' + pct + '%"><i style="width:' + pct + '%"></i></div></div>';
    } else {
      html += '<p class="sub" style="margin-bottom:8px">' + (S.admin ? 'Log what it\'s actually like after each surf, good days and bad. After 10 to 15 logs across different swells, this spot\'s forecast starts to follow what you see.' : 'No logged sessions for this spot yet.') + '</p>';
    }
    if (logs.length) {
      html += '<ul class="loglist">' + logs.slice(0, 12).map((l) => {
        const t = Date.parse(l.observed_at) / 1000;
        const f = l.forecast || {};
        const sw = f.parts && f.parts.length ? f.parts.slice().sort((a, b) => b.h - a.h)[0] : null;
        return '<li><div class="l-top"><b>' + dayLabel(t) + ', ' + hm(t) + '</b><span>' + (l.face_ft > 0 ? l.face_ft + 'ft' : 'Flat') + ' · ' + l.quality + '/5 ' + QUALITY[l.quality - 1] + '</span></div>' +
          '<div class="muted">Forecast said ' + (f.est != null ? M.fmtFt(f.est) : '–') + (sw ? ' · ' + partLabel(sw) : '') + (f.wind ? ' · ' + Math.round(f.wind.s) + 'kn ' + M.compass(f.wind.d) : '') + '</div>' +
          (l.tags && l.tags.length ? '<div>' + l.tags.map((g) => '<span class="tag">' + esc(g) + '</span>').join(' ') + '</div>' : '') +
          (l.notes ? '<div>' + esc(l.notes) + '</div>' : '') +
          (S.admin ? '<div><button class="del" type="button" data-del-log="' + esc(l.id) + '">Delete log</button></div>' : '') + '</li>';
      }).join('') + '</ul>';
      if (logs.length > 12) html += '<p class="sub">Showing the latest 12.</p>';
    }
    return html + '</section>';
  }

  async function deleteLog(btn) {
    if (btn.dataset.armed !== '1') {
      btn.dataset.armed = '1';
      btn.textContent = 'Tap again to delete';
      setTimeout(() => { if (btn.isConnected) { btn.dataset.armed = ''; btn.textContent = 'Delete log'; } }, 4000);
      return;
    }
    const id = btn.dataset.delLog;
    const log = S.logs.find((l) => String(l.id) === id);
    if (!log) return;
    try {
      await Store.delLog(log.id);
      S.logs = S.logs.filter((l) => l !== log);
      S.cache.delete(log.spot_id);
      toast('Log deleted');
      route();
    } catch (e) { toast('Couldn\'t delete: ' + e.message); }
  }

  /* log a session */

  function spotOptions(sel) {
    return REGIONS.map((r) => {
      const list = S.spots.filter((s) => s.region === r.id);
      if (!list.length) return '';
      return '<optgroup label="' + esc(r.name) + '">' + list.map((s) => '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</optgroup>';
    }).join('');
  }

  function renderLog(spotId) {
    if (!S.admin) { $view.innerHTML = '<div class="empty">Sign in as admin to log sessions.</div>'; return; }
    if (!S.series) { $view.innerHTML = errorBox() + '<p class="skeleton">Loading forecast…</p>'; return; }
    const sel = spotId && S.spots.some((s) => s.id === spotId) ? spotId : (S.spots[0] && S.spots[0].id);
    const now = nowS();
    const dayOpts = [];
    for (let k = 0; k < 7; k++) {
      const t = now - k * 86400;
      dayOpts.push('<option value="' + dayKey(t) + '">' + (k === 0 ? 'Today' : k === 1 ? 'Yesterday' : dayLabel(t)) + '</option>');
    }
    const curH = Math.min(21, Math.max(5, hourOf(now)));
    const hourOpts = [];
    for (let h = 5; h <= 21; h++) hourOpts.push('<option value="' + h + '"' + (h === curH ? ' selected' : '') + '>' + String(h).padStart(2, '0') + ':00</option>');

    $view.innerHTML = '<h1>Log a session</h1><p class="sub" style="margin:4px 0 18px">Record what it was actually like. The app saves it next to what the forecast said for that hour and learns the difference.</p>' +
      '<form class="form" id="log-form" novalidate>' +
      '<label class="field"><span>Spot</span><select id="lg-spot">' + spotOptions(sel) + '</select></label>' +
      '<div class="row2"><label class="field"><span>Day</span><select id="lg-day">' + dayOpts.join('') + '</select></label>' +
      '<label class="field"><span>Time</span><select id="lg-hour">' + hourOpts.join('') + '</select></label></div>' +
      '<div class="model-said" id="lg-model" aria-live="polite"></div>' +
      '<div class="field"><span>Actual face height (ft)</span><div class="stepper"><button type="button" data-step="-0.5" aria-label="Smaller">−</button><input id="lg-ft" type="number" inputmode="decimal" step="0.5" min="0" max="40" placeholder="ft" required><button type="button" data-step="0.5" aria-label="Bigger">+</button></div><small>Enter 0 if it was flat.</small></div>' +
      '<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="fieldset-title" style="margin-bottom:6px">How good was it?</legend><div class="seg">' +
      QUALITY.map((q, k) => '<label><input type="radio" name="lg-q" id="lg-q' + (k + 1) + '" value="' + (k + 1) + '"><span><b>' + (k + 1) + '</b>' + q + '</span></label>').join('') + '</div></fieldset>' +
      '<fieldset class="field" style="border:0;padding:0;margin:0"><legend class="fieldset-title" style="margin-bottom:6px">What was it like?</legend><div class="checks">' +
      TAGS.map((t, k) => '<label><input type="checkbox" id="lg-t' + k + '" value="' + esc(t) + '"><span>' + esc(t) + '</span></label>').join('') + '</div></fieldset>' +
      '<label class="field"><span>Notes</span><textarea id="lg-notes" placeholder="Which peak was working, sandbanks, anything the numbers miss"></textarea></label>' +
      '<p class="err" id="lg-err"></p>' +
      '<div class="actions"><button class="btn signal" type="submit" id="lg-save">Save log</button><a class="btn ghost" href="#home">Cancel</a></div>' +
      '</form>';

    const f = document.getElementById('log-form');
    const $sp = document.getElementById('lg-spot');
    const $day = document.getElementById('lg-day');
    const $hr = document.getElementById('lg-hour');
    const $ft = document.getElementById('lg-ft');
    const $model = document.getElementById('lg-model');
    const $err = document.getElementById('lg-err');

    const pick = () => {
      const spot = S.spots.find((s) => s.id === $sp.value);
      if (!spot) return null;
      const E = evalSpot(spot);
      const i = E.hours.findIndex((h) => dayKey(h.t) === $day.value && hourOf(h.t) === Number($hr.value));
      return i < 0 ? { spot, E } : { spot, E, i, h: E.hours[i], e: E.evals[i] };
    };
    const showModel = () => {
      const p = pick();
      if (!p || p.i == null) { $model.innerHTML = 'No forecast for that hour.'; return; }
      if (p.h.t > nowS() + 1800) { $model.innerHTML = 'That time hasn\'t happened yet.'; return; }
      const { e, h } = p;
      $model.innerHTML = 'Forecast for then: <b>' + M.fmtFt(e.ft) + '</b> ' + chip(e) + '<br>' +
        (e.dom ? partLabel(e.dom) : 'no swell') + ' · ' + windLabel(h.wind, e) + ' · ' + tideLabel(h) + ' tide';
      $ft.placeholder = e.ft < 0.7 ? '0' : String(Math.round(e.ft * 2) / 2);
    };
    [$sp, $day, $hr].forEach((el) => el.addEventListener('change', showModel));
    showModel();

    f.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const cur = $ft.value === '' ? Number($ft.placeholder) || 0 : Number($ft.value);
      $ft.value = String(Math.max(0, Math.min(40, cur + Number(b.dataset.step))));
    }));

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $err.textContent = '';
      const p = pick();
      const ftVal = $ft.value === '' ? NaN : Number($ft.value);
      const q = f.querySelector('input[name="lg-q"]:checked');
      if (!p || p.i == null) { $err.textContent = 'There is no forecast for that hour. Pick a time within the last 7 days.'; return; }
      if (p.h.t > nowS() + 1800) { $err.textContent = 'Pick a time that has already happened.'; return; }
      if (!(ftVal >= 0)) { $err.textContent = 'Enter the face height in feet (0 if flat).'; $ft.focus(); return; }
      if (!q) { $err.textContent = 'Rate the session from 1 to 5.'; return; }
      const { h, e, spot } = p;
      const r1 = (v, k) => (v == null ? null : Number(v.toFixed(k)));
      const row = {
        spot_id: spot.id,
        observed_at: new Date(h.t * 1000).toISOString(),
        face_ft: ftVal,
        quality: Number(q.value),
        tags: Array.from(f.querySelectorAll('.checks input:checked')).map((c) => c.value),
        notes: document.getElementById('lg-notes').value.trim() || null,
        forecast: {
          t: h.t,
          parts: h.parts.map((x) => ({ kind: x.kind, h: r1(x.h, 2), T: r1(x.T, 1), d: Math.round(x.d) })),
          wind: h.wind ? { s: r1(h.wind.s, 1), d: Math.round(h.wind.d), g: r1(h.wind.g, 1) } : null,
          tide: r1(h.tide, 2),
          est: r1(e.ft, 1),
          raw: r1(e.rawFt, 1),
          score: r1(e.score, 1)
        }
      };
      const btn = document.getElementById('lg-save');
      btn.disabled = true;
      try {
        const saved = await Store.addLog(row);
        S.logs.unshift(saved);
        S.cache.delete(spot.id);
        const n = S.logs.filter((l) => l.spot_id === spot.id).length;
        toast('Logged. ' + spot.name + ' has ' + n + (n === 1 ? ' log.' : ' logs.'));
        location.hash = 'spot-' + spot.id;
      } catch (err) {
        $err.textContent = 'Couldn\'t save: ' + err.message;
        btn.disabled = false;
      }
    });
  }

  /* spots list and editor */

  function renderSpots() {
    if (!S.admin) { $view.innerHTML = '<div class="empty">Sign in as admin to manage spots.</div>'; return; }
    let html = '<div class="spot-head"><div><h1>Spots</h1><p class="sub">Each spot\'s rules decide its "could be working" flags.</p></div><div class="actions"><a class="btn signal" href="#new">Add a spot</a></div></div>';
    html += '<div class="coasts">' + REGIONS.map((r) => {
      const list = S.spots.filter((s) => s.region === r.id);
      return '<article class="coast"><div class="coast-head"><h3>' + esc(r.name) + '</h3><span class="eyebrow">' + list.length + ' spots</span></div><ul class="spotlist">' +
        list.map((s) => {
          const n = S.logs.filter((l) => l.spot_id === s.id).length;
          return '<li><a href="#edit-' + esc(s.id) + '"><span class="nm">' + esc(s.name) + '</span><span class="sub">' + n + ' logs</span><span class="tag src">Edit</span></a></li>';
        }).join('') + '</ul></article>';
    }).join('') + '</div>';
    $view.innerHTML = html;
  }

  function renderEdit(id) {
    if (!S.admin) { $view.innerHTML = '<div class="empty">Sign in as admin to edit spots.</div>'; return; }
    const existing = id ? S.spots.find((s) => s.id === id) : null;
    if (id && !existing) { $view.innerHTML = '<a class="back" href="#spots">← Spots</a><div class="empty">That spot isn\'t in the list any more.</div>'; return; }
    const sp = existing ? JSON.parse(JSON.stringify(existing)) : {
      name: '', region: 'waterford', type: 'beach', at: null, pt: null,
      swell: { from: 180, to: 260, best: 220 }, offshore: 0, minPeriod: 9, size: [2, 6], maxWind: 25,
      windOk: ['offshore', 'cross-off'], tide: [], scale: 1, notes: ''
    };
    const v = (x) => (x == null ? '' : esc(x));
    const num = (idf, label, val, attrs, hint) => '<label class="field"><span>' + label + '</span><input type="number" id="' + idf + '" value="' + v(val) + '" ' + attrs + '>' + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
    const checks = (name, opts, sel) => '<div class="checks">' + opts.map((o, k) => '<label><input type="checkbox" id="' + name + k + '" name="' + name + '" value="' + o + '"' + (sel.includes(o) ? ' checked' : '') + '><span>' + o + '</span></label>').join('') + '</div>';

    $view.innerHTML = '<a class="back" href="#spots">← Spots</a><h1>' + (existing ? 'Edit ' + esc(sp.name) : 'Add a spot') + '</h1>' +
      '<p class="sub" style="margin:4px 0 18px">Directions are where the swell or wind comes from, in degrees (N 0, E 90, S 180, W 270).</p>' +
      '<div class="edit-grid"><form class="form" id="ed-form" novalidate>' +
      '<label class="field"><span>Name</span><input type="text" id="ed-name" value="' + v(sp.name) + '" required></label>' +
      '<div class="row2"><label class="field"><span>Coast</span><select id="ed-region">' + REGIONS.map((r) => '<option value="' + r.id + '"' + (r.id === sp.region ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Type</span><select id="ed-type">' + ['beach', 'reef', 'point', 'rivermouth', 'slab'].map((t) => '<option' + (t === sp.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label></div>' +
      '<div class="row2">' + num('ed-plat', 'Forecast point lat', sp.pt && sp.pt[0], 'step="0.001" inputmode="decimal" required', 'A spot a few km offshore of the break') + num('ed-plon', 'Forecast point lon', sp.pt && sp.pt[1], 'step="0.001" inputmode="decimal" required', 'West is negative, e.g. -7.37') + '</div>' +
      '<div class="row3">' + num('ed-from', 'Swell from', sp.swell.from, 'min="0" max="359" inputmode="numeric"') + num('ed-best', 'Best', sp.swell.best, 'min="0" max="359" inputmode="numeric"') + num('ed-to', 'Swell to', sp.swell.to, 'min="0" max="359" inputmode="numeric"') + '</div>' +
      '<p class="sub" style="margin-top:-8px">The window runs clockwise from "Swell from" to "Swell to".</p>' +
      '<div class="row3">' + num('ed-per', 'Min period (s)', sp.minPeriod, 'min="4" max="20" step="0.5" inputmode="decimal"') + num('ed-smin', 'Min size (ft)', sp.size[0], 'min="0" max="40" step="0.5" inputmode="decimal"') + num('ed-smax', 'Max size (ft)', sp.size[1], 'min="1" max="60" step="0.5" inputmode="decimal"') + '</div>' +
      '<div class="row2">' + num('ed-off', 'Offshore wind from', sp.offshore, 'min="0" max="359" inputmode="numeric"') + num('ed-maxw', 'Max wind (kn)', sp.maxWind, 'min="5" max="60" inputmode="numeric"') + '</div>' +
      '<div class="field"><span>Wind it still works in</span>' + checks('ed-w', WIND_CATS, sp.windOk || []) + '</div>' +
      '<div class="field"><span>Tide it works on</span>' + checks('ed-t', ['low', 'mid', 'high'], sp.tide || []) + '<small>Leave all unticked for any tide.</small></div>' +
      num('ed-scale', 'Size multiplier', sp.scale || 1, 'min="0.3" max="2" step="0.05" inputmode="decimal"', 'Under 1 for sheltered spots, over 1 for reefs that focus swell. Logs fine-tune this per swell.') +
      '<label class="field"><span>Notes</span><textarea id="ed-notes">' + v(sp.notes) + '</textarea></label>' +
      '<p class="err" id="ed-err"></p>' +
      '<div class="actions"><button class="btn signal" type="submit" id="ed-save">Save spot</button><a class="btn ghost" href="#spots">Cancel</a>' + (existing ? '<button class="btn danger" type="button" id="ed-del">Delete spot</button>' : '') + '</div>' +
      '</form><div id="ed-compass">' + compassSvg(sp) + '</div></div>';

    const f = document.getElementById('ed-form');
    const gv = (k) => document.getElementById(k).value;
    const nv = (k) => (gv(k) === '' ? NaN : Number(gv(k)));
    const read = () => ({
      name: gv('ed-name').trim(),
      region: gv('ed-region'),
      type: gv('ed-type'),
      pt: [nv('ed-plat'), nv('ed-plon')],
      at: sp.at || null,
      swell: { from: M.norm(nv('ed-from')), to: M.norm(nv('ed-to')), best: M.norm(nv('ed-best')) },
      minPeriod: nv('ed-per'),
      size: [nv('ed-smin'), nv('ed-smax')],
      offshore: M.norm(nv('ed-off')),
      maxWind: nv('ed-maxw'),
      windOk: Array.from(f.querySelectorAll('input[name="ed-w"]:checked')).map((c) => c.value),
      tide: Array.from(f.querySelectorAll('input[name="ed-t"]:checked')).map((c) => c.value),
      scale: nv('ed-scale'),
      notes: gv('ed-notes').trim()
    });
    f.addEventListener('input', () => {
      const d = read();
      if ([d.swell.from, d.swell.to, d.offshore].every((x) => !isNaN(x))) document.getElementById('ed-compass').innerHTML = compassSvg(d);
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const $err = document.getElementById('ed-err');
      const d = read();
      const bad = [];
      if (!d.name) bad.push('a name');
      if (!(Math.abs(d.pt[0]) <= 90 && Math.abs(d.pt[1]) <= 180)) bad.push('the forecast point');
      if ([d.swell.from, d.swell.to, d.swell.best, d.offshore].some((x) => isNaN(x))) bad.push('the directions');
      if (!(d.minPeriod > 0) || !(d.size[0] >= 0) || !(d.size[1] > d.size[0])) bad.push('period and size range');
      if (!(d.maxWind > 0) || !(d.scale > 0)) bad.push('max wind and size multiplier');
      if (bad.length) { $err.textContent = 'Check ' + bad.join(', ') + '.'; return; }
      let newId = existing ? existing.id : slug(d.name);
      if (!existing) { let k = 2; const base = newId; while (S.spots.some((s) => s.id === newId)) newId = base + '-' + k++; }
      const saved = Object.assign({}, d, { id: newId, starter: false });
      const btn = document.getElementById('ed-save');
      btn.disabled = true;
      try {
        const ptChanged = !existing || ptKey(existing.pt) !== ptKey(saved.pt);
        const list = existing ? S.spots.map((s) => (s.id === saved.id ? saved : s)) : S.spots.concat([saved]);
        if (S.mode === 'cloud' && S.spotsFromDb) await Store.putSpots([saved]);
        else await Store.putSpots(list);
        S.spots = list;
        S.spotsFromDb = true;
        S.cache.clear();
        toast('Saved ' + saved.name);
        if (ptChanged) await refreshForecast(true, true);
        location.hash = 'spot-' + saved.id;
      } catch (err) {
        $err.textContent = 'Couldn\'t save: ' + err.message;
        btn.disabled = false;
      }
    });
    const del = document.getElementById('ed-del');
    if (del) del.addEventListener('click', async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'Tap again to delete'; return; }
      try {
        const list = S.spots.filter((s) => s.id !== existing.id);
        if (S.mode === 'cloud' && S.spotsFromDb) await Store.delSpot(existing.id);
        else await Store.putSpots(list);
        S.spots = list;
        S.spotsFromDb = true;
        S.cache.clear();
        toast('Deleted ' + existing.name);
        location.hash = 'spots';
      } catch (err) { document.getElementById('ed-err').textContent = 'Couldn\'t delete: ' + err.message; }
    });
  }

  /* login */

  function renderLogin(adminFirst) {
    updateBar();
    $view.innerHTML = '<section class="login"><div><h1>Swell Window</h1><p style="margin-top:6px">Surf forecast for Waterford, Kerry, Clare and Donegal.</p></div>' +
      '<form class="form" id="in-viewer" novalidate><label class="field"><span>Password</span><input type="password" id="in-pw" autocomplete="current-password" required></label><button class="btn" type="submit">Open forecast</button></form>' +
      '<details' + (adminFirst ? ' open' : '') + '><summary>Admin sign in</summary><form class="form" id="in-admin" novalidate>' +
      '<label class="field"><span>Email</span><input type="email" id="in-email" autocomplete="username" required></label>' +
      '<label class="field"><span>Password</span><input type="password" id="in-apw" autocomplete="current-password" required></label>' +
      '<button class="btn signal" type="submit">Sign in as admin</button></form></details>' +
      '<p class="err" id="in-err"></p></section>';
    const $err = document.getElementById('in-err');
    const go = async (email, pw, btn) => {
      $err.textContent = '';
      if (!pw) { $err.textContent = 'Enter the password.'; return; }
      btn.disabled = true;
      try {
        await Store.signIn(email, pw);
        await afterSignIn();
      } catch (e) {
        $err.textContent = /invalid/i.test(e.message) ? 'That password didn\'t work. Try again.' : 'Couldn\'t sign in: ' + e.message;
        btn.disabled = false;
      }
    };
    document.getElementById('in-viewer').addEventListener('submit', (ev) => {
      ev.preventDefault();
      go(CFG.viewerEmail, document.getElementById('in-pw').value, ev.target.querySelector('button'));
    });
    document.getElementById('in-admin').addEventListener('submit', (ev) => {
      ev.preventDefault();
      go(document.getElementById('in-email').value, document.getElementById('in-apw').value, ev.target.querySelector('button'));
    });
    (adminFirst ? document.getElementById('in-email') : document.getElementById('in-pw')).focus();
  }

  /* ---------- routing and startup ---------- */

  function route() {
    if (S.mode === 'cloud' && !S.signedIn) { renderLogin(); return; }
    const h = location.hash.slice(1) || 'home';
    if (h !== S.lastHash) { S.lastHash = h; window.scrollTo(0, 0); }
    updateBar();
    if (h.startsWith('spot-')) return renderSpot(h.slice(5));
    if (h === 'log' || h.startsWith('log-')) return renderLog(h.slice(4) || null);
    if (h === 'spots') return renderSpots();
    if (h === 'new') return renderEdit(null);
    if (h.startsWith('edit-')) return renderEdit(h.slice(5));
    return renderHome();
  }

  async function refreshForecast(force, quiet) {
    S.loading = true;
    updateBar();
    try {
      await loadForecast(force);
      S.error = null;
    } catch (e) {
      S.error = e.message || String(e);
    }
    S.loading = false;
    if (!quiet) route(); else updateBar();
  }

  async function loadData() {
    $view.innerHTML = '<p class="skeleton">Loading…</p>';
    try {
      const [spots, logs] = await Promise.all([Store.getSpots(), Store.getLogs()]);
      S.spots = spots && spots.length ? spots : STARTER.map((s) => JSON.parse(JSON.stringify(s)));
      S.spotsFromDb = !!(spots && spots.length);
      S.logs = logs || [];
    } catch (e) {
      S.spots = STARTER.map((s) => JSON.parse(JSON.stringify(s)));
      S.logs = [];
      S.error = 'Couldn\'t load spots and logs (' + (e.message || e) + ').';
    }
    await refreshForecast(false);
  }

  async function afterSignIn() {
    S.signedIn = true;
    S.admin = await Store.isAdmin();
    await loadData();
  }

  async function boot() {
    window.addEventListener('hashchange', route);
    try {
      S.mode = await Store.init();
    } catch (e) {
      $view.innerHTML = '<div class="error"><b>Couldn\'t reach the sign-in service.</b> Check your connection and reload.</div>';
      return;
    }
    if (S.mode === 'cloud') {
      const sess = await Store.session();
      if (!sess) { renderLogin(); return; }
      await afterSignIn();
    } else {
      S.signedIn = true;
      S.admin = true;
      await loadData();
    }
    // keep it fresh when the phone wakes the tab up
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && S.signedIn && Date.now() - S.fetchedAt > FC_TTL) refreshForecast(false);
    });
  }

  boot();
})();
