/*
 * HackOS Pet — webview sprite engine.
 *
 * Self-contained (no external assets, CSP-safe). Runs a 60fps canvas pixel-art
 * companion that lives along the bottom of this panel and doubles as the
 * organizer's messenger. Architecture mirrors vscode-pets:
 *
 *   - a finite state machine (idle activities / reaction / announcement)
 *   - a modular, data-driven animation + activity registry
 *   - a weighted idle scheduler with cooldowns and no-consecutive-repeat
 *   - a priority notification queue driven by messages from the extension host
 *   - an interaction manager (click / double-click / drag / hover / context menu)
 *
 * The extension host posts messages in; we post acknowledgements / menu actions
 * back out. The host owns persistence (history, settings); this file owns motion.
 */
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const bubbleEl = document.getElementById("bubble");
  const menuEl = document.getElementById("menu");
  const tipEl = document.getElementById("tip");

  // ---------------------------------------------------------------- constants
  const GROUND_PAD = 6; // px above the panel bottom where feet rest
  const PET_UNIT = 3; // pixel scale of the sprite grid
  const SPEED = { walk: 26, run: 78, moonwalk: 20, slide: 120 }; // px / second
  const RANK = { normal: 1, important: 2, critical: 3, winner: 3 };
  const HOLD_MS = { normal: 9000, important: 14000, winner: 13000, critical: 45000 };

  // palettes per pet type — kept tiny; add a key to add a pet
  const PETS = {
    fox: { body: "#e8763a", belly: "#f6dcc4", dark: "#3a2620", ear: "#c85a28", nose: "#2a1c17", eye: "#1a1220" },
    cat: { body: "#8a8f98", belly: "#e7ebf2", dark: "#2c2f36", ear: "#6f747d", nose: "#c06a86", eye: "#12151b" },
    duck: { body: "#f2c14e", belly: "#fff3d6", dark: "#3a2c10", ear: "#e0a834", nose: "#e8863a", eye: "#12151b" },
    slime: { body: "#7c6cff", belly: "#b9aeff", dark: "#2a2350", ear: "#6a58e0", nose: "#241d47", eye: "#ffffff" },
  };

  // -------------------------------------------------------------- engine state
  const state = {
    w: 0,
    h: 0,
    dpr: 1,
    petType: "fox",
    reducedMotion: false,
    muted: false,
    paused: false,
    // pet transform
    x: 60,
    facing: 1, // 1 = right, -1 = left
    baseY: 0, // ground line
    bob: 0,
    // fsm
    mode: "idle", // idle | react | announce
    clip: null, // active activity/reaction/announcement clip
    lastActivityId: null,
    cooldowns: new Map(),
    queue: [], // pending notifications (priority queue)
    reactions: [], // pending reaction ids
    restX: null, // user's preferred resting x (from drag)
    // interaction
    dragging: false,
    hovering: false,
    lastClick: 0,
    // fx
    confetti: [],
    props: [], // transient world props (butterfly, fish, flower...)
    t: 0,
  };

  // -------------------------------------------------------------- sizing / DPR
  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.w = Math.max(120, rect.width);
    state.h = Math.max(48, rect.height);
    canvas.width = Math.floor(state.w * state.dpr);
    canvas.height = Math.floor(state.h * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    state.baseY = state.h - GROUND_PAD;
    if (state.restX == null) state.restX = state.w * 0.5;
    state.x = clamp(state.x, 14, state.w - 14);
  }
  new ResizeObserver(resize).observe(canvas);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // ============================================================ ACTIVITY REGISTRY
  // Data-driven so new activities are one object. `loco` drives movement, `emote`
  // is an emoji prop drawn by the pet, `pose` tweaks the sprite, `world` spawns a
  // scene prop. This is the modular animation system referenced in the spec.
  const ACTIVITIES = [
    { id: "walk", label: "exploring", weight: 12, cd: 4000, dur: 4200, loco: "walk" },
    { id: "run", label: "sprinting", weight: 6, cd: 8000, dur: 2200, loco: "run" },
    { id: "jump", label: "hopping a separator", weight: 6, cd: 7000, dur: 1500, loco: "jump" },
    { id: "sit", label: "sitting", weight: 8, cd: 6000, dur: 3800, loco: "sit" },
    { id: "sleep", label: "napping", weight: 5, cd: 15000, dur: 6500, loco: "sleep", emote: "💤" },
    { id: "stretch", label: "stretching", weight: 5, cd: 12000, dur: 2600, loco: "sit", pose: "stretch" },
    { id: "coffee", label: "drinking coffee", weight: 6, cd: 10000, dur: 3400, loco: "sit", emote: "☕" },
    { id: "cookie", label: "eating a cookie", weight: 5, cd: 11000, dur: 3000, loco: "sit", emote: "🍪" },
    { id: "read", label: "reading the docs", weight: 6, cd: 9000, dur: 4200, loco: "sit", emote: "📖" },
    { id: "code", label: "pretending to code", weight: 7, cd: 8000, dur: 4600, loco: "sit", emote: "💻" },
    { id: "dance", label: "dancing", weight: 6, cd: 9000, dur: 3200, loco: "dance", emote: "🎵" },
    { id: "wave", label: "waving", weight: 6, cd: 7000, dur: 1800, loco: "wave" },
    { id: "moonwalk", label: "moonwalking", weight: 4, cd: 16000, dur: 3000, loco: "moonwalk", emote: "✨" },
    { id: "trip", label: "tripping & recovering", weight: 3, cd: 20000, dur: 2200, loco: "trip" },
    { id: "slide", label: "sliding", weight: 4, cd: 15000, dur: 1400, loco: "slide" },
    { id: "butterfly", label: "chasing a butterfly", weight: 4, cd: 14000, dur: 4000, loco: "run", world: "butterfly" },
    { id: "fish", label: "fishing", weight: 4, cd: 18000, dur: 4600, loco: "sit", emote: "🎣", world: "fish" },
    { id: "campfire", label: "warming by a campfire", weight: 3, cd: 22000, dur: 4600, loco: "sit", world: "campfire" },
    { id: "plant", label: "planting flowers", weight: 4, cd: 16000, dur: 3400, loco: "sit", world: "flower" },
    { id: "water", label: "watering flowers", weight: 3, cd: 17000, dur: 3200, loco: "sit", emote: "💧", world: "flower" },
    { id: "backpack", label: "carrying a backpack", weight: 4, cd: 15000, dur: 3600, loco: "walk", emote: "🎒" },
    { id: "balloon", label: "inflating a balloon", weight: 3, cd: 19000, dur: 3400, loco: "sit", emote: "🎈" },
    { id: "plane", label: "flying a paper plane", weight: 3, cd: 20000, dur: 3800, loco: "walk", world: "plane" },
    { id: "treasure", label: "pulling a treasure chest", weight: 3, cd: 21000, dur: 3600, loco: "walk", emote: "🧰" },
    { id: "duck", label: "playing with a rubber duck", weight: 4, cd: 15000, dur: 3400, loco: "sit", emote: "🦆" },
    { id: "binoculars", label: "looking through binoculars", weight: 3, cd: 17000, dur: 3200, loco: "sit", emote: "🔭" },
    { id: "inspectGit", label: "inspecting git", weight: 4, cd: 13000, dur: 3200, loco: "sit", emote: "🔍" },
    { id: "companion", label: "with a tiny companion", weight: 3, cd: 24000, dur: 4200, loco: "walk", world: "companion" },
    { id: "peek", label: "peeking around", weight: 5, cd: 11000, dur: 2600, loco: "peek" },
  ];

  const REACTIONS = {
    typingFast: { label: "You're on fire!", dur: 2200, loco: "dance", emote: "🔥", say: "You're on fire!" },
    buildOk: { label: "Build passed!", dur: 3200, loco: "dance", emote: "🎉", say: "Build passed! 🎉", confetti: true },
    buildFail: { label: "Build failed", dur: 2600, loco: "faint", emote: "😢", say: "Build failed…" },
    testOk: { label: "Tests green", dur: 2200, loco: "wave", emote: "✅", say: "All tests green!" },
    testFail: { label: "Test red", dur: 2400, loco: "faint", emote: "❌", say: "A test is red." },
    commit: { label: "Nice commit!", dur: 2400, loco: "clap", emote: "👏", say: "Nice commit! 👍" },
    debugStart: { label: "Debugging", dur: 2400, loco: "sit", emote: "🧐", say: "Hunting bugs…" },
    debugEnd: { label: "Fixed it", dur: 2200, loco: "wave", emote: "😄", say: "Squashed it! 🎉" },
    inactive: { label: "asleep", dur: 6000, loco: "sleep", emote: "💤", say: "zzz…" },
    active: { label: "back to work", dur: 2000, loco: "wave", emote: "😀", say: "Welcome back!" },
  };

  // ============================================================ NOTIFICATIONS
  function notify(note) {
    state.queue.push(note);
    state.queue.sort((a, b) => RANK[b.priority] - RANK[a.priority]);
  }

  function priorityStyle(p) {
    switch (p) {
      case "critical":
        return { badge: "Critical", cls: "crit", icon: "🚨", speed: "run", emote: "🚨" };
      case "important":
        return { badge: "Important", cls: "imp", icon: "⚡", speed: "run", emote: "😮" };
      case "winner":
        return { badge: "Results", cls: "win", icon: "🎉", speed: "run", emote: "🎉" };
      default:
        return { badge: "Announcement", cls: "norm", icon: "📢", speed: "walk", emote: "😊" };
    }
  }

  const CAT_ICON = {
    deadline: "⏰", schedule: "📅", food: "🍕", workshop: "📚", prize: "🏆",
    tech: "🔌", venue: "📍", rules: "📋", emergency: "🚨", winner: "🎉",
  };
  const catIcon = (c) => CAT_ICON[c] || "📢";

  // ============================================================ FSM CORE
  function startActivity(spec, tag) {
    state.lastActivityId = spec.id;
    state.cooldowns.set(spec.id, state.t + spec.cd / 1000);
    state.mode = tag === "react" ? "react" : "idle";
    state.clip = {
      kind: "activity",
      spec,
      loco: spec.loco,
      emote: spec.emote || null,
      pose: spec.pose || null,
      say: spec.say || null,
      until: state.t + spec.dur / 1000,
      target: pickTarget(spec.loco),
      startX: state.x,
    };
    if (spec.world) spawnWorldProp(spec.world);
    if (spec.confetti) burstConfetti();
    if (spec.say) showSay(spec.say);
  }

  function pickTarget(loco) {
    if (loco === "walk" || loco === "run" || loco === "slide" || loco === "moonwalk") {
      const margin = 20;
      return rand(margin, state.w - margin);
    }
    return state.x;
  }

  function chooseIdle() {
    const nowT = state.t;
    const pool = ACTIVITIES.filter(
      (a) => a.id !== state.lastActivityId && (state.cooldowns.get(a.id) || 0) <= nowT,
    );
    const cands = pool.length ? pool : ACTIVITIES.filter((a) => a.id !== state.lastActivityId);
    const total = cands.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * total;
    let spec = cands[cands.length - 1];
    for (const a of cands) {
      r -= a.weight;
      if (r <= 0) { spec = a; break; }
    }
    startActivity(spec);
  }

  function chooseNext() {
    if (state.queue.length) return startAnnounce(state.queue.shift());
    if (state.reactions.length) {
      const key = state.reactions.shift();
      const r = REACTIONS[key];
      if (r) {
        startActivity({ id: "react:" + key, label: r.label, cd: 0, dur: r.dur, loco: r.loco, emote: r.emote, say: r.say, confetti: r.confetti }, "react");
        return;
      }
    }
    chooseIdle();
  }

  function maybePreempt() {
    if (!state.queue.length || !state.clip) return;
    const top = state.queue[0];
    const curRank = state.clip.kind === "announce" ? RANK[state.clip.note.priority] : 0;
    if (state.clip.kind !== "announce" || RANK[top.priority] > curRank) {
      if (state.clip.kind === "announce") {
        state.queue.push(state.clip.note);
        state.queue.sort((a, b) => RANK[b.priority] - RANK[a.priority]);
      }
      hideBubble();
      setCritical(false);
      state.clip = null;
    }
  }

  // ------------------------------------------------------------- announcements
  function startAnnounce(note) {
    state.mode = "announce";
    const ps = priorityStyle(note.priority);
    state.clip = {
      kind: "announce",
      note,
      ps,
      phase: "run", // run -> wave -> hold -> bye
      target: state.w * 0.5,
      phaseUntil: 0,
      acked: false,
    };
    logHistory(note);
  }

  function tickAnnounce(dt) {
    const c = state.clip;
    const ps = c.ps;
    if (c.phase === "run") {
      // face + run to center
      moveToward(c.target, SPEED[ps.speed], dt);
      c.emote = ps.emote;
      if (Math.abs(state.x - c.target) < 3) {
        c.phase = "wave";
        c.phaseUntil = state.t + 0.9;
      }
      return;
    }
    if (c.phase === "wave") {
      c.wave = true;
      if (state.t >= c.phaseUntil) {
        c.phase = "hold";
        c.holdStart = performance.now();
        showBubble(c.note, ps);
        if (c.note.priority === "critical") setCritical(true);
        if (c.note.priority === "winner") burstConfetti();
      }
      return;
    }
    if (c.phase === "hold") {
      c.wave = false;
      updateCountdown(c.note);
      const held = performance.now() - c.holdStart;
      if (c.acked || held > HOLD_MS[c.note.priority]) {
        hideBubble();
        setCritical(false);
        c.phase = "bye";
        c.phaseUntil = state.t + 0.8;
        c.emote = "👋";
      }
      return;
    }
    // bye
    c.wave = true;
    if (state.t >= c.phaseUntil) { state.clip = null; state.mode = "idle"; }
  }

  function moveToward(tx, speed, dt) {
    const dir = Math.sign(tx - state.x) || 1;
    state.facing = dir;
    state.x = clamp(state.x + dir * speed * dt, 12, state.w - 12);
  }

  // ============================================================ UPDATE LOOP
  function update(dt) {
    state.t += dt;
    if (state.paused) return;

    maybePreempt();
    if (!state.clip) chooseNext();
    if (!state.clip) return;

    if (state.clip.kind === "announce") { tickAnnounce(dt); }
    else { tickActivity(dt); }

    updateWorldProps(dt);
    updateConfetti(dt);
  }

  function tickActivity(dt) {
    const c = state.clip;
    const loco = c.loco;
    if (state.dragging) return; // user is holding the pet
    if (loco === "walk" || loco === "run" || loco === "backpack") {
      const sp = loco === "run" ? SPEED.run : SPEED.walk;
      moveToward(c.target, sp, dt);
      if (Math.abs(state.x - c.target) < 3) c.target = pickTarget("walk");
    } else if (loco === "moonwalk") {
      const dir = -state.facing;
      state.facing = -dir; // face opposite to travel
      state.x = clamp(state.x + dir * SPEED.moonwalk * dt, 12, state.w - 12);
    } else if (loco === "slide") {
      moveToward(c.target, SPEED.slide, dt);
    }
    if (state.t >= c.until) {
      // gently drift back toward the preferred rest spot between activities
      state.clip = null;
      state.mode = "idle";
    }
  }

  // ============================================================ RENDER
  function render() {
    ctx.clearRect(0, 0, state.w, state.h);
    drawGround();
    drawWorldProps();
    drawPet();
    drawConfetti();
  }

  function drawGround() {
    // a faint baseline so the pet reads as standing on the bottom edge
    ctx.strokeStyle = "rgba(127,127,160,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, state.baseY + 4.5);
    ctx.lineTo(state.w, state.baseY + 4.5);
    ctx.stroke();
  }

  // pixel helper: fill a grid cell relative to the pet origin
  function px(gx, gy, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(gx, gy, w, h);
  }

  function drawPet() {
    const c = state.clip;
    const loco = c ? c.loco : "sit";
    const p = PETS[state.petType] || PETS.fox;
    const s = PET_UNIT;
    const walkPhase = state.t * (loco === "run" ? 15 : 8);
    const legSwing = (loco === "walk" || loco === "run" || loco === "backpack" || loco === "slide")
      ? Math.sin(walkPhase) : 0;

    // vertical bob + special poses
    let yOff = 0, rot = 0, squash = 0;
    if (loco === "jump") {
      const k = c ? (1 - (c.until - state.t) / (c.spec.dur / 1000)) : 0;
      yOff = -Math.sin(clamp(k, 0, 1) * Math.PI) * 22;
    } else if (loco === "dance") {
      yOff = -Math.abs(Math.sin(state.t * 9)) * 6;
      rot = Math.sin(state.t * 9) * 0.12;
    } else if (loco === "faint") {
      rot = clamp((state.t - (c ? c.until - c.spec.dur / 1000 : 0)) * 2, 0, 1.35);
      yOff = rot * 6;
    } else if (loco === "trip") {
      const k = c ? (state.t - (c.until - c.spec.dur / 1000)) : 0;
      rot = Math.sin(clamp(k * 3, 0, Math.PI)) * 0.5;
    } else if (loco === "walk" || loco === "run") {
      yOff = -Math.abs(Math.sin(walkPhase)) * (loco === "run" ? 2.4 : 1.4);
    } else if (loco === "sleep") {
      rot = 0.02 * Math.sin(state.t * 2);
    }
    const waving = (c && (c.wave || loco === "wave" || loco === "clap"));

    const originX = state.x;
    const originY = state.baseY + yOff;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.rotate(rot);
    ctx.scale(state.facing, 1);

    // ---- pixel-art body (grid units, feet at y=0 going up negative) ----
    // legs
    const legY = -3 * s;
    const fSwing = legSwing * 2;
    px(-4 * s, legY + fSwing, s, 3 * s, p.dark);
    px(2 * s, legY - fSwing, s, 3 * s, p.dark);
    px(-2 * s, legY - fSwing * 0.6, s, 3 * s, p.dark);
    px(0 * s, legY + fSwing * 0.6, s, 3 * s, p.dark);

    // body
    px(-5 * s, -10 * s, 9 * s, 7 * s, p.body);
    px(-4 * s, -6 * s, 7 * s, 3 * s, p.belly); // belly
    // tail (animated)
    const tail = Math.sin(state.t * 6) * s;
    px(4 * s, -9 * s + tail, 3 * s, 2 * s, p.body);
    px(6 * s, -10 * s + tail, 2 * s, 2 * s, p.dark);

    // head
    const headX = -6 * s, headY = -16 * s;
    px(headX, headY, 7 * s, 7 * s, p.body);
    px(headX + 1 * s, headY + 4 * s, 5 * s, 2 * s, p.belly); // snout area
    // ears
    px(headX, headY - 2 * s, 2 * s, 2 * s, p.ear);
    px(headX + 5 * s, headY - 2 * s, 2 * s, 2 * s, p.ear);
    // eyes (blink)
    const blink = (Math.floor(state.t * 1.3) % 7 === 0) ? 1 : 0;
    const sleeping = loco === "sleep";
    if (sleeping || blink) {
      px(headX + 1.5 * s, headY + 3 * s, 1.4 * s, s * 0.6, p.eye);
      px(headX + 4 * s, headY + 3 * s, 1.4 * s, s * 0.6, p.eye);
    } else {
      px(headX + 1.5 * s, headY + 2.2 * s, 1.4 * s, 1.6 * s, p.eye);
      px(headX + 4 * s, headY + 2.2 * s, 1.4 * s, 1.6 * s, p.eye);
    }
    // nose
    px(headX + 2.7 * s, headY + 5 * s, 1.6 * s, 1.2 * s, p.nose);

    // waving arm
    if (waving) {
      const a = Math.sin(state.t * 16) * 0.5;
      ctx.save();
      ctx.translate(-5 * s, -12 * s);
      ctx.rotate(-0.7 + a);
      px(-1 * s, -3 * s, 1.6 * s, 4 * s, p.body);
      ctx.restore();
    }

    ctx.restore();

    // emote / prop bubble above the pet (drawn upright, not mirrored)
    const emote = c ? c.emote : null;
    if (emote) drawEmote(originX, originY - 20 * s, emote);
  }

  function drawEmote(x, y, emoji) {
    ctx.save();
    ctx.font = "16px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const float = Math.sin(state.t * 3) * 2;
    ctx.fillText(emoji, x, y + float);
    ctx.restore();
  }

  // ---------------------------------------------------------- world props / fx
  function spawnWorldProp(kind) {
    if (state.reducedMotion) return;
    if (kind === "butterfly") state.props.push({ kind, x: state.x + 40, y: state.baseY - 40, life: 4, ph: Math.random() * 6 });
    if (kind === "fish") state.props.push({ kind, x: state.x + 18, y: state.baseY + 2, life: 4.6, ph: 0 });
    if (kind === "campfire") state.props.push({ kind, x: state.x + 26, y: state.baseY, life: 4.6, ph: 0 });
    if (kind === "flower") state.props.push({ kind, x: state.x + 22, y: state.baseY, life: 3.4, ph: 0, grow: 0 });
    if (kind === "plane") state.props.push({ kind, x: state.x, y: state.baseY - 30, life: 3.8, ph: 0 });
    if (kind === "companion") state.props.push({ kind, x: state.x - 18, y: state.baseY, life: 4.2, ph: 0 });
  }

  function updateWorldProps(dt) {
    for (const pr of state.props) {
      pr.life -= dt;
      pr.ph += dt;
      if (pr.kind === "butterfly") {
        pr.x += Math.cos(pr.ph * 2) * 30 * dt;
        pr.y = state.baseY - 40 + Math.sin(pr.ph * 3) * 12;
      } else if (pr.kind === "plane") {
        pr.x += 34 * dt; pr.y = state.baseY - 30 + Math.sin(pr.ph * 4) * 6;
      } else if (pr.kind === "companion") {
        pr.x += Math.sin(pr.ph * 2) * 10 * dt;
      } else if (pr.kind === "flower") {
        pr.grow = Math.min(1, (pr.grow || 0) + dt * 0.5);
      }
    }
    state.props = state.props.filter((pr) => pr.life > 0);
  }

  function drawWorldProps() {
    for (const pr of state.props) {
      ctx.save();
      ctx.font = "15px system-ui, 'Segoe UI Emoji', 'Apple Color Emoji'";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      let g = "•";
      if (pr.kind === "butterfly") g = "🦋";
      else if (pr.kind === "fish") g = pr.ph > 2.2 ? "🐟" : "〜";
      else if (pr.kind === "campfire") g = "🔥";
      else if (pr.kind === "flower") g = pr.grow > 0.6 ? "🌷" : "🌱";
      else if (pr.kind === "plane") g = "✈️";
      else if (pr.kind === "companion") g = "🐣";
      ctx.globalAlpha = clamp(pr.life, 0, 1);
      ctx.fillText(g, pr.x, pr.y);
      ctx.restore();
    }
  }

  function burstConfetti() {
    if (state.reducedMotion) return;
    const colors = ["#7c6cff", "#f5b944", "#3fb950", "#f04747", "#38bdf8", "#ff8ac0"];
    for (let i = 0; i < 70; i++) {
      state.confetti.push({
        x: state.x + rand(-30, 30), y: state.baseY - 30,
        vx: rand(-70, 70), vy: rand(-160, -60),
        c: pick(colors), r: rand(2, 4), life: rand(1.1, 1.9), rot: rand(0, 6),
      });
    }
  }
  function updateConfetti(dt) {
    for (const p of state.confetti) {
      p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; p.rot += dt * 6;
    }
    state.confetti = state.confetti.filter((p) => p.life > 0 && p.y < state.h + 20);
  }
  function drawConfetti() {
    for (const p of state.confetti) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    }
  }

  // ============================================================ SPEECH BUBBLE
  function showBubble(note, ps) {
    bubbleEl.className = "bubble " + ps.cls;
    bubbleEl.innerHTML = "";
    const head = document.createElement("div");
    head.className = "b-head";
    head.innerHTML =
      '<span class="b-icon">' + esc(catIcon(note.category)) + "</span>" +
      '<span class="b-title"></span>' +
      '<span class="b-badge">' + esc(ps.badge) + "</span>";
    head.querySelector(".b-title").textContent = note.title;

    const body = document.createElement("div");
    body.className = "b-body";
    body.textContent = note.body;

    const meta = document.createElement("div");
    meta.className = "b-meta";
    const time = new Date(note.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    meta.innerHTML = '<span class="b-time" data-t="' + Number(note.timestamp || Date.now()) +
      '">' + esc(time) + '</span><button class="b-ack">Got it ✓</button>';

    const cd = document.createElement("div");
    cd.className = "b-countdown";
    cd.style.display = note.deadlineAt ? "block" : "none";

    bubbleEl.append(head, cd, body, meta);
    positionBubble();
    requestAnimationFrame(() => bubbleEl.classList.add("show"));
    meta.querySelector(".b-ack").addEventListener("click", () => ackCurrent());
  }

  function updateCountdown(note) {
    if (!note.deadlineAt) return;
    const cd = bubbleEl.querySelector(".b-countdown");
    if (!cd) return;
    const remain = Math.max(0, note.deadlineAt - Date.now());
    const t = Math.floor(remain / 1000), m = Math.floor(t / 60), s = t % 60;
    cd.textContent = "⏳ " + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + " remaining";
    positionBubble();
  }

  function positionBubble() {
    const bx = clamp(state.x, 90, state.w - 90);
    bubbleEl.style.left = bx + "px";
    bubbleEl.style.bottom = (GROUND_PAD + 74) + "px";
  }

  function hideBubble() {
    bubbleEl.classList.remove("show");
  }

  function ackCurrent() {
    if (state.clip && state.clip.kind === "announce") {
      state.clip.acked = true;
      vscode.postMessage({ type: "ack", id: state.clip.note.id });
    }
  }

  function setCritical(on) {
    document.body.classList.toggle("critical", !!on && !state.reducedMotion);
  }

  // transient one-liner over the pet (reactions / hi)
  let sayTimer = null;
  function showSay(text) {
    tipEl.textContent = text;
    tipEl.classList.add("show");
    positionTip();
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => tipEl.classList.remove("show"), 1800);
  }
  function positionTip() {
    tipEl.style.left = clamp(state.x, 60, state.w - 60) + "px";
    tipEl.style.bottom = (GROUND_PAD + 66) + "px";
  }

  // ============================================================ INTERACTIONS
  const HOVER_TIPS = [
    "Tip: git commit early, commit often.",
    "Ctrl/Cmd+P jumps to any file fast.",
    "Stuck 15 min? Rubber-duck it or ask a mentor.",
    "Why do programmers prefer dark mode? Light attracts bugs. 🪲",
    "Record a backup demo video — live demos love to break.",
    "Ship the demo path first, polish later.",
    "Cmd/Ctrl+Shift+P opens every command.",
    "You've got this. One function at a time. ✨",
    "Read the judging criteria now, not at hour 23.",
    "Hydrate. Future-you says thanks. 💧",
  ];

  canvas.addEventListener("pointerdown", (e) => {
    const now = performance.now();
    if (now - state.lastClick < 320) {
      // double click -> funny animation
      startActivity({ id: "funny", label: "goofing off", cd: 0, dur: 2000, loco: "trip", say: "whoops! 🙃" }, "react");
      state.lastClick = 0;
      return;
    }
    state.lastClick = now;
    // begin potential drag
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (Math.abs(mx - state.x) < 34) {
      state.dragging = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("grab");
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    state.hovering = Math.abs(mx - state.x) < 34;
    canvas.classList.toggle("hoverpet", state.hovering && !state.dragging);
    if (state.dragging) {
      state.x = clamp(mx, 12, state.w - 12);
      state.restX = state.x;
    }
  });

  function endDrag(e) {
    if (state.dragging) {
      state.dragging = false;
      canvas.classList.remove("grab");
      vscode.postMessage({ type: "restPosition", x: Math.round((state.restX / state.w) * 1000) / 1000 });
    }
  }
  canvas.addEventListener("pointerup", (e) => {
    endDrag(e);
    // single click (no drag movement) -> wave
    if (performance.now() - state.lastClick < 300 && state.hovering) {
      startActivity({ id: "hi", label: "waving", cd: 0, dur: 1500, loco: "wave", say: "hi! 👋" }, "react");
    }
  });
  canvas.addEventListener("pointerleave", (e) => { state.hovering = false; canvas.classList.remove("hoverpet"); endDrag(e); });

  // hover tooltip (debounced)
  let hoverTimer = null;
  canvas.addEventListener("pointermove", () => {
    if (!state.hovering) { tipEl.classList.remove("hoverhint"); return; }
    if (hoverTimer) return;
    hoverTimer = setTimeout(() => {
      if (state.hovering && !state.dragging) {
        tipEl.textContent = pick(HOVER_TIPS);
        tipEl.classList.add("show", "hoverhint");
        positionTip();
        setTimeout(() => tipEl.classList.remove("show", "hoverhint"), 2600);
      }
      hoverTimer = null;
    }, 500);
  });

  // right-click context menu
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    openMenu(e.clientX, e.clientY);
  });
  function openMenu(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    menuEl.style.left = clamp(cx - rect.left, 4, state.w - 160) + "px";
    menuEl.style.bottom = (state.h - (cy - rect.top) + 6) + "px";
    menuEl.classList.add("show");
  }
  document.addEventListener("pointerdown", (e) => {
    if (!menuEl.contains(e.target)) menuEl.classList.remove("show");
  });
  menuEl.addEventListener("click", (e) => {
    const item = e.target.closest("[data-action]");
    if (!item) return;
    const action = item.dataset.action;
    menuEl.classList.remove("show");
    if (action === "pause") { state.paused = !state.paused; item.textContent = state.paused ? "▶ Resume pet" : "⏸ Pause pet"; }
    else vscode.postMessage({ type: "menu", action });
  });

  // ============================================================ HOST BRIDGE
  window.addEventListener("message", (ev) => {
    const m = ev.data || {};
    switch (m.type) {
      case "notify": if (!state.muted) notify(m.note); break;
      case "react": if (REACTIONS[m.key]) state.reactions.push(m.key); break;
      case "settings":
        if (m.settings.petType && PETS[m.settings.petType]) state.petType = m.settings.petType;
        if (typeof m.settings.reducedMotion === "boolean") state.reducedMotion = m.settings.reducedMotion;
        if (typeof m.settings.muted === "boolean") state.muted = m.settings.muted;
        if (typeof m.settings.paused === "boolean") state.paused = m.settings.paused;
        break;
      case "demo": runParade(); break;
    }
  });

  function runParade() {
    // queue every activity once for an on-demand showcase
    let delay = 0;
    for (const a of ACTIVITIES) {
      setTimeout(() => startActivity(a), delay);
      delay += (a.dur + 250);
    }
  }

  // ============================================================ HISTORY (host)
  function logHistory(note) { vscode.postMessage({ type: "logHistory", note }); }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ============================================================ MAIN LOOP
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05); // clamp big gaps (tab switch)
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  resize();
  vscode.postMessage({ type: "ready" });
  requestAnimationFrame(frame);
})();
