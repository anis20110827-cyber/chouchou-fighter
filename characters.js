/* Original cartoon fighters, drawn with canvas (no image files).
   Local space: origin at the feet, character faces +x, y is up = negative. */
(function () {
  'use strict';

  window.CHARS = [
    { key: 'det',   name: 'المحقق',  note: 'هادئ وذكي', skin: '#f0c9a0', outfit: '#2c3a52', accent: '#d9a441', dark: '#171d2b', head: 'hat',   w: 15 },
    { key: 'ninja', name: 'الظل',    note: 'سريع وصامت', skin: '#f0c9a0', outfit: '#1d2230', accent: '#e0463a', dark: '#0d1018', head: 'ninja', w: 13 },
    { key: 'bot',   name: 'روبو',    note: 'جسم معدني', skin: '#b8c8d8', outfit: '#8da4bb', accent: '#46d9ff', dark: '#2a3644', head: 'robot', w: 16 },
    { key: 'bear',  name: 'دبدوب',   note: 'قوي وطيب',   skin: '#b07a4c', outfit: '#b07a4c', accent: '#f0d2a8', dark: '#4a2f1b', head: 'bear',  w: 22 }
  ];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function ext(p) {
    if (p < 0.25) return -0.4 * (p / 0.25);
    if (p < 0.5) { const u = (p - 0.25) / 0.25; return -0.4 + 1.4 * (1 - (1 - u) * (1 - u)); }
    return 1 - (p - 0.5) / 0.5;
  }
  const DUR = { punch: 16, kick: 22, special: 34, cast: 16 };

  function puppetTarget(f) {
    const st = f.state, an = f.anim || 0, air = f.y < 298;
    const dur = DUR[st] || 16;
    const p = Math.min(1, an / dur);
    const e = (st === 'punch' || st === 'kick') ? ext(p) : 0;
    const pe = Math.max(0, e), pw = Math.max(0, -e) / 0.4;
    let lean = 0, crouch = 0, twist = 0;
    const bob = Math.sin(an * 0.16) * 1.3;
    const run = st === 'run' || Math.abs(f.vx) > 4.5;

    if (st === 'idle') crouch = bob * 0.6;
    if (st === 'walk') lean = 3;
    if (run) lean = 11;
    if (st === 'hurt') lean = -12;
    else if (st === 'punch') { lean = -7 * pw + 14 * pe; twist = 5 * pw - 8 * pe; crouch = (f.chain === 2 ? 9 * pw : 2 * pw) + 3 * pe; }
    else if (st === 'kick') { lean = -15 * pe - 3 * Math.min(0, e); crouch = 4 - 3 * pe; }
    else if (st === 'block') { lean = -2; crouch = 7; }
    else if (st === 'dodge') { lean = -18; crouch = 10; }
    else if (st === 'cast') lean = -4 + 6 * Math.sin(p * 3.14);
    else if (st === 'special') lean = 16;

    const hip = { x: twist, y: -40 + crouch };
    const sh = { x: lean, y: -68 + crouch * 1.1 };
    const head = { x: lean * 1.25, y: -88 + crouch * 1.2 };
    let fa = { x: 11, y: 0 }, fb = { x: -11, y: 0 };
    let ha = { x: sh.x + 18, y: sh.y + 14 }, hb = { x: sh.x + 10, y: sh.y + 22 };

    if (st === 'down') {
      fa = { x: 14, y: 0 }; fb = { x: -10, y: 0 };
      ha = { x: sh.x + 14, y: sh.y + 22 }; hb = { x: sh.x - 12, y: sh.y + 22 };
    } else if (st === 'hurt') {
      fa = { x: 8, y: 0 }; fb = { x: -20, y: 0 };
      ha = { x: sh.x - 18, y: sh.y - 14 }; hb = { x: sh.x - 20, y: sh.y + 4 };
    } else if (st === 'punch') {
      const upper = f.chain === 2;
      let ex;
      if (upper) ex = { x: sh.x + 16 + 34 * pe - 6 * pw, y: sh.y + 34 * pw + 20 - 66 * pe };
      else ex = { x: sh.x + 22 + 56 * pe - 30 * pw, y: sh.y + 6 + 8 * pw - 6 * pe };
      const gd = { x: sh.x + 14 - 4 * pe, y: sh.y - 6 + 18 * pe };
      if (f.chain % 2 === 1) { hb = ex; ha = gd; } else { ha = ex; hb = gd; }
      fa = { x: 24 + 12 * pe, y: 0 }; fb = { x: -20 - 10 * pe, y: 0 };
    } else if (st === 'kick') {
      if (e < 0) fa = { x: 10 + 12 * pw, y: -30 - 22 * pw };
      else fa = { x: 20 + 76 * pe, y: -44 - 42 * Math.sin(Math.min(1, pe) * 1.57) + 10 * pe };
      fb = { x: -10 - 4 * pe, y: 0 };
      ha = { x: sh.x - 22 * pe - 6, y: sh.y + 2 - 8 * pe }; hb = { x: sh.x + 18 - 8 * pw, y: sh.y - 8 };
    } else if (st === 'cast') {
      const go = p > 0.35;
      ha = { x: sh.x + (go ? 44 : 6), y: sh.y + (go ? 4 : 14) }; hb = { x: sh.x + (go ? 38 : 2), y: sh.y + (go ? 10 : 20) };
      fa = { x: 20, y: 0 }; fb = { x: -18, y: 0 };
    } else if (st === 'special') {
      fa = { x: 60, y: -30 }; fb = { x: -8, y: -24 };
      ha = { x: sh.x - 20, y: sh.y - 10 }; hb = { x: sh.x + 24, y: sh.y - 24 };
    } else if (st === 'block') {
      fa = { x: 16, y: 0 }; fb = { x: -14, y: 0 };
      ha = { x: sh.x + 20, y: sh.y - 14 }; hb = { x: sh.x + 15, y: sh.y - 2 };
    } else if (st === 'dodge') {
      fa = { x: 22, y: 0 }; fb = { x: -22, y: -4 };
      ha = { x: sh.x + 12, y: sh.y + 12 }; hb = { x: sh.x + 4, y: sh.y + 20 };
    } else if (st === 'win') {
      const w = Math.sin(an * 0.3) * 6;
      ha = { x: sh.x + 10, y: sh.y - 34 + w }; hb = { x: sh.x - 10, y: sh.y - 34 - w };
    } else if (air) {
      const up = f.vy < 0;
      fa = { x: 14, y: up ? -26 : -20 }; fb = { x: -6, y: -14 };
      ha = { x: sh.x + 20, y: sh.y - 12 }; hb = { x: sh.x + 8, y: sh.y + 2 };
    } else if (st === 'walk' || st === 'run' || run) {
      const ph = an * (run ? 0.55 : 0.35), r = run ? 1.5 : 1, sw = Math.sin(ph) * 6 * r;
      fa = { x: Math.sin(ph) * 18 * r, y: -Math.max(0, Math.cos(ph)) * 8 };
      fb = { x: -Math.sin(ph) * 18 * r, y: -Math.max(0, -Math.cos(ph)) * 8 };
      ha = { x: sh.x + 8 - sw, y: sh.y + 18 - Math.abs(sw) * 0.3 }; hb = { x: sh.x + 8 + sw, y: sh.y + 18 };
    }
    return { hip, sh, head, fa, fb, ha, hb };
  }

  const KEYS = ['hip', 'sh', 'head', 'fa', 'fb', 'ha', 'hb'];
  window.puppetStep = function (f, dt) {
    const T = puppetTarget(f);
    if (!f.pose) { f.pose = {}; for (const k of KEYS) f.pose[k] = { x: T[k].x, y: T[k].y }; return; }
    let rate = 24;
    if (f.state === 'hurt') rate = 70;
    else if (f.state === 'punch' || f.state === 'kick') {
      const p = (f.anim || 0) / (DUR[f.state]);
      rate = (p > 0.2 && p < 0.55) ? 170 : 70;
    } else if (f.state === 'cast' || f.state === 'special' || f.state === 'dodge') rate = 60;
    const k = 1 - Math.exp(-rate * dt);
    for (const key of KEYS) { const c = f.pose[key], t = T[key]; c.x += (t.x - c.x) * k; c.y += (t.y - c.y) * k; }
  };
  window.clonePose = p => { const o = {}; for (const k of KEYS) o[k] = { x: p[k].x, y: p[k].y }; return o; };

  // two-bone limb: returns the elbow/knee position
  function ik(a, b, L, side) {
    const dx = b.x - a.x, dy = b.y - a.y;
    let d = Math.hypot(dx, dy) || 0.001;
    d = Math.min(d, 2 * L - 0.01);
    const h = Math.sqrt(Math.max(0, L * L - (d / 2) * (d / 2)));
    const mx = a.x + dx / 2, my = a.y + dy / 2;
    return { x: mx + (-dy / d) * h * side, y: my + (dx / d) * h * side };
  }

  function stroke(g, pts, w, col, outline) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokeStyle = outline; g.lineWidth = w + 3.4; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
    if (outline !== 'rgba(0,0,0,0)' && outline !== '#0b0614' && w > 6 && col.charAt(0) === '#' && outline.charAt(0) === '#' && outline !== '#10131a' + 'x') {
      g.save(); g.translate(-w * 0.2, -w * 0.2);
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = w * 0.28; g.stroke(); g.restore();
    }
  }

  window.drawPuppet = function (g, ch, ps, state, opts) {
    opts = opts || {};
    const flat = opts.flat || null;
    const boss = !!opts.boss;
    const OUT = flat || '#10131a';
    const C = n => flat || n;
    let skin = C(ch.skin), outfit = C(ch.outfit), accent = C(ch.accent), dark = C(ch.dark);
    if (boss && !flat) { outfit = '#c8981f'; accent = '#fff0a0'; dark = '#5a3f08'; if (ch.head !== 'robot' && ch.head !== 'bear') skin = '#f6d98a'; else skin = '#e8c866'; }
    const wLimb = ch.head === 'bear' ? 11 : 8.5;
    g.save();
    const L = ps;
    // back arm + back leg
    stroke(g, [L.sh, ik(L.sh, L.hb, 16, -1), L.hb], wLimb - 1, outfit === skin ? dark : (ch.head === 'ninja' || ch.head === 'robot' ? outfit : skin), OUT);
    stroke(g, [L.hip, ik(L.hip, L.fb, 21, 1), L.fb], wLimb + 0.5, dark, OUT);
    // torso
    stroke(g, [L.hip, L.sh], ch.w, outfit, OUT);
    if (ch.head === 'det' && !flat) { stroke(g, [{ x: L.hip.x + 3, y: L.hip.y - 2 }, { x: L.sh.x + 3, y: L.sh.y + 4 }], 5, '#8a6a3b', 'rgba(0,0,0,0)'); }
    if (ch.head === 'bear' && !flat) { stroke(g, [{ x: L.hip.x + 3, y: L.hip.y - 2 }, { x: L.sh.x + 3, y: L.sh.y + 8 }], 12, accent, 'rgba(0,0,0,0)'); }
    if (ch.head === 'robot' && !flat) { g.fillStyle = accent; g.fillRect(L.sh.x - 3 + 2, L.sh.y + 8, 7, 7); }
    // front leg + shoes
    stroke(g, [L.hip, ik(L.hip, L.fa, 21, 1), L.fa], wLimb + 0.5, dark, OUT);
    g.fillStyle = flat || (ch.head === 'ninja' ? dark : (ch.head === 'robot' ? accent : '#1c1c22'));
    for (const f of [L.fb, L.fa]) { g.beginPath(); g.ellipse(f.x + 4, f.y - 3, 9, 5.5, 0, 0, 6.283); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.6; g.stroke();
      if (!flat) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(f.x - 4, f.y - 1.2, 16, 2.4); g.fillStyle = flat || (ch.head === 'ninja' ? dark : (ch.head === 'robot' ? accent : '#1c1c22')); } }
    // head
    const hx = L.head.x, hy = L.head.y;
    g.lineWidth = 2.4; g.strokeStyle = OUT;
    if (ch.head === 'bear') {
      g.fillStyle = skin;
      for (const ex of [-9, 9]) { g.beginPath(); g.arc(hx + ex, hy - 11, 5.5, 0, 6.283); g.fill(); g.stroke(); }
    }
    if (ch.head === 'robot') {
      g.fillStyle = skin; g.beginPath(); g.roundRect ? g.roundRect(hx - 12, hy - 12, 24, 23, 5) : g.rect(hx - 12, hy - 12, 24, 23); g.fill(); g.stroke();
      stroke(g, [{ x: hx, y: hy - 12 }, { x: hx + 2, y: hy - 21 }], 2, dark, OUT);
      g.fillStyle = accent; g.beginPath(); g.arc(hx + 2, hy - 22, 3, 0, 6.283); g.fill();
      g.fillStyle = flat || '#0f2a36'; g.fillRect(hx - 2, hy - 6, 14, 8);
      g.fillStyle = accent; g.fillRect(hx + 3, hy - 4, 7, 4);
    } else {
      g.fillStyle = ch.head === 'ninja' ? dark : skin;
      g.beginPath(); g.arc(hx, hy, 14, 0, 6.283); g.fill(); g.stroke();
      if (ch.head === 'ninja') {
        g.fillStyle = skin; g.fillRect(hx - 2, hy - 7, 16, 9);
        g.fillStyle = accent; g.fillRect(hx - 14, hy - 10, 28, 4.5);
        stroke(g, [{ x: hx - 13, y: hy - 8 }, { x: hx - 27, y: hy - 4 + Math.sin(performance.now() * 0.01) * 4 }], 3, accent, OUT);
      }
      if (ch.head === 'bear') {
        g.fillStyle = accent; g.beginPath(); g.ellipse(hx + 6, hy + 3, 7, 5.5, 0, 0, 6.283); g.fill();
        g.fillStyle = flat || '#2a1a10'; g.beginPath(); g.ellipse(hx + 10, hy + 1, 2.6, 2, 0, 0, 6.283); g.fill();
      }
      // eyes
      if (!flat) {
        const sad = state === 'hurt' || state === 'down';
        if (sad) { g.strokeStyle = '#111'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(hx + 3, hy - 5); g.lineTo(hx + 9, hy + 1); g.moveTo(hx + 9, hy - 5); g.lineTo(hx + 3, hy + 1); g.stroke(); }
        else {
          g.fillStyle = '#fff'; g.beginPath(); g.ellipse(hx + 6, hy - 3, 4.4, 5, 0, 0, 6.283); g.fill();
          g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke();
          g.fillStyle = '#111'; g.beginPath(); g.arc(hx + 7.6, hy - 3, 2.3, 0, 6.283); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(hx + 8.2, hy - 4, 0.8, 0, 6.283); g.fill();
          const atk = state === 'punch' || state === 'kick' || state === 'special' || state === 'cast';
          g.strokeStyle = ch.head === 'bear' ? '#4a2f1b' : '#2a1a10'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(hx + 1.5, hy - 8.5 - (atk ? 0 : 1)); g.lineTo(hx + 10, hy - (atk ? 5 : 9.5) - 3 + (atk ? 0 : 0)); g.stroke();
          if (ch.head !== 'bear') {
            g.strokeStyle = '#6b2a2a'; g.fillStyle = '#5a1f22'; g.lineWidth = 1.6;
            if (atk || state === 'win') { g.beginPath(); g.ellipse(hx + 7, hy + 7, 3.4, atk ? 2.6 : 3.4, 0, 0, 6.283); g.fill(); }
            else { g.beginPath(); g.moveTo(hx + 3, hy + 7); g.quadraticCurveTo(hx + 7, hy + 9, hx + 10, hy + 6.5); g.stroke(); }
          }
        }
      }
      if (ch.head === 'hat') {
        g.fillStyle = dark; g.beginPath(); g.ellipse(hx, hy - 10, 19, 4.6, 0, 0, 6.283); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(hx - 11, hy - 10); g.quadraticCurveTo(hx - 10, hy - 28, hx, hy - 28); g.quadraticCurveTo(hx + 10, hy - 28, hx + 11, hy - 10); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = accent; g.fillRect(hx - 11, hy - 14.5, 22, 3.6);
      }
    }
    // front arm + hand
    stroke(g, [L.sh, ik(L.sh, L.ha, 16, -1), L.ha], wLimb - 1, ch.head === 'ninja' || ch.head === 'robot' || ch.head === 'det' ? outfit : skin, OUT);
    g.fillStyle = flat || (ch.head === 'robot' ? accent : (ch.head === 'ninja' ? accent : (ch.head === 'det' ? '#f5efe2' : skin)));
    for (const h of [L.hb, L.ha]) { g.beginPath(); g.arc(h.x, h.y, 6.2, 0, 6.283); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.8; g.stroke(); }
    g.restore();
  };
})();
