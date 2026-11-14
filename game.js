/* ============================================================
   شوشع فايتر — Mortal Kombat جزائري
   شخصية وحدة: حسين شوشع (لاعب كرة قدم جزائري)
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

  const SPRITE_NAMES = ['idle1','idle2','walk1','run1','punch','kick','hurt','down','jump','block','special','win'];
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
    ArrowDown:'down', KeyS:'down',
    KeyJ:'punch', KeyZ:'punch',
    KeyK:'kick', KeyX:'kick',
    KeyL:'special', KeyC:'special',
    Space:'block',
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
    }

    get w() { return 32 * this.scale; }
    get h() { return 68 * this.scale; }
    get cx() { return this.x; }
    get cy() { return this.y - this.h / 2; }

    sprite() {
      switch (this.state) {
        case 'walk':  return SPR.walk1;
        case 'run':   return SPR.run1;
        case 'jump':  return SPR.jump;
        case 'punch': return SPR.punch;
        case 'kick':  return SPR.kick;
        case 'special': return SPR.special;
        case 'hurt':  return SPR.hurt;
        case 'down':  return SPR.down;
        case 'block': return SPR.block;
        case 'win':   return SPR.win;
        default: return (Math.floor(this.anim / 14) % 2 === 0) ? SPR.idle1 : SPR.idle2;
      }
    }

    setState(s, dur) {
      this.state = s; this.timer = dur; this.anim = 0; this.hitDone = false;
    }

    update(dt) {
      this.anim += dt;
      if (this.timer > 0) {
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.state === 'hurt') this.setState('idle', 0);
          else if (this.state === 'down') { /* stay down */ }
          else if (this.state !== 'win') this.setState('idle', 0);
        }
      }
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }

      // gravity
      this.vy += GRAV;
      this.y += this.vy;
      if (this.y >= GROUND) {
        this.y = GROUND; this.vy = 0;
        if (this.state === 'jump') this.setState('idle', 0);
      }
      // horizontal
      this.x += this.vx;
      this.vx *= (down('left') || down('right')) ? 1 : FLOOR_FRICTION;
      this.x = Math.max(40, Math.min(STAGE_W - 40, this.x));

      if (this.hitFlash > 0) this.hitFlash -= dt;
      this.energy = Math.min(100, this.energy + dt * 0.55);
    }

    hurtBox() {
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }

    attackBox() {
      const f = this.facing;
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
    particles: [],
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

    updateParticles(dt) {
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
      this.koSlowmo = 0;
      this.bannerTimer = 0;
      const el = document.getElementById('announceTxt');
      if (el) el.className = 'txt';
      if (fullRestart) { this.p1wins = 0; this.p2wins = 0; this.round = 1; this.matchSeconds = 0; }
      updateHud();
    },

    startFight() {
      this.round = 1; this.p1wins = 0; this.p2wins = 0; this.matchSeconds = 0;
      this.resetRound(false);
      this.state = 'fight';
      hideScreens();
      this.banner('جولة ' + this.round, '', 1.1);
      audio.round();
    },

    pause() {
      if (this.state === 'fight') { this.state = 'pause'; showScreen('scrPause'); }
      else if (this.state === 'pause') { this.state = 'fight'; hideScreens(); }
    },

    banner(txt, cls = '', dur = 1.0) {
      const el = document.getElementById('announceTxt');
      el.textContent = txt;
      el.className = 'txt show ' + cls;
      this.bannerTimer = dur;
    },

    endRound(winnerIsP1, reason) {
      if (this.roundEnded) return;
      this.roundEnded = true;
      if (winnerIsP1) { this.p1wins++; this.p1.win = true; this.p2.setState('down', 99); }
      else { this.p2wins++; this.p2.win = true; this.p1.setState('down', 99); }
      audio.ko();
      this.koSlowmo = 1.1;
      this.shake = 14;
      const msg = reason === 'time' ? 'الوقت خلص!' : 'K.O.';
      this.banner(msg, 'red', 1.6);
      setTimeout(() => {
        if (this.p1wins >= ROUNDS_TO_WIN || this.p2wins >= ROUNDS_TO_WIN) this.matchOver();
        else {
          this.round++;
          this.banner('جولة ' + this.round, '', 1.0);
          setTimeout(() => this.resetRound(false), 900);
          audio.round();
        }
      }, 2200);
    },

    matchOver() {
      this.state = 'over';
      const p1Won = this.p1wins >= ROUNDS_TO_WIN;
      this.p1.win = p1Won;
      this.banner(p1Won ? 'شوشع يربح!' : 'خسرنا يا حبيبي', p1Won ? 'win' : 'red', 3);
      audio.crowd();
    },

    update(dt) {
      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) document.getElementById('announceTxt').className = 'txt';
      }
      if (this.shake > 0) this.shake *= 0.88;
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
      if (hit('special') && f.energy >= 40) {
        f.energy = 0; f.setState('special', 34); f.vy = -5.4; f.vx = f.facing * 3.4;
        audio.special(); this.shake = 8; return;
      }
      if (hit('up') && f.y === GROUND) {
        f.setState('jump', 0); f.vy = -9.4; f.vx = f.facing * 2.2;
        return;
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
      if (f.state === 'punch' || f.state === 'kick' || f.state === 'special') {
        if (f.timer > 8) f.vx += f.facing * 0.16;
        else f.vx *= 0.72;
        return;
      }

      this.aiTimer -= dt;
      const dist = Math.abs(opp.x - f.x);
      const diff = 0.35 + Math.min(0.5, this.round * 0.12);

      if (this.aiTimer <= 0) {
        this.aiTimer = 0.35 + Math.random() * 0.6;
        const r = Math.random();
        if (dist > 120) this.aiPlan = r < 0.72 ? 'approach' : 'wait';
        else if (dist > 58) this.aiPlan = r < 0.45 ? 'approach' : (r < 0.7 ? 'wait' : 'jump');
        else this.aiPlan = r < 0.34 ? 'punch' : (r < 0.62 ? 'kick' : (r < 0.72 ? 'block' : (r < 0.85 ? 'special' : 'stepback')));
      }

      // reactive blocking when opponent attacks
      const oppAttacking = opp.state === 'punch' || opp.state === 'kick' || opp.state === 'special';
      if (oppAttacking && dist < 70 && Math.random() < diff) {
        f.setState('block', 0); f.blocking = true; return;
      }
      f.blocking = false;

      switch (this.aiPlan) {
        case 'approach':
          f.vx = f.facing * 2.5;
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
          break;
        case 'punch':
          f.setState('punch', 16); audio.whoosh(); break;
        case 'kick':
          f.setState('kick', 22); audio.whoosh(); break;
        case 'block':
          f.setState('block', 0); f.blocking = true; break;
        case 'special':
          if (f.energy >= 40) { f.energy = 0; f.setState('special', 34); f.vy = -5.4; f.vx = f.facing * 3.4; audio.special(); }
          else f.setState('idle', 0);
          break;
      }
    },

    resolve(att, def, dt) {
      if (!att.attackBox()) return;
      if (att.hitDone) return;
      const ab = att.attackBox();
      const db = def.hurtBox();
      if (ab.x < db.x + db.w && ab.x + ab.w > db.x && ab.y < db.y + db.h && ab.y + ab.h > db.y) {
        att.hitDone = true;
        const isSpecial = att.state === 'special';
        const dmg = isSpecial ? 15 : (att.state === 'kick' ? 10 : 6);
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

        // --- knockback: the defender is pushed AWAY and briefly lifted ---
        const kb = isSpecial ? 8.5 : (att.state === 'kick' ? 6.4 : 4.6);
        def.vx = att.facing * kb;
        def.vy = isSpecial ? -6.0 : -2.6;

        // --- hitstop: both freeze for a moment (impact feel) ---
        this.hitStop = isSpecial ? 0.16 : 0.10;
        att.setState(att.state, Math.max(att.timer, isSpecial ? 26 : 18));
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

      // fighters
      this.drawFighter(this.p2);
      this.drawFighter(this.p1);
      this.drawParticles();
      ctx.restore();

      // combo counter (Mortal Kombat style)
      if (this.p1.combo >= 2) {
        ctx.save();
        ctx.textAlign = 'center';
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
        ctx.textAlign = 'center';
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
      const img = f.sprite();
      if (!img) return;
      const sx = f.x - this.camera;
      // uniform world scale: sprites baked at ~240px tall
      const sc = 1 / 2.15;
      const dw = img.width * sc, dh = img.height * sc;
      ctx.save();
      if (f.hitFlash > 0) {
        ctx.globalAlpha = 0.55 + Math.random() * 0.45;
      }
      ctx.translate(sx, f.y);
      if (f.facing < 0) ctx.scale(-1, 1);
      if (f.state === 'hurt' && f.timer > 0) ctx.rotate(-0.12 * (f.facing < 0 ? -1 : 1) * (1 - f.timer / 30));
      if (f.state === 'down') ctx.rotate(-Math.PI / 2 * 0.92);
      ctx.drawImage(img, -dw / 2, -dh, dw, dh);
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

  // ---------- boot ----------
  document.getElementById('btnStart').onclick = () => { buildStageList(); showScreen('scrStage'); };
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
