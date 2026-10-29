/* Swell Window: forecast model.
   Turns offshore model swell into an estimated breaking face height for each spot,
   scores conditions against the spot's profile, and learns from logged sessions.
   Runs in the browser (window.SurfModel) and in Node for testing. */
(function (root) {
  'use strict';

  const G = 9.81;
  const M2FT = 3.28084;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm = (a) => ((a % 360) + 360) % 360;

  /* ---------- angles ---------- */
  function angDiff(a, b) {
    return Math.abs((((a - b) % 360) + 540) % 360 - 180);
  }
  function inArc(dir, from, to) {
    return norm(dir - from) <= norm(to - from);
  }
  function arcMid(from, to) {
    return norm(from + norm(to - from) / 2);
  }
  const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(d) {
    if (d == null || isNaN(d)) return '–';
    return COMPASS[Math.round(norm(d) / 22.5) % 16];
  }

  /* ---------- swell to surf ---------- */

  // Share of a swell's height that reaches the break (0..1), from its direction and period.
  function exposure(spot, dir, T) {
    const w = spot.swell;
    const best = (w.best != null && inArc(w.best, w.from, w.to)) ? w.best : arcMid(w.from, w.to);
    if (inArc(dir, w.from, w.to)) {
      const onFromSide = norm(dir - w.from) <= norm(best - w.from);
      const half = Math.max(5, onFromSide ? norm(best - w.from) : norm(w.to - best));
      const d = angDiff(dir, best);
      return clamp(1 - 0.4 * Math.pow(d / half, 2), 0.6, 1);
    }
    // Outside the window: falls away quickly; long-period swell wraps further.
    const e = Math.min(angDiff(dir, w.from), angDiff(dir, w.to));
    const reach = clamp(8 + (T - 8) * 2, 6, 28);
    return 0.6 * Math.exp(-e / reach);
  }

  // Breaking wave height from deep-water height and period (Komar & Gaynor), in feet.
  // FACE_CAL trims it to how Irish surfers usually call face height; logs refine it per spot.
  const FACE_CAL = 0.85;
  function breakingFt(h0, T) {
    if (!(h0 > 0) || !(T > 0)) return 0;
    return 0.39 * Math.pow(G, 0.2) * Math.pow(T * h0 * h0, 0.4) * M2FT * FACE_CAL;
  }

  // Estimated face height at the spot from all swell trains, before learning.
  function rawFace(spot, parts) {
    let sum2 = 0;
    let dom = null;
    const out = [];
    for (const p of parts || []) {
      if (!p || !(p.h > 0.05) || !(p.T > 0) || p.d == null) continue;
      const exp = exposure(spot, p.d, p.T);
      const ft = breakingFt(p.h * exp, p.T) * (spot.scale || 1);
      const q = { kind: p.kind, h: p.h, T: p.T, d: p.d, exp, ft };
      out.push(q);
      sum2 += ft * ft;
      if (!dom || ft > dom.ft) dom = q;
    }
    return { ft: Math.sqrt(sum2), dom, parts: out };
  }

  /* ---------- wind, tide, scoring ---------- */

  function windRel(spot, windDir) {
    return angDiff(windDir, spot.offshore);
  }
  function windCat(rel) {
    if (rel <= 35) return 'offshore';
    if (rel <= 70) return 'cross-off';
    if (rel <= 110) return 'cross-shore';
    if (rel <= 145) return 'cross-on';
    return 'onshore';
  }
  function windScore(rel, s, maxWind) {
    if (s == null || rel == null) return 1;
    if (s < 5) return 1;
    const cat = windCat(rel);
    if (cat === 'offshore' || cat === 'cross-off') {
      const cap = maxWind || 25;
      if (s <= cap * 0.75) return 1;
      if (s <= cap) return 0.85;
      if (s <= cap + 8) return 0.55;
      return 0.35;
    }
    const steps = {
      'cross-shore': [[8, 0.85], [12, 0.65], [18, 0.45], [Infinity, 0.25]],
      'cross-on': [[8, 0.7], [12, 0.45], [18, 0.25], [Infinity, 0.12]],
      'onshore': [[7, 0.6], [11, 0.35], [16, 0.18], [Infinity, 0.08]]
    }[cat];
    for (const [lim, v] of steps) if (s <= lim) return v;
    return 0.1;
  }

  function tideState(frac) {
    if (frac == null) return null;
    return frac < 0.33 ? 'low' : frac < 0.67 ? 'mid' : 'high';
  }
  function tideOk(spot, frac) {
    const ok = spot.tide || [];
    const st = tideState(frac);
    return !st || !ok.length || ok.length >= 3 || ok.includes(st);
  }
  function tideScore(spot, frac) {
    if (tideOk(spot, frac)) return 1;
    const st = tideState(frac);
    const adj = { low: ['mid'], mid: ['low', 'high'], high: ['mid'] }[st];
    return (spot.tide || []).some((x) => adj.includes(x)) ? 0.65 : 0.35;
  }

  // Below the range is poor, the bottom of the range is fair, the upper part is best.
  function sizeScore(spot, ft) {
    const [mn, mx] = spot.size || [2, 6];
    const sweet = mn + 0.6 * (mx - mn);
    if (ft < mn) return 0.55 * Math.pow(Math.max(0, ft) / mn, 1.5);
    if (ft < sweet) return 0.55 + 0.45 * (ft - mn) / (sweet - mn);
    if (ft <= mx) return 1;
    return Math.max(0.15, 1 - (ft - mx) / mx);
  }
  function periodScore(spot, T) {
    const m = spot.minPeriod || 8;
    if (!T) return 0.5;
    return T >= m ? 1 : 0.5 + 0.5 * Math.pow(T / m, 2);
  }

  const LABELS = ['Flat', 'Poor', 'Fair', 'Good', 'Firing'];
  function level(score, ft) {
    if (ft < 0.7) return 0;
    if (score < 3.5) return 1;
    if (score < 6) return 2;
    if (score < 8.5) return 3;
    return 4;
  }

  function rules(spot, ft, dom, wind, tide) {
    const fail = [];
    if (!dom) return { ok: false, fail: ['no swell'] };
    if (!inArc(dom.d, spot.swell.from, spot.swell.to)) fail.push('swell direction');
    if (dom.T < (spot.minPeriod || 8)) fail.push('period');
    const [mn, mx] = spot.size || [2, 6];
    if (ft < mn) fail.push('too small');
    if (ft > mx * 1.25) fail.push('too big');
    if (wind && wind.s != null && wind.d != null && wind.s >= 6) {
      const cat = windCat(windRel(spot, wind.d));
      const okCats = spot.windOk && spot.windOk.length ? spot.windOk : ['offshore', 'cross-off'];
      if (!okCats.includes(cat) || wind.s > (spot.maxWind || 25)) fail.push('wind');
    }
    if (!tideOk(spot, tide)) fail.push('tide');
    return { ok: fail.length === 0, fail };
  }

  /* ---------- learning from logged sessions ---------- */

  // Condition fingerprint for one hour (or one logged session) at a spot.
  function features(spot, snap) {
    const r = rawFace(spot, snap.parts);
    const d = r.dom;
    const w = snap.wind || {};
    return {
      raw: r.ft,
      dir: d ? d.d : null,
      T: d ? d.T : null,
      H: d ? d.h : null,
      wrel: w.d != null ? windRel(spot, w.d) : null,
      ws: w.s != null ? w.s : null,
      tide: snap.tide != null ? snap.tide : null
    };
  }

  // How alike two swells are (direction, period, size).
  function swellSim(a, b) {
    if (a.dir == null || b.dir == null) return 0;
    const dd = angDiff(a.dir, b.dir) / 22;
    const dT = (a.T - b.T) / 3;
    const dH = Math.log(Math.max(0.05, a.H) / Math.max(0.05, b.H)) / 0.6;
    return Math.exp(-(dd * dd + dT * dT + dH * dH));
  }
  // How alike two full sets of conditions are (swell, wind, tide).
  function condSim(a, b) {
    let s = swellSim(a, b);
    if (!s) return 0;
    if (a.wrel != null && b.wrel != null && a.ws != null && b.ws != null) {
      const dw = (a.wrel - b.wrel) / 50;
      const ds = (a.ws - b.ws) / 7;
      s *= Math.exp(-(dw * dw + ds * ds));
    }
    if (a.tide != null && b.tide != null) {
      const dt = (a.tide - b.tide) / 0.4;
      s *= Math.exp(-dt * dt);
    }
    return s;
  }

  const PRIOR = 1.5; // how many matching logs before logs outweigh the model

  // logs: [{ face_ft, quality, f }] where f = features(spot, log.forecast)
  function learn(logs, feat) {
    let sw = 0, slr = 0, qw = 0, qs = 0;
    const matches = [];
    for (const L of logs) {
      if (!L.f || L.f.dir == null) continue;
      const w1 = swellSim(feat, L.f);
      if (w1 > 0.002) {
        const ratio = clamp(L.face_ft / Math.max(0.3, L.f.raw), 0.05, 8);
        sw += w1;
        slr += w1 * Math.log(ratio);
      }
      const w2 = condSim(feat, L.f);
      if (w2 > 0.002) {
        qw += w2;
        qs += w2 * L.quality;
        if (w2 > 0.2) matches.push({ log: L, w: w2 });
      }
    }
    matches.sort((a, b) => b.w - a.w);
    return {
      factor: Math.exp(slr / (sw + PRIOR)),
      sizeConf: sw / (sw + PRIOR),
      q: qw > 0 ? qs / qw : null,
      qConf: qw / (qw + PRIOR),
      weight: qw,
      matches: matches.slice(0, 3)
    };
  }

  /* ---------- one hour at one spot ---------- */

  function evaluate(spot, hour, logs) {
    const raw = rawFace(spot, hour.parts);
    const wind = hour.wind || null;
    const feat = {
      raw: raw.ft,
      dir: raw.dom ? raw.dom.d : null,
      T: raw.dom ? raw.dom.T : null,
      H: raw.dom ? raw.dom.h : null,
      wrel: wind && wind.d != null ? windRel(spot, wind.d) : null,
      ws: wind ? wind.s : null,
      tide: hour.tide != null ? hour.tide : null
    };
    const L = logs && logs.length ? learn(logs, feat) : null;
    const ft = raw.ft * (L ? L.factor : 1);
    const ws = windScore(feat.wrel, feat.ws, spot.maxWind);
    const model = 10 * sizeScore(spot, ft) * periodScore(spot, feat.T) * ws * tideScore(spot, feat.tide);
    let score = model;
    if (L && L.q != null) score = (1 - L.qConf) * model + L.qConf * ((L.q - 1) / 4) * 10;
    if (ft < 0.7) score = Math.min(score, 1);
    const lv = level(score, ft);
    return {
      ft, rawFt: raw.ft, dom: raw.dom, parts: raw.parts,
      score, model, level: lv, label: LABELS[lv],
      wrel: feat.wrel, wcat: feat.wrel != null ? windCat(feat.wrel) : null,
      tideState: tideState(feat.tide),
      rules: rules(spot, ft, raw.dom, wind, feat.tide),
      learn: L, feat
    };
  }

  // Whether an hour should raise a "could be working" flag, and why.
  function flagReason(e) {
    const byRules = e.rules.ok && e.score >= 5;
    const byLogs = !!(e.learn && e.learn.q != null && e.learn.qConf >= 0.45 && e.learn.q >= 3.6 && e.ft >= 1);
    return { hit: byRules || byLogs, byRules, byLogs };
  }

  /* ---------- tide from sea level ---------- */

  // Position in the local tidal range (0 = low, 1 = high) for each hour, plus rising/falling.
  function tideSeries(levels) {
    const n = levels.length;
    const frac = new Array(n).fill(null);
    const trend = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (levels[i] == null) continue;
      let mn = Infinity, mx = -Infinity;
      for (let j = Math.max(0, i - 7); j <= Math.min(n - 1, i + 7); j++) {
        const v = levels[j];
        if (v == null) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (mx - mn < 0.05) continue;
      frac[i] = (levels[i] - mn) / (mx - mn);
      const a = levels[Math.max(0, i - 1)];
      const b = levels[Math.min(n - 1, i + 1)];
      trend[i] = a != null && b != null ? Math.sign(b - a) : 0;
    }
    return { frac, trend };
  }

  /* ---------- formatting ---------- */

  function fmtFt(ft) {
    if (ft < 0.7) return 'Flat';
    if (ft < 1.4) return '1ft';
    const lo = Math.max(1, Math.round(ft * 0.8));
    const hi = Math.max(lo + 1, Math.round(ft * 1.15));
    return lo + '–' + hi + 'ft';
  }

  const api = {
    angDiff, inArc, arcMid, compass, norm, exposure, breakingFt, rawFace,
    windRel, windCat, windScore, tideState, tideOk, tideScore, sizeScore, periodScore,
    level, LABELS, rules, features, swellSim, condSim, learn, evaluate, flagReason,
    tideSeries, fmtFt, M2FT
  };
  root.SurfModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
