/* ============================================================
   حلبة الأبطال — لعبة قتال
   شخصيات كرتونية أصلية مرسومة بالكود
   ============================================================ */
(function () {
  'use strict';

  const W = 640, H = 360;           // logical resolution
  const GROUND = 300;               // y of floor line
  const VIEW_W = 640;               // stage width shown
  const STAGE_W = 640;              // single-screen arena (classic MK style)
  const ROUND_TIME = 60;            // seconds per round
  const ROUNDS_TO_WIN = 2;          // best of 3
  const MAX_MATCH_SECONDS = 9 * 60; // hard cap: match < 10 min

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // ---------- assets ----------
  const SPR = {};   // name -> Image
  const STAGES = []; // {id,name,img}

  const SPRITE_NAMES = [];   // characters are drawn in code (characters.js)
  const STAGE_DEFS = [
    { id: 'maqam',  name: 'المقام الشهيد — الجزائر' },
    { id: 'casbah', name: 'القصبة — الجزائر' },
    { id: 'djamaa', name: 'جامع الجزائر الكبير' },
    { id: 'opera',  name: 'دار الأوبرا — بالليل' }
  ];

  // Assemble the ASSETS object from the per-file chunks loaded before this script.
  const PARTS = (typeof window !== 'undefined' && window.ASSET_PARTS) ? window.ASSET_PARTS : {};
  const SPRITE_SRC = {};
  for (const n of SPRITE_NAMES) SPRITE_SRC[n] = PARTS[n] || '';
  const STAGE_SRC = STAGE_DEFS.map(s => ({ id: s.id, name: s.name, src: PARTS['stage-' + s.id] || '' }));

  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('fail ' + src));
      im.src = src;
    });
  }

  async function loadAll() {
    const tasks = [];
    for (const n of SPRITE_NAMES) {
      if (!SPRITE_SRC[n]) continue;
      tasks.push(loadImage(SPRITE_SRC[n]).then(im => { SPR[n] = im; }));
    }
    // keep the declared stage order (not load-completion order)
    const results = await Promise.all(STAGE_SRC.map(s => loadImage(s.src).then(im => ({ s, im }))));
    for (const r of results) STAGES.push({ id: r.s.id, name: r.s.name, img: r.im });
    await Promise.all(tasks);
  }

  // ---------- input ----------
  const keys = {};
  const pressed = {};
  const KEYMAP = {
    ArrowLeft:'left', KeyA:'left',
    ArrowRight:'right', KeyD:'right',
    ArrowUp:'up', KeyW:'up',
    ArrowDown:'dodge', KeyS:'dodge',
    KeyJ:'punch', KeyZ:'punch',
    KeyK:'kick', KeyX:'kick',
    KeyL:'special', KeyC:'special',
    Space:'block', KeyF:'ball', KeyV:'ball',
    KeyQ:'dash', KeyE:'dash'
  };
  window.addEventListener('keydown', e => {
    const a = KEYMAP[e.code];
    if (a) { e.preventDefault(); if (!keys[a]) pressed[a] = true; keys[a] = true; }
    if (e.code === 'Escape') { game.pause(); }
    if (e.code === 'KeyR' && game.state === 'fight') game.resetRound(true);
  });
  window.addEventListener('keyup', e => {
    const a = KEYMAP[e.code];
    if (a) { e.preventDefault(); keys[a] = false; }
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  // touch
  const touchState = {};
  document.querySelectorAll('.tbtn').forEach(b => {
    const k = b.dataset.k;
    const on = e => { e.preventDefault(); touchState[k] = true; pressed[k] = true; };
    const off = e => { e.preventDefault(); touchState[k] = false; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });
  const down = a => keys[a] || touchState[a];
  const hit = a => !!pressed[a];

  // ---------- audio (tiny synth, no external files) ----------
  const audio = (() => {
    let ac = null;
    const ensure = () => {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      return ac;
    };
    function beep(freq, dur, type = 'square', vol = 0.05, slideTo = null) {
      const c = ensure(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), c.currentTime + dur);
      g.gain.value = vol;
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    }
    function noise(dur, vol = 0.08, filt = 1200) {
      const c = ensure(); if (!c) return;
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
      const g = c.createGain(); g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start();
    }
    return {
      punch: () => { noise(0.12, 0.10, 2200); beep(180, 0.08, 'square', 0.05, 90); },
      kick:  () => { noise(0.18, 0.13, 1400); beep(120, 0.14, 'square', 0.06, 55); },
      block: () => { beep(900, 0.06, 'square', 0.04, 500); },
      whoosh: () => { noise(0.22, 0.05, 3200); },
      special: () => { beep(300, 0.35, 'sawtooth', 0.05, 1200); noise(0.3, 0.07, 2600); },
      ko: () => { beep(220, 0.7, 'sawtooth', 0.07, 60); noise(0.5, 0.1, 800); },
      round: () => { beep(440, 0.14, 'square', 0.05); setTimeout(() => beep(660, 0.2, 'square', 0.05), 130); },
      crowd: () => { noise(1.1, 0.045, 900); }
    };
  })();

  // ---------- fighters ----------
  const GRAV = 0.62;
  const FLOOR_FRICTION = 0.76;

  class Fighter {
    constructor(x, facing, isCPU) {
      this.x = x; this.y = GROUND; this.vx = 0; this.vy = 0;
      this.facing = facing;
      this.hp = 100; this.maxHp = 100;
      this.state = 'idle';        // idle walk run jump punch kick special hurt down block win
      this.timer = 0;
      this.anim = 0;
      this.hitDone = false;
      this.isCPU = isCPU;
      this.aiTimer = 0; this.aiPlan = 'approach';
      this.combo = 0; this.comboTimer = 0;
      this.energy = 100;         // meter for special
      this.win = false;
      this.hitFlash = 0;
      this.blocking = false;
      this.scale = 1;
      this.jumps = 1; this.land = 0; this.rage = false; this.ghostT = 0;
      this.chain = 0; this.chainT = 0; this.inv = 0; this.dodgeCd = 0; this.blockT = 0; this.blockCd = 0;
      this.cfg = null; this.speed = 1; this.fatal = 0; this.ch = CHARS[0]; this.pose = null;
    }

    get w() { return 32 * this.scale; }
    get h() { return 68 * this.scale; }
    get cx() { return this.x; }
    get cy() { return this.y - this.h / 2; }

    setState(s, dur) {
      this.state = s; this.timer = dur; this.anim = 0; this.hitDone = false; this.sp0 = this.sp1 = this.sp2 = false;
    }

    update(dt) {
      const fr = dt * 60;               // timers & physics are in 60fps frames
      this.anim += fr;
      if (this.timer > 0) {
        this.timer -= fr;
        if (this.timer <= 0) {
          if (this.state === 'hurt') this.setState('idle', 0);
          else if (this.state === 'down') { /* stay down */ }
          else if (this.state !== 'win') this.setState('idle', 0);
        }
      }
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

      if (this.state === 'win') {            // victory hops
        this.vx *= 0.8; this.hopT = (this.hopT || 0) - fr;
        if (this.hopT <= 0 && this.y >= GROUND) { this.vy = -6.8; this.hopT = 46; game.sparks({ x: this.x, y: GROUND - 2 }, '#ffd24a', 5); }
      }
      // gravity
      this.vy += GRAV * fr;
      this.y += this.vy * fr;
      if (this.y >= GROUND) {
        if (this.vy > 4.5) {
          this.land = Math.min(1, this.vy / 11);
          game.sparks({ x: this.x, y: GROUND - 2 }, '#d8c9a8', 5 + Math.floor(this.vy / 3));
          game.ring(this.x, GROUND - 2, 'rgba(216,201,168,.8)', 34);
        }
        this.y = GROUND; this.vy = 0; this.jumps = 1;
        if (this.state === 'jump') this.setState('idle', 0);
      }
      // horizontal
      this.x += this.vx * fr;
      this.vx *= (down('left') || down('right')) ? 1 : Math.pow(FLOOR_FRICTION, fr);
      this.x = Math.max(40, Math.min(STAGE_W - 40, this.x));

      if (this.hitFlash > 0) this.hitFlash -= dt;
      if (this.land > 0) this.land = Math.max(0, this.land - dt * 5);
      if (this.inv > 0) this.inv -= fr;
      if (this.dodgeCd > 0) this.dodgeCd -= fr;
      if (this.blockCd > 0) this.blockCd -= fr;
      if (this.chainT > 0) { this.chainT -= fr; if (this.chainT <= 0) this.chain = 0; }
      this.energy = Math.min(100, this.energy + dt * 5);

      // afterimages while dashing / special
      if (Math.abs(this.vx) > 4.5 || this.state === 'special' || this.inv > 0) {
        this.ghostT -= fr;
        if (this.ghostT <= 0) {
          this.ghostT = 3;
          if (this.pose) game.ghosts.push({ ch: this.ch, pose: clonePose(this.pose), x: this.x, y: this.y, facing: this.facing, life: 0.28, max: 0.28, rage: this.rage });
          if (game.ghosts.length > 16) game.ghosts.shift();
        }
      }
      puppetStep(this, dt);
      // rage mode: low health = stronger + aura
      if (!this.rage && this.hp > 0 && this.hp <= this.maxHp * 0.3) {
        this.rage = true;
        game.sparks({ x: this.x, y: this.y - 40 }, '#ff4d3d', 22);
        game.ring(this.x, this.y - 40, 'rgba(255,77,61,.9)', 60);
        game.shake = Math.max(game.shake, 9); audio.special();
      }
    }

    hurtBox() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    attackBox() {
      const f = this.facing;
      const an = this.anim;
      if (this.state === 'punch' && (an < 3 || an > 11)) return null;
      if (this.state === 'kick' && (an < 5 || an > 15)) return null;
      if (this.state === 'special' && (an < 5 || an > 28)) return null;
      if (this.state === 'punch') {
        return { x: f > 0 ? this.x + 10 : this.x - 56, y: this.y - 56, w: 46, h: 22 };
      }
      if (this.state === 'kick') {
        return { x: f > 0 ? this.x + 8 : this.x - 64, y: this.y - 52, w: 56, h: 26 };
      }
      if (this.state === 'special') {
        return { x: f > 0 ? this.x + 2 : this.x - 78, y: this.y - 78, w: 76, h: 62 };
      }
      return null;
    }

    // where the visual limb reaches (for spark placement)
    hitPoint() {
      const f = this.facing;
      if (this.state === 'punch') return { x: this.x + f * 52, y: this.y - 46 };
      if (this.state === 'kick')  return { x: this.x + f * 60, y: this.y - 44 };
      if (this.state === 'special') return { x: this.x + f * 66, y: this.y - 44 };
      return { x: this.x, y: this.y - 40 };
    }
  }

  // ---------- game ----------
  const game = {
    state: 'title',       // title help stage fight pause over
    p1: null, p2: null,
    timer: ROUND_TIME,
    round: 1,
    p1wins: 0, p2wins: 0,
    stageIndex: 0,
    camera: 0,
    shake: 0,
    bannerTimer: 0,
    matchSeconds: 0,
    koSlowmo: 0,
    lastHitBy: null,
    roundEnded: false,
    startTime: 0,
    hitStop: 0,
    aiTimer: 0, aiPlan: 'approach', finish: null, beams: [], charIndex: 0,
    particles: [], ghosts: [], rings: [], balls: [], shadows: [], koDark: 0,
    comboPopup: null,
    comboPopupTimer: 0,

    // spawn impact particles at a hit point
    sparks(p, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.2 + Math.random() * 3.4;
        this.particles.push({
          x: p.x, y: p.y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2,
          life: 0.28 + Math.random() * 0.26, max: 0.54,
          color, size: 2 + Math.random() * 2.4
        });
      }
      if (this.particles.length > 140) this.particles.splice(0, this.particles.length - 140);
    },

    ring(x, y, color, r) { this.rings.push({ x, y, color, r, life: 0.3, max: 0.3 }); },

    fire(f) {
      f.energy = Math.max(0, f.energy - 25);
      this.balls.push({ x: f.x + f.facing * 40, y: f.y - 46, vx: f.facing * 7.2, owner: f, rot: 0, life: 2.2 });
      this.sparks({ x: f.x + f.facing * 40, y: f.y - 46 }, '#ffb347', 8);
      audio.special();
    },

    spawnShadow(att, def) {
      this.shadows.push({ owner: att, def, x: def.x, y: def.y - 190, t: 0, dived: false, ch: att.ch, pose: att.pose ? clonePose(att.pose) : null });
      this.ring(def.x, def.y - 190, 'rgba(163,92,255,.9)', 50);
    },

    stepShadows(d) {
      for (let i = this.shadows.length - 1; i >= 0; i--) {
        const sh = this.shadows[i], def = sh.def;
        sh.t += d;
        if (sh.t < 0.3) { sh.x += (def.x - sh.x) * 0.25; }
        else if (sh.t < 0.55) { /* locked: dodge window */ }
        else {
          sh.y += (def.y - 40 - sh.y) * Math.min(1, d * 22);
          if (sh.y > def.y - 80 && !sh.dived) {
            sh.dived = true;
            if (Math.abs(def.x - sh.x) < 38 && def.inv <= 0 && def.y > GROUND - 70 && def.state !== 'down') {
              const att = sh.owner, dir = sh.x >= att.x ? 1 : -1;
              def.hp = Math.max(0, def.hp - 14 * (att.rage ? 1.25 : 1));
              def.hitFlash = 0.3; def.vx = dir * 6; def.vy = -6; def.setState('hurt', 34);
              this.hitStop = 0.14; this.shake = 14;
              this.sparks({ x: sh.x, y: def.y - 40 }, '#c08bff', 20); audio.special();
              if (def.hp <= 0) this.endRound(att === this.p1, 'ko');
            } else floatMiss(sh.x, def.y - 60);
            this.ring(sh.x, def.y - 10, 'rgba(163,92,255,.9)', 70);
          }
          if (sh.t > 0.8) this.shadows.splice(i, 1);
        }
      }
    },

    drawShadows() {
      for (const sh of this.shadows) {
        if (!sh.pose) continue;
        const a = sh.t < 0.15 ? sh.t / 0.15 : 1;
        ctx.save(); ctx.globalAlpha = 0.9 * a;
        const x = sh.x - this.camera;
        const g = ctx.createRadialGradient(x, sh.y - 30, 4, x, sh.y - 30, 60);
        g.addColorStop(0, 'rgba(163,92,255,.55)'); g.addColorStop(1, 'rgba(163,92,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, sh.y - 30, 60, 0, 6.283); ctx.fill();
        if ('filter' in ctx) ctx.filter = 'drop-shadow(0 0 6px #a35cff)';
        ctx.translate(x, sh.y + 40); ctx.scale(sh.owner.facing, 1);
        if (sh.t >= 0.55) ctx.rotate(0.5);
        drawPuppet(ctx, sh.ch, sh.pose, 'special', { flat: '#0b0614' });
        ctx.restore();
        if (sh.t >= 0.3 && sh.t < 0.55 && !sh.dived) {   // warning line showing where it will land
          ctx.save(); ctx.strokeStyle = 'rgba(192,139,255,.8)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, sh.y + 10); ctx.lineTo(x, GROUND); ctx.stroke(); ctx.restore();
        }
      }
    },

    dealSpecial(att, def, dmg, dir, lift) {
      if (def.inv > 0 || def.state === 'down' || def.hp <= 0) return false;
      const blk = def.state === 'block';
      def.hp = Math.max(0, def.hp - dmg * (blk ? 0.3 : 1) * (att.rage ? 1.25 : 1));
      def.hitFlash = 0.25; def.vx = dir * (blk ? 2 : 6.5); def.vy = blk ? 0 : -lift;
      if (!blk) def.setState('hurt', 30);
      att.combo++; att.comboTimer = 1.4;
      this.hitStop = 0.12; this.shake = 12; audio.kick();
      this.sparks({ x: def.x, y: def.y - 45 }, '#ffffff', 16); this.ring(def.x, def.y - 45, 'rgba(255,255,255,.9)', 70);
      if (def.hp <= 0) this.endRound(att === this.p1, 'ko');
      return true;
    },

    useSpecial(f) {
      f.energy = 0;
      f.setState('sp', { det: 40, ninja: 30, bot: 46, bear: 52 }[f.ch.key] || 36);
      audio.special(); this.shake = 6;
      this.ring(f.x, f.y - 40, 'rgba(255,255,255,.9)', 60);
    },

    stepSpecial(f) {
      const k = f.ch.key, an = f.anim, opp = f === this.p1 ? this.p2 : this.p1;
      if (k !== 'bear') f.vx *= 0.8;
      if (k === 'det') {
        if (an >= 8 && !f.sp1) {
          f.sp1 = true; const dir = opp.x >= f.x ? 1 : -1;
          this.sparks({ x: f.x, y: f.y - 40 }, '#c9d4ff', 12);
          f.x = Math.max(50, Math.min(STAGE_W - 50, opp.x + dir * 58)); f.facing = -dir; f.inv = 18;
          this.sparks({ x: f.x, y: f.y - 40 }, '#c9d4ff', 12); this.ring(f.x, f.y - 40, 'rgba(201,212,255,.9)', 60);
        }
        if (an >= 15 && !f.sp2) { f.sp2 = true; this.dealSpecial(f, opp, 17, f.facing, 5); }
      } else if (k === 'ninja') {
        if (an >= 8 && !f.sp1) {
          f.sp1 = true;
          for (const a of [-0.24, 0, 0.24]) this.balls.push({ x: f.x + f.facing * 34, y: f.y - 54, vx: f.facing * 8.6 * Math.cos(a), vy: 8.6 * Math.sin(a), owner: f, rot: 0, life: 1.5, kind: 'star', dmg: 7 });
          audio.whoosh();
        }
      } else if (k === 'bot') {
        if (an >= 16 && !f.sp1) {
          f.sp1 = true; f.vx = -f.facing * 1.2;
          this.beams.push({ x: f.x + f.facing * 30, y: f.y - 52, dir: f.facing, life: 0.4 });
          this.shake = 10;
          const db = opp.hurtBox(), by = f.y - 52;
          if ((opp.x - f.x) * f.facing > 0 && db.y < by + 8 && db.y + db.h > by - 8) this.dealSpecial(f, opp, 16, f.facing, 4);
        }
      } else if (k === 'bear') {
        if (!f.sp0) { f.sp0 = true; f.vy = -11; f.vx = f.facing * 2.2; }
        if (an > 10 && f.y >= GROUND && !f.sp1) {
          f.sp1 = true; f.vx = 0; this.shake = 20; this.hitStop = 0.06;
          this.ring(f.x, GROUND - 2, 'rgba(255,220,150,.95)', 170); this.sparks({ x: f.x, y: GROUND - 4 }, '#d8c9a8', 26);
          if (Math.abs(opp.x - f.x) < 150 && opp.y >= GROUND - 4) this.dealSpecial(f, opp, 17, opp.x >= f.x ? 1 : -1, 7);
        }
      }
    },

    stepBalls(d) {
      for (let i = this.balls.length - 1; i >= 0; i--) {
        const b = this.balls[i];
        b.x += b.vx * d * 60; b.y += (b.vy || 0) * d * 60; b.rot += b.vx * 0.06 * d * 60 * (b.kind === 'star' ? 3 : 1); b.life -= d;
        if (b.kind !== 'star' && Math.random() < 0.7) this.particles.push({ x: b.x - b.vx * 2, y: b.y + (Math.random() - .5) * 8, vx: -b.vx * 0.15, vy: -0.4, life: 0.3, max: 0.3, color: Math.random() < 0.5 ? '#ff8a2e' : '#ffd24a', size: 3 + Math.random() * 3 });
        const def = b.owner === this.p1 ? this.p2 : this.p1;
        const db = def.hurtBox();
        const hitIt = b.x > db.x - 8 && b.x < db.x + db.w + 8 && b.y > db.y && b.y < db.y + db.h;
        if (hitIt && def.state !== 'down' && def.inv <= 0) {
          const dir = b.vx > 0 ? 1 : -1;
          this.balls.splice(i, 1);
          if (def.state === 'block' && def.facing === -dir) {
            def.vx = dir * 2.4; audio.block(); this.shake = 4; this.sparks({ x: b.x, y: b.y }, '#8fd3ff', 8);
            continue;
          }
          const att = b.owner;
          def.hp = Math.max(0, def.hp - (b.dmg || 9) * (att.rage ? 1.25 : 1));
          def.hitFlash = 0.22; def.vx = dir * 5; def.vy = -3.4;
          def.setState('hurt', 24);
          att.combo++; att.comboTimer = 1.4;
          this.hitStop = 0.08; this.shake = 8;
          this.sparks({ x: b.x, y: b.y }, '#ffb347', 16); this.ring(b.x, b.y, 'rgba(255,179,71,.9)', 50);
          audio.kick();
          if (def.hp <= 0) this.endRound(att === this.p1, 'ko');
        } else if (b.life <= 0 || b.x < -30 || b.x > STAGE_W + 30) this.balls.splice(i, 1);
      }
    },

    drawBalls() {
      for (const b of this.beams) {
        const a = Math.max(0, b.life / 0.4), x0 = b.x - this.camera, len = b.dir > 0 ? STAGE_W - b.x + 40 : b.x + 40;
        const xl = b.dir > 0 ? x0 : x0 - len;
        const g = ctx.createLinearGradient(0, b.y - 12, 0, b.y + 12);
        g.addColorStop(0, 'rgba(70,217,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(70,217,255,0)');
        ctx.fillStyle = g; ctx.fillRect(xl, b.y - 12 * (0.4 + a), len, 24 * (0.4 + a));
        ctx.fillStyle = 'rgba(70,217,255,' + (0.35 * a) + ')'; ctx.fillRect(xl, b.y - 22, len, 44);
        b.life -= 1 / 60;
      }
      this.beams = this.beams.filter(b => b.life > 0);
      for (const b of this.balls) {
        const x = b.x - this.camera;
        if (b.kind === 'star') {
          ctx.save(); ctx.translate(x, b.y); ctx.rotate(b.rot); ctx.fillStyle = '#d8dde6'; ctx.strokeStyle = '#10131a'; ctx.lineWidth = 1.5;
          ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? 4 : 11, a = k * 0.7854; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
          continue;
        }
        const g = ctx.createRadialGradient(x, b.y, 2, x, b.y, 26);
        g.addColorStop(0, 'rgba(255,200,80,.85)'); g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, b.y, 26, 0, 6.283); ctx.fill();
        ctx.save(); ctx.translate(x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; ctx.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); } ctx.fill();
        for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; ctx.beginPath(); ctx.arc(Math.cos(a) * 10, Math.sin(a) * 10, 3, 0, 6.283); ctx.fill(); }
        ctx.restore();
      }
    },

    updateParticles(dt) {
      for (let i = this.ghosts.length - 1; i >= 0; i--) { this.ghosts[i].life -= dt; if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1); }
      for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].life -= dt; if (this.rings[i].life <= 0) this.rings.splice(i, 1); }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.vy += 0.18;
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
      }
      if (this.comboPopupTimer > 0) {
        this.comboPopupTimer -= dt;
        if (this.comboPopupTimer <= 0) this.comboPopup = null;
      }
    },

    drawParticles() {
      for (const p of this.particles) {
        const t = Math.max(0, p.life / p.max);
        ctx.save();
        ctx.globalAlpha = t;
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + t * 0.6);
        ctx.fillRect(p.x - s / 2 - this.camera, p.y - s / 2, s, s);
        ctx.restore();
      }
    },

    init() {
      this.p1 = new Fighter(300, 1, false);
      this.p2 = new Fighter(340, -1, true);
      this.resetRound(false);
      this.state = 'title';
      showScreen('scrTitle');
    },

    resetRound(fullRestart) {
      this.timer = ROUND_TIME;
      this.p1.hp = this.p1.maxHp; this.p2.hp = this.p2.maxHp;
      this.p1.x = STAGE_W / 2 - 70; this.p2.x = STAGE_W / 2 + 70;
      this.p1.y = GROUND; this.p2.y = GROUND;
      this.p1.vx = this.p1.vy = this.p2.vx = this.p2.vy = 0;
      this.p1.setState('idle', 0); this.p2.setState('idle', 0);
      this.p1.energy = 100; this.p2.energy = 100;
      this.p1.win = false; this.p2.win = false;
      this.roundEnded = false;
      this.finish = null; this.p2.fatal = 0; this.koSlowmo = 0; this.koDark = 0; this.balls.length = 0; this.beams.length = 0; this.shadows.length = 0; this.ghosts.length = 0;
      this.p1.rage = false; this.p2.rage = false; this.p1.jumps = this.p2.jumps = 1;
      const OPP = [
        { name: 'الجناح السريع', hp: 90, speed: 1.35, aggr: 0.8, block: 0.1, dodge: 0.35 },
        { name: 'المدافع الصلب', hp: 130, speed: 0.85, aggr: 0.7, block: 0.55, dodge: 0.1 },
        { name: 'شوشع الذهبي — الزعيم', hp: 160, speed: 1.15, aggr: 1.0, block: 0.3, dodge: 0.3, boss: true, scale: 1.12 }
      ];
      const cfg = (!fullRestart && this.p1wins >= 1) ? OPP[2] : OPP[fullRestart ? 0 : (this.round - 1) % 2];
      this.p2.cfg = cfg; this.p2.maxHp = this.p2.hp = cfg.hp; this.p2.scale = cfg.scale || 1; this.p2.rage = !!cfg.boss;
      this.p1.ch = CHARS[this.charIndex];
      const others = CHARS.filter(c => c !== this.p1.ch);
      this.p2.ch = others[Math.floor(Math.random() * others.length)];
      const n1 = document.querySelector('#p1 .name span:first-child'); if (n1) n1.textContent = this.p1.ch.name;
      const nm = document.querySelector('#p2 .name span:last-child'); if (nm) nm.textContent = (cfg.boss ? 'الزعيم — ' : '') + this.p2.ch.name;
      if (cfg.boss) this.banner('الزعيم الأخير!', 'red', 1.4);
      this.bannerTimer = 0;
      const el = document.getElementById('announceTxt');
      if (el) el.className = 'txt';
      if (fullRestart) { this.p1wins = 0; this.p2wins = 0; this.round = 1; this.matchSeconds = 0; }
      updateHud();
    },

    announce(n) {
      this.banner('ROUND ' + n, '', 1.0);
      setTimeout(() => { if (this.state === 'fight') this.banner('FIGHT!', 'red', 0.8); }, 1000);
    },

    startFinish() {
      this.finish = { t: 4, done: false, ft: 0, launched: false, fat: false };
      this.koDark = 0;
      this.p2.setState('hurt', 99999);
      this.banner('FINISH HIM!', 'red', 4);
      audio.crowd();
    },

    doFatality() {
      const F = this.finish; F.done = true; F.ft = 0;
      const a = this.p1, v = this.p2;
      a.x = Math.max(60, Math.min(STAGE_W - 60, v.x - a.facing * 62)); a.vx = 0;
      a.setState('special', 34);
      this.koDark = 3.4;
    },

    stepFinish(d) {
      const F = this.finish; if (!F) return;
      const a = this.p1, v = this.p2;
      if (!F.done) {
        F.t -= d;
        if (hit('special') || hit('ball') || hit('kick')) { this.doFatality(); return; }
        if (F.t <= 0) { this.finish = null; this.matchOver(); }
        return;
      }
      F.ft += d;
      if (F.ft >= 0.3 && !F.launched) {
        F.launched = true;
        v.setState('hurt', 99999); v.vy = -14; v.vx = a.facing * 1.4; v.hitFlash = 0.8; v.grounded = false;
        this.shake = 22; this.hitStop = 0.2; audio.special(); audio.ko();
        this.sparks({ x: v.x, y: v.y - 40 }, '#ffffff', 28); this.ring(v.x, v.y - 40, 'rgba(255,255,255,.95)', 110);
      }
      if (F.launched && F.ft < 1.7) v.fatal += 0.32 * d * 60;
      if (F.ft >= 1.0 && !F.fat) { F.fat = true; this.banner('FATALITY', 'red', 2.2); }
      if (F.ft >= 1.7 && v.fatal) { v.fatal = 0; v.setState('down', 99999); }
      if (F.ft >= 3.4) { this.finish = null; v.fatal = 0; this.matchOver(); }
    },

    startFight() {
      this.round = 1; this.p1wins = 0; this.p2wins = 0; this.matchSeconds = 0;
      this.resetRound(false);
      this.state = 'fight';
      hideScreens();
      this.announce(this.round);
      audio.round();
    },

    pause() {
      if (this.state === 'fight') { this.state = 'pause'; showScreen('scrPause'); }
      else if (this.state === 'pause') { this.state = 'fight'; hideScreens(); }
    },

    banner(txt, cls = '', dur = 1.0) {
      const el = document.getElementById('announceTxt');
      el.textContent = txt;
      el.style.direction = /^[\x00-\x7f]*$/.test(txt) ? 'ltr' : 'rtl';
      el.className = 'txt show ' + cls;
      this.bannerTimer = dur;
    },

    endRound(winnerIsP1, reason) {
      if (this.roundEnded) return;
      this.roundEnded = true;
      if (winnerIsP1) { this.p1wins++; this.p1.win = true; this.p2.setState('down', 99); this.p1.setState('win', 99999); this.p1.hopT = 20; }
      else { this.p2wins++; this.p2.win = true; this.p1.setState('down', 99); this.p2.setState('win', 99999); this.p2.hopT = 20; }
      audio.ko();
      this.koSlowmo = 1.1; this.koDark = 1.7; this.balls.length = 0; this.beams.length = 0; this.shadows.length = 0;
      this.shake = 14;
      const flawless = winnerIsP1 && reason === 'ko' && this.p1.hp >= this.p1.maxHp;
      this.banner(flawless ? 'FLAWLESS VICTORY' : (reason === 'time' ? 'الوقت خلص!' : 'K.O.'), flawless ? 'win' : 'red', 1.8);
      setTimeout(() => {
        if (this.p1wins >= ROUNDS_TO_WIN && reason === 'ko') this.startFinish();
        else if (this.p1wins >= ROUNDS_TO_WIN || this.p2wins >= ROUNDS_TO_WIN) this.matchOver();
        else {
          this.round++;
          this.announce(this.round);
          setTimeout(() => this.resetRound(false), 900);
          audio.round();
        }
      }, 2200);
    },

    matchOver() {
      this.state = 'over';
      const p1Won = this.p1wins >= ROUNDS_TO_WIN;
      this.p1.win = p1Won;
      this.banner(p1Won ? this.p1.ch.name + ' يربح!' : 'خسرنا يا حبيبي', p1Won ? 'win' : 'red', 3);
      audio.crowd();
    },

    update(dt) {
      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) document.getElementById('announceTxt').className = 'txt';
      }
      if (this.shake > 0) this.shake *= 0.88;
      if (this.koDark > 0) this.koDark -= dt;
      if (this.state !== 'fight') return;

      this.matchSeconds += dt;
      if (this.matchSeconds > MAX_MATCH_SECONDS) { this.endRound(this.p1.hp >= this.p2.hp, 'time'); return; }

      const slow = this.koSlowmo > 0 ? 0.35 : 1;
      if (this.koSlowmo > 0) this.koSlowmo -= dt;
      let d = dt * slow;

      // --- hitstop: freeze everything for a beat on impact ---
      if (this.hitStop > 0) {
        this.hitStop -= dt;
        this.updateParticles(dt * 0.25);
        return;
      }

      if (!this.roundEnded) {
        this.timer -= d;
        if (this.timer <= 0) { this.timer = 0; this.endRound(this.p1.hp >= this.p2.hp, 'time'); }
      }

      this.controlPlayer(this.p1, d);
      this.controlCPU(this.p2, d, this.p1);
      this.p1.update(d);
      this.p2.update(d);
      this.resolve(this.p1, this.p2, d);
      this.resolve(this.p2, this.p1, d);
      if (this.finish) this.stepFinish(d);
      this.stepBalls(d);
      this.stepShadows(d);
      this.updateParticles(d);

      // separation: keep a clean gap so fighters never overlap/glue together
      const minDist = 58;
      const dx = this.p2.x - this.p1.x;
      const dist = Math.abs(dx);
      if (dist < minDist && this.p1.y === GROUND && this.p2.y === GROUND) {
        const push = (minDist - dist) / 2;
        const s = dx >= 0 ? 1 : -1;
        // push the CPU more than the player so the player is not cornered
        this.p1.x -= push * s * 0.30;
        this.p2.x += push * s * 1.70;
        this.p1.x = Math.max(52, Math.min(STAGE_W - 52, this.p1.x));
        this.p2.x = Math.max(52, Math.min(STAGE_W - 52, this.p2.x));
      }
      // facing
      if (!this.roundEnded) {
        this.p1.facing = this.p2.x >= this.p1.x ? 1 : -1;
        this.p2.facing = this.p1.x >= this.p2.x ? 1 : -1;
      }

      // camera follows midpoint
      const mid = (this.p1.x + this.p2.x) / 2;
      const target = Math.max(0, Math.min(STAGE_W - VIEW_W, mid - VIEW_W / 2));
      this.camera += (target - this.camera) * 0.12;

      updateHud();
    },

    controlPlayer(f, dt) {
      if (f.state === 'hurt' || f.state === 'down' || f.state === 'win') return;
      if (f.state === 'sp') { this.stepSpecial(f); return; }
      if (f.state === 'cast') { f.vx *= 0.6; if (!f.hitDone && f.anim >= 6) { f.hitDone = true; this.fire(f); } return; }
      if (f.state === 'dodge') { return; }
      if (f.state === 'punch' && f.hitDone && f.anim >= 6 && hit('punch')) { f.setState('punch', 16); audio.whoosh(); return; }
      if (f.state === 'punch' && f.hitDone && f.anim >= 6 && hit('kick')) { f.setState('kick', 22); audio.whoosh(); return; }
      if (f.state === 'punch' || f.state === 'kick' || f.state === 'special') {
        // tiny lunge only at the start of the attack, then stop (no sliding into the opponent)
        if (f.timer > 8) f.vx += f.facing * 0.18;
        else f.vx *= 0.72;
        return;
      }
      if (hit('block')) {
        f.setState('block', 0); f.blocking = true; f.vx *= 0.6; return;
      }
      f.blocking = false;
      if (hit('punch')) { f.setState('punch', 16); audio.whoosh(); return; }
      if (hit('kick')) { f.setState('kick', 22); audio.whoosh(); return; }
      if (hit('dodge') && f.y === GROUND && f.dodgeCd <= 0) {
        const dir = down('left') ? -1 : down('right') ? 1 : -f.facing;
        f.setState('dodge', 14); f.inv = 14; f.dodgeCd = 34; f.vx = dir * 6.2;
        game.ring(f.x, GROUND - 2, 'rgba(255,255,255,.7)', 38); audio.whoosh(); return;
      }
      if (hit('ball') && f.energy >= 25) { f.setState('cast', 16); audio.whoosh(); return; }
      if (hit('special') && f.energy >= 40) {
        this.useSpecial(f); return;
      }
      if (hit('up')) {
        if (f.y === GROUND) {
          f.setState('jump', 0); f.vy = -9.4; f.vx = f.facing * 2.2; f.jumps = 1;
          this.sparks({ x: f.x, y: GROUND - 2 }, '#d8c9a8', 5);
          return;
        }
        if (f.jumps > 0) {
          f.jumps--; f.setState('jump', 0); f.vy = -8.4;
          f.vx = (down('left') ? -1 : down('right') ? 1 : 0.5 * f.facing) * 2.8;
          this.ring(f.x, f.y - 10, 'rgba(255,255,255,.9)', 40);
          this.sparks({ x: f.x, y: f.y - 8 }, '#ffffff', 8); audio.whoosh();
          return;
        }
      }
      // dash (Q / E): quick burst in the pressed direction
      if (f.y === GROUND) {
        if (down('dash') && down('left')) { f.vx = -6.0; f.setState('run', 0); return; }
        if (down('dash') && down('right')) { f.vx = 6.0; f.setState('run', 0); return; }
      }
      if (down('left')) { f.vx = -3.1; f.setState(f.y < GROUND ? 'jump' : 'walk', 0); }
      else if (down('right')) { f.vx = 3.1; f.setState(f.y < GROUND ? 'jump' : 'walk', 0); }
      else if (f.y === GROUND && (f.state === 'walk' || f.state === 'run')) f.setState('idle', 0);
    },

    controlCPU(f, dt, opp) {
      if (f.state === 'hurt' || f.state === 'down' || f.state === 'win') return;
      if (f.state === 'sp') { this.stepSpecial(f); return; }
      if (f.state === 'cast') { f.vx *= 0.6; if (!f.hitDone && f.anim >= 6) { f.hitDone = true; this.fire(f); } return; }
      if (f.state === 'punch' && f.hitDone && f.anim >= 6 && Math.random() < 0.1) { f.setState(Math.random() < 0.7 ? 'punch' : 'kick', 16); audio.whoosh(); return; }
      if (f.state === 'punch' || f.state === 'kick' || f.state === 'special') {
        if (f.timer > 8) f.vx += f.facing * 0.16;
        else f.vx *= 0.72;
        return;
      }

      const c = f.cfg || { aggr: 0.6, block: 0.3, speed: 1, dodge: 0.1 };
      this.aiTimer -= dt;
      const dist = Math.abs(opp.x - f.x);
      const oppAtk = opp.state === 'punch' || opp.state === 'kick' || opp.state === 'special' || opp.state === 'cast';

      // short, limited blocking (no endless turtling)
      if (f.state === 'block') {
        f.blockT -= dt * 60;
        if (f.blockT > 0) return;
        f.blocking = false; f.blockCd = 70; f.setState('idle', 0);
      }
      if (f.state === 'dodge') return;
      if (oppAtk && dist < 90 && opp.anim < 5) {
        if (f.dodgeCd <= 0 && Math.random() < c.dodge) {
          f.setState('dodge', 14); f.inv = 14; f.dodgeCd = 60; f.vx = -f.facing * 6.2;
          this.ring(f.x, GROUND - 2, 'rgba(255,255,255,.7)', 38); return;
        }
        if (f.blockCd <= 0 && Math.random() < c.block) { f.setState('block', 0); f.blocking = true; f.blockT = 16; return; }
      }
      f.blocking = false;

      if (this.aiTimer <= 0) {
        this.aiTimer = 0.2 + Math.random() * 0.4;
        const r = Math.random();
        if (dist > 150) this.aiPlan = (r > 0.8 && f.energy >= 25) ? 'ball' : (r < 0.85 ? 'approach' : 'jump');
        else if (dist > 80) this.aiPlan = r < 0.75 ? 'approach' : (r < 0.88 ? 'jump' : 'wait');
        else {
          const at = c.aggr;
          this.aiPlan = r < at * 0.5 ? 'punch' : (r < at * 0.8 ? 'kick' : (r < at * 0.9 && f.energy >= 40 ? 'special' : (r < 0.93 ? 'stepback' : 'wait')));
        }
      }

      switch (this.aiPlan) {
        case 'approach':
          f.vx = f.facing * 2.5 * c.speed;
          f.setState(f.y < GROUND ? 'jump' : 'walk', 0);
          break;
        case 'stepback':
          f.vx = -f.facing * 2.2;
          f.setState('walk', 0);
          break;
        case 'wait':
          f.vx *= 0.5;
          if (f.y === GROUND) f.setState('idle', 0);
          break;
        case 'jump':
          if (f.y === GROUND) { f.vy = -9.2; f.vx = f.facing * 2.6; f.setState('jump', 0); }
          else if (f.jumps > 0 && f.vy > 0 && Math.random() < 0.08) { f.jumps--; f.vy = -8.4; this.ring(f.x, f.y - 10, 'rgba(255,255,255,.9)', 40); }
          break;
        case 'ball':
          f.setState('cast', 16); audio.whoosh(); this.aiTimer = 0.9; this.aiPlan = 'approach'; break;
        case 'punch':
          f.setState('punch', 16); audio.whoosh(); this.aiPlan = 'wait'; break;
        case 'kick':
          f.setState('kick', 22); audio.whoosh(); this.aiPlan = 'wait'; break;
        case 'special':
          if (f.energy >= 40) this.useSpecial(f);
          else f.setState('idle', 0);
          this.aiPlan = 'wait';
          break;
      }
    },

    resolve(att, def, dt) {
      if (!att.attackBox()) return;
      if (att.hitDone) return;
      if (def.inv > 0) return;
      const ab = att.attackBox();
      const db = def.hurtBox();
      if (ab.x < db.x + db.w && ab.x + ab.w > db.x && ab.y < db.y + db.h && ab.y + ab.h > db.y) {
        att.hitDone = true;
        const isSpecial = att.state === 'special';
        const dmg = (isSpecial ? 15 : (att.state === 'kick' ? 10 : 6)) * (att.rage ? 1.25 : 1);
        const hp = att.hitPoint();
        if (def.state === 'block' && !isSpecial) {
          def.vx = att.facing * 3.2;
          def.energy = Math.min(100, def.energy + 6);
          audio.block();
          this.shake = 5;
          this.sparks(hp, '#8fd3ff', 6);
          return;
        }
        def.hp = Math.max(0, def.hp - dmg);
        def.hitFlash = 0.22;
        att.combo++; att.comboTimer = 1.4;
        if (att.state === 'punch') { att.chain = Math.min(3, att.chain + 1); att.chainT = 40; if (att.chain === 3) { this.spawnShadow(att, def); att.chain = 0; } }
        else att.chain = 0;

        // --- knockback: the defender is pushed AWAY and briefly lifted ---
        const kb = isSpecial ? 8.5 : (att.state === 'kick' ? 6.4 : 4.6);
        def.vx = att.facing * kb;
        def.vy = isSpecial ? -6.0 : -2.6;

        // --- hitstop: both freeze for a moment (impact feel) ---
        this.hitStop = isSpecial ? 0.16 : 0.10;
        { const tm = Math.max(att.timer, isSpecial ? 26 : 18); att.setState(att.state, tm); att.hitDone = true; att.anim = 12; }
        def.setState('hurt', isSpecial ? 34 : 24);

        // --- attacker does NOT slide into the defender ---
        att.vx = att.facing * 0.4;

        this.shake = isSpecial ? 13 : 7;
        this.sparks(hp, isSpecial ? '#ffd24a' : '#ffffff', isSpecial ? 16 : 9);
        this.lastHitBy = att;
        if (att.state === 'punch') audio.punch(); else audio.kick();
        if (def.hp <= 0) this.endRound(att === this.p1, 'ko');
      }
    },

    // ---------- rendering ----------
    draw() {
      const st = STAGES[this.stageIndex];
      ctx.save();
      if (this.shake > 0.5) {
        ctx.translate((Math.random() - .5) * this.shake, (Math.random() - .5) * this.shake);
      }
      // background: single screen, cover-fit (no seams)
      if (st) {
        const sw = st.img.width, sh = st.img.height;
        const scale = Math.max(VIEW_W / sw, H / sh);
        const dw = sw * scale, dh = sh * scale;
        const ox = (VIEW_W - dw) / 2, oy = (H - dh) / 2;
        ctx.drawImage(st.img, ox, oy, dw, dh);
      }
      // ground shade
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fillRect(0, GROUND, VIEW_W, H - GROUND);

      // KO: background goes dark, winner glows
      const dk = this.koDark > 0 ? Math.min(1, this.koDark / 0.4) : 0;
      if (dk > 0) {
        ctx.fillStyle = 'rgba(2,4,14,' + (0.78 * dk).toFixed(3) + ')';
        ctx.fillRect(0, 0, VIEW_W, H);
        const wf = this.p1.win ? this.p1 : (this.p2.win ? this.p2 : null);
        if (wf) {
          const gx = wf.x - this.camera, gy = wf.y - 40;
          const g = ctx.createRadialGradient(gx, gy, 6, gx, gy, 110);
          g.addColorStop(0, 'rgba(255,215,90,' + (0.7 * dk).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,215,90,0)');
          ctx.fillStyle = g; ctx.fillRect(gx - 120, gy - 120, 240, 240);
        }
      }
      // afterimages
      for (const g of this.ghosts) {
        ctx.save(); ctx.globalAlpha = 0.38 * (g.life / g.max);
        ctx.translate(g.x - this.camera, g.y); if (g.facing < 0) ctx.scale(-1, 1);
        drawPuppet(ctx, g.ch, g.pose, 'dash', { flat: g.rage ? '#ff7a6a' : '#8fe8b0' }); ctx.restore();
      }
      // fighters
      this.drawFighter(this.p2);
      this.drawFighter(this.p1);
      this.drawBalls();
      this.drawShadows();
      for (const r of this.rings) {
        const t = 1 - r.life / r.max;
        ctx.save(); ctx.globalAlpha = 1 - t; ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath(); ctx.ellipse(r.x - this.camera, r.y, r.r * t + 4, (r.r * t + 4) * 0.45, 0, 0, 6.283); ctx.stroke(); ctx.restore();
      }
      this.drawParticles();
      ctx.restore();

      // energy bars (special / fireball meter)
      for (const [f, x0] of [[this.p1, 8], [this.p2, 532]]) {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x0, 40, 100, 5);
        ctx.fillStyle = f.energy >= 40 ? '#ffd24a' : (f.energy >= 25 ? '#ff9a3d' : '#7a7a7a');
        ctx.fillRect(x0, 40, f.energy, 5);
      }

      // combo counter (Mortal Kombat style)
      if (this.p1.combo >= 2) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.direction = 'ltr';
        ctx.font = 'bold 22px Tahoma, Arial';
        ctx.fillStyle = '#f2c230';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
        const cx = this.p1.x - this.camera;
        ctx.strokeText(this.p1.combo + ' HITS!', cx, 96);
        ctx.fillText(this.p1.combo + ' HITS!', cx, 96);
        ctx.restore();
      }
      if (this.p2.combo >= 2) {
        ctx.save();
        ctx.textAlign = 'center'; ctx.direction = 'ltr';
        ctx.font = 'bold 22px Tahoma, Arial';
        ctx.fillStyle = '#ff6b6b';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
        const cx = this.p2.x - this.camera;
        ctx.strokeText(this.p2.combo + ' HITS!', cx, 96);
        ctx.fillText(this.p2.combo + ' HITS!', cx, 96);
        ctx.restore();
      }
    },

    drawFighter(f) {
      if (!f.pose) return;
      const sx = f.x - this.camera;
      ctx.save();
      if (f.hitFlash > 0) {
        ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      }
      const t = f.anim;
      let sxs = 1, sys = 1, rot = 0, dy = 0;
      if (f.land > 0) { sxs = 1 + 0.22 * f.land; sys = 1 - 0.2 * f.land; }
      else if (f.y < GROUND) { const k = Math.min(0.14, Math.abs(f.vy) * 0.012); sxs = 1 - k * 0.6; sys = 1 + k; rot = Math.max(-0.12, Math.min(0.12, f.vx * 0.02 * f.facing)); }
      else if (f.state === 'idle') { sys = 1 + Math.sin(t * 0.16) * 0.018; sxs = 1 - Math.sin(t * 0.16) * 0.008; }
      else if (f.state === 'walk' || f.state === 'run') { dy = -Math.abs(Math.sin(t * 0.5)) * 2.4; rot = (f.state === 'run' || Math.abs(f.vx) > 4.5) ? 0.12 : 0.04; }
      if (f.state === 'punch') { rot = 0.10 * Math.sin(Math.min(1, t / 14) * Math.PI); sxs *= 1 + 0.06 * Math.sin(Math.min(1, t / 12) * Math.PI); }
      else if (f.state === 'kick') { rot = -0.10 * Math.sin(Math.min(1, t / 20) * Math.PI); }
      else if (f.state === 'cast') { rot = -0.06; }
      if (f.rage || f.state === 'special') {
        const gx = sx, gy = f.y - 42, fl = Math.sin(performance.now() * 0.03) * 4;
        const g = ctx.createRadialGradient(gx, gy, 6, gx, gy, 62 + fl);
        const c = f.rage ? '255,60,40' : '255,210,80';
        g.addColorStop(0, 'rgba(' + c + ',.5)'); g.addColorStop(1, 'rgba(' + c + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(gx, gy, 46 + fl, 66 + fl, 0, 0, 6.283); ctx.fill();
        if (f.rage && Math.random() < 0.4) game.particles.push({ x: f.x + (Math.random() - .5) * 30, y: f.y - 10, vx: 0, vy: -2.4, life: 0.5, max: 0.5, color: '#ff6b3d', size: 3 });
      }
      ctx.translate(sx, f.y + dy);
      ctx.rotate(rot * f.facing + f.fatal * f.facing);
      ctx.scale(sxs * f.scale, sys * f.scale);
      if (f.inv > 0) ctx.globalAlpha = 0.5;
      if (f.facing < 0) ctx.scale(-1, 1);
      if (f.state === 'hurt' && f.timer > 0) ctx.rotate(-0.12 * (f.facing < 0 ? -1 : 1) * (1 - f.timer / 30));
      if (f.state === 'down') ctx.rotate(-Math.PI / 2 * 0.92);
      if (f.state === 'sp' && f.ch.key === 'det' && f.anim < 8) ctx.globalAlpha *= Math.max(0.05, 1 - f.anim / 7);
      if (f.state === 'sp' && f.ch.key === 'bot' && f.anim < 18) {
        const gl = ctx.createRadialGradient(40, -62, 2, 40, -62, 34); gl.addColorStop(0, 'rgba(120,230,255,.9)'); gl.addColorStop(1, 'rgba(70,217,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(40, -62, 14 + f.anim, 0, 6.283); ctx.fill();
      }
      const px = pixelRender(f.ch, f.pose, f.state, { boss: !!(f.cfg && f.cfg.boss), flat: f.hitFlash > 0.14 ? '#ffffff' : null });
      const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      ctx.drawImage(px, -45 / PXS, -72 / PXS, PXN / PXS, PXN / PXS);
      ctx.imageSmoothingEnabled = sm;
      ctx.restore();

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sx, f.y + 2, 26, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  function floatMiss(x, y) { game.sparks({ x, y }, '#ffffff', 6); }

  // characters are rendered at low resolution, alpha/colour quantised, then scaled up -> real pixel-art look
  const PXS = 0.4, PXN = 90;
  const PXC = document.createElement('canvas'); PXC.width = PXN; PXC.height = PXN;
  const pg = PXC.getContext('2d', { willReadFrequently: true });
  function pixelRender(ch, pose, state, opts) {
    pg.setTransform(1, 0, 0, 1, 0, 0); pg.clearRect(0, 0, PXN, PXN);
    pg.translate(45, 72); pg.scale(PXS, PXS);
    drawPuppet(pg, ch, pose, state, opts);
    const im = pg.getImageData(0, 0, PXN, PXN), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
      d[i + 3] = 255; d[i] = Math.round(d[i] / 43) * 43; d[i + 1] = Math.round(d[i + 1] / 43) * 43; d[i + 2] = Math.round(d[i + 2] / 43) * 43;
    }
    pg.putImageData(im, 0, 0);
    return PXC;
  }

  // ---------- HUD ----------
  function updateHud() {
    const p1 = game.p1, p2 = game.p2;
    document.querySelector('#p1 .fill').style.width = (p1.hp / p1.maxHp * 100) + '%';
    document.querySelector('#p2 .fill').style.width = (p2.hp / p2.maxHp * 100) + '%';
    document.querySelector('#p1 .lag').style.width = (p1.hp / p1.maxHp * 100) + '%';
    document.querySelector('#p2 .lag').style.width = (p2.hp / p2.maxHp * 100) + '%';
    document.getElementById('timer').textContent = Math.ceil(game.timer);
    const rd = document.getElementById('rounds');
    if (rd.childElementCount !== 3) {
      rd.innerHTML = '';
      for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'rdot'; rd.appendChild(d); }
    }
    [...rd.children].forEach((d, i) => {
      d.className = 'rdot' + ((i < game.p1wins) ? ' on' : '');
    });
  }

  // ---------- screens ----------
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    if (id) document.getElementById(id).classList.add('show');
  }
  function hideScreens() { document.querySelectorAll('.screen').forEach(s => s.classList.remove('show')); }

  // stage select list
  function buildStageList() {
    const el = document.getElementById('stageList');
    el.innerHTML = '';
    STAGES.forEach((s, i) => {
      const c = document.createElement('div');
      c.className = 'stage-card' + (i === game.stageIndex ? ' sel' : '');
      const im = document.createElement('img');
      im.src = s.img.src;
      const nm = document.createElement('div');
      nm.className = 'sname'; nm.textContent = s.name;
      c.appendChild(im); c.appendChild(nm);
      c.onclick = () => {
        game.stageIndex = i;
        [...el.children].forEach(x => x.classList.remove('sel'));
        c.classList.add('sel');
      };
      el.appendChild(c);
    });
  }

  function buildCharList() {
    const el = document.getElementById('charList');
    el.innerHTML = '';
    CHARS.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'stage-card char-card' + (i === game.charIndex ? ' sel' : '');
      const cv = document.createElement('canvas'); cv.width = PXN; cv.height = PXN;
      const fake = { state: 'idle', anim: 0, vx: 0, vy: 0, y: 300, chain: 0, ch: c };
      cv.getContext('2d').drawImage(pixelRender(c, puppetTarget_(fake), 'idle', {}), 0, 0);
      const nm = document.createElement('div'); nm.className = 'sname'; nm.textContent = c.name + ' — ' + c.note;
      card.appendChild(cv); card.appendChild(nm);
      card.onclick = () => { game.charIndex = i; [...el.children].forEach(x => x.classList.remove('sel')); card.classList.add('sel'); };
      el.appendChild(card);
    });
  }
  function puppetTarget_(f) { puppetStep(f, 0.016); return f.pose; }

  // ---------- boot ----------
  document.getElementById('btnStart').onclick = () => { buildCharList(); buildStageList(); showScreen('scrStage'); };
  document.getElementById('btnHelp').onclick = () => showScreen('scrHelp');
  document.getElementById('btnHelpBack').onclick = () => showScreen('scrTitle');
  document.getElementById('btnStageBack').onclick = () => showScreen('scrTitle');
  document.getElementById('btnFight').onclick = () => { audio.crowd(); game.startFight(); };
  document.getElementById('btnResume').onclick = () => game.pause();
  document.getElementById('btnQuit').onclick = () => { game.state = 'title'; showScreen('scrTitle'); };

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.draw();
    for (const k in pressed) pressed[k] = false;
    requestAnimationFrame(loop);
  }

  loadAll().then(() => {
    document.getElementById('loading').style.display = 'none';
    game.init();
    requestAnimationFrame(loop);
  }).catch(e => {
    document.getElementById('loading').textContent = 'مشكلة في تحميل الصور: ' + e.message;
  });
})();
