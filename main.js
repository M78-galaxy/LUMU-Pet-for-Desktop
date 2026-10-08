var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => PetPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var FADE_MS = 180;
var ANIM_MS = {
  jump: 600,
  bounce: 800,
  shake: 500,
  spin: 800,
  wiggle: 600,
  nod: 600
};
var DEFAULT_DIALOGUE = `A: \u4F60\u5728\u5199\u4EC0\u4E48\u5440\uFF1F
B: \u4ECA\u5929\u7684\u7B14\u8BB0\uFF0C\u522B\u5077\u770B\u3002
A: \u5C31\u770B\u4E00\u773C\u561B\u3002`;
var DEFAULT_ACTIONS = `# \u7275\u624B\u5230\u5904\u901B\u901B
video assets/pair-stroll.mp4

# \u7AD9\u7740\u804A\u5929
chat idle

# \u8E66\u8DF6
A jump
wait 250
B jump
wait 250
both bounce

# \u6492\u5A07
A shake
A say \u966A\u6211\u73A9~
wait 1500
B nod
B say \u597D\u597D\u597D`;
var A_STATES = `sit: assets/A-sit.png
sit-talk: assets/A-sit-talk.png 2 4
idle: assets/A-idle.png
walk: assets/A-walk.png 6 8`;
var B_STATES = `sit: assets/B-sit.png
sit-talk: assets/B-sit-talk.png 2 4
idle: assets/B-idle.png
walk: assets/B-walk.png 6 8`;
var PAIR_STATES = `idle: assets/pair-hold.png
walk: assets/pair-walk.png 6 8`;
var DEFAULT_SETTINGS = {
  coupleName: "\u6A79\u7A46",
  showCoupleName: true,
  showNames: true,
  a: { name: "\u8001\u5988\u5988", size: 200, flip: false, states: A_STATES },
  b: { name: "\u8001\u7238\u7238", size: 200, flip: false, states: B_STATES },
  gap: -8,
  linkSymbol: "\u2665",
  pairStates: PAIR_STATES,
  pairSize: 1,
  x: 200,
  y: 200,
  idleAnimate: true,
  autoPlay: true,
  intervalMin: 20,
  intervalMax: 60,
  dialogueChance: 60,
  dialogueScript: DEFAULT_DIALOGUE,
  dialogueNote: "",
  actionScript: DEFAULT_ACTIONS,
  actionNote: ""
};
var WHOS = ["A", "B"];
var pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
var PetPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.coupleEl = null;
    this.charEls = { A: null, B: null };
    this.bodyEls = { A: null, B: null };
    this.spriteEls = { A: null, B: null };
    this.bubbleEls = { A: null, B: null };
    this.bubbleTimers = { A: null, B: null };
    this.pairEl = null;
    this.pairBodyEl = null;
    this.pairSpriteEl = null;
    this.clipEl = null;
    this.clipVideo = null;
    this.clipRaf = 0;
    this.pairBubbleEls = { A: null, B: null };
    this.stateMaps = { A: {}, B: {} };
    this.pairStateMap = {};
    this.curState = { A: "", B: "" };
    this.pairMode = false;
    this.curPair = "";
    this.metricsCache = /* @__PURE__ */ new Map();
    this.metricsWait = /* @__PURE__ */ new Map();
    this.dialogues = [];
    this.actions = [];
    this.runId = 0;
    this.busy = false;
    this.dragging = false;
    this.facing = null;
    this.nextAt = 0;
  }
  async onload() {
    await this.loadSettings();
    await this.loadScripts();
    this.addSettingTab(new PetSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => {
      this.renderCouple();
      this.scheduleNext();
    });
    this.registerInterval(window.setInterval(() => this.tick(), 1e3));
    this.registerDomEvent(window, "resize", () => this.clampIntoView());
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        const watched = [this.settings.dialogueNote, this.settings.actionNote].map((p) => p.trim()).filter(Boolean).map((p) => (0, import_obsidian.normalizePath)(p));
        if (watched.includes(f.path)) this.loadScripts();
      })
    );
    this.addCommand({ id: "toggle-pet", name: "\u663E\u793A / \u9690\u85CF", callback: () => {
      if (this.coupleEl) this.destroyCouple();
      else this.renderCouple();
    } });
    this.addCommand({ id: "random-dialogue", name: "\u968F\u673A\u5BF9\u8BDD", callback: () => {
      if (this.dialogues.length) this.runDialogue(pick(this.dialogues));
    } });
    this.addCommand({ id: "random-action", name: "\u968F\u673A\u52A8\u4F5C", callback: () => {
      if (this.actions.length) this.runAction(pick(this.actions));
    } });
    this.addCommand({ id: "stop", name: "\u505C\u6B62\u5F53\u524D\u52A8\u4F5C", callback: () => this.cancel() });
    this.addCommand({ id: "toggle-auto", name: "\u5F00\u5173\u81EA\u52A8\u4E92\u52A8", callback: async () => {
      this.settings.autoPlay = !this.settings.autoPlay;
      await this.saveSettings();
      new import_obsidian.Notice(`\u81EA\u52A8\u4E92\u52A8\uFF1A${this.settings.autoPlay ? "\u5F00" : "\u5173"}`);
    } });
    this.addCommand({ id: "reload-scripts", name: "\u91CD\u65B0\u8BFB\u53D6\u5BF9\u8BDD / \u52A8\u4F5C\u811A\u672C", callback: async () => {
      await this.loadScripts();
      new import_obsidian.Notice(`\u5DF2\u8BFB\u53D6 ${this.dialogues.length} \u6BB5\u5BF9\u8BDD\uFF0C${this.actions.length} \u4E2A\u52A8\u4F5C`);
    } });
  }
  onunload() {
    this.destroyCouple();
  }
  renderCouple() {
    this.destroyCouple();
    const s = this.settings;
    const el = document.body.createDiv({ cls: "pet-couple" });
    el.style.left = `${s.x}px`;
    el.style.top = `${s.y}px`;
    if (s.idleAnimate) el.addClass("pet-idle");
    const row = el.createDiv({ cls: "pet-row" });
    row.style.gap = `${s.gap}px`;
    this.createChar(row, "A");
    if (s.linkSymbol.trim()) row.createDiv({ cls: "pet-link", text: s.linkSymbol.trim() });
    this.createChar(row, "B");
    this.createPair(row);
    if (s.showCoupleName && s.coupleName.trim()) {
      el.createDiv({ cls: "pet-couple-name", text: s.coupleName.trim() });
    }
    this.enableDrag(el);
    this.registerDomEvent(el, "contextmenu", (e) => this.showMenu(e));
    this.coupleEl = el;
    WHOS.forEach((w) => this.setState(w, this.restName(w)));
    this.updateFacing();
    this.clampIntoView();
  }
  createChar(parent, who) {
    const c = who === "A" ? this.settings.a : this.settings.b;
    const char = parent.createDiv({ cls: "pet-char" });
    const body = char.createDiv({ cls: "pet-body" });
    if (this.settings.showNames) char.createDiv({ cls: "pet-name", text: c.name });
    this.bubbleEls[who] = char.createDiv({ cls: "pet-bubble" });
    this.charEls[who] = char;
    this.bodyEls[who] = body;
    this.spriteEls[who] = null;
    this.curState[who] = "";
    this.registerDomEvent(char, "click", () => this.onClickPet(who));
  }
  createPair(parent) {
    const pair = parent.createDiv({ cls: "pet-pair" });
    const body = pair.createDiv({ cls: "pet-body" });
    this.pairBubbleEls.A = pair.createDiv({ cls: "pet-bubble pet-bubble-a" });
    this.pairBubbleEls.B = pair.createDiv({ cls: "pet-bubble pet-bubble-b" });
    this.pairEl = pair;
    this.pairBodyEl = body;
    this.pairSpriteEl = null;
    this.registerDomEvent(pair, "click", () => this.onClickPet("A"));
  }
  onClickPet(who) {
    var _a;
    if (this.dragging || ((_a = this.coupleEl) == null ? void 0 : _a.hasClass("pet-dragging"))) return;
    if (this.dialogues.length) this.runDialogue(pick(this.dialogues));
    else this.playAnim(who, "jump", ++this.runId);
  }
  destroyCouple() {
    var _a;
    this.cancel();
    (_a = this.coupleEl) == null ? void 0 : _a.remove();
    this.coupleEl = null;
    this.pairEl = this.pairBodyEl = this.pairSpriteEl = this.clipEl = this.clipVideo = null;
    this.clipRaf = 0;
    WHOS.forEach((w) => {
      this.charEls[w] = this.bodyEls[w] = this.bubbleEls[w] = null;
      this.spriteEls[w] = this.pairBubbleEls[w] = null;
    });
  }
  showMenu(e) {
    e.preventDefault();
    const menu = new import_obsidian.Menu();
    this.actions.forEach(
      (a) => menu.addItem((i) => i.setTitle(`\u52A8\u4F5C\uFF1A${a.name}`).setIcon("play").onClick(() => this.runAction(a)))
    );
    if (this.actions.length && this.dialogues.length) menu.addSeparator();
    this.dialogues.forEach(
      (d) => menu.addItem(
        (i) => i.setTitle(`\u5BF9\u8BDD\uFF1A${d[0].text.slice(0, 14)}`).setIcon("message-circle").onClick(() => this.runDialogue(d))
      )
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("\u505C\u4E0B").setIcon("square").onClick(() => this.cancel()));
    menu.addItem((i) => i.setTitle("\u9690\u85CF").setIcon("eye-off").onClick(() => this.destroyCouple()));
    menu.showAtMouseEvent(e);
  }
  metricsKey(def) {
    return `${(0, import_obsidian.normalizePath)(def.path)}|${def.frames}`;
  }
  getMetrics(def) {
    const key = this.metricsKey(def);
    const hit = this.metricsCache.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.metricsWait.get(key);
    if (pending) return pending;
    const url = this.app.vault.adapter.getResourcePath((0, import_obsidian.normalizePath)(def.path));
    const job = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const m = this.measureSprite(img, def.frames);
        this.metricsCache.set(key, m);
        this.metricsWait.delete(key);
        resolve(m);
      };
      img.onerror = () => {
        const m = { imgW: 1, imgH: 1, frameW: 1, bx: 0, by: 0, bw: 1, bh: 1 };
        this.metricsCache.set(key, m);
        this.metricsWait.delete(key);
        resolve(m);
      };
      img.src = url;
    });
    this.metricsWait.set(key, job);
    return job;
  }
  measureSprite(img, frames) {
    const imgW = img.naturalWidth || 1;
    const imgH = img.naturalHeight || 1;
    const n = Math.max(1, frames);
    const frameW = imgW / n;
    const fallback = { imgW, imgH, frameW, bx: 0, by: 0, bw: frameW, bh: imgH };
    const w = Math.max(1, Math.round(frameW));
    const h = Math.max(1, imgH);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    try {
      ctx.drawImage(img, 0, 0, frameW, imgH, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] < 16) continue;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < minX) return fallback;
      return { imgW, imgH, frameW, bx: minX, by: minY, bw: maxX - minX + 1, bh: maxY - minY + 1 };
    } catch (e) {
      return fallback;
    }
  }
  pairTargetHeight() {
    const scale = this.settings.pairSize > 3 ? 1 : this.settings.pairSize;
    return Math.max(this.settings.a.size, this.settings.b.size) * (scale || 1);
  }
  makeSprite(def, targetH) {
    const el = createDiv({ cls: "pet-sprite" });
    const url = this.app.vault.adapter.getResourcePath((0, import_obsidian.normalizePath)(def.path));
    el.style.backgroundImage = `url("${url}")`;
    el.style.height = `${targetH}px`;
    el.style.width = `${Math.round(targetH * 0.7)}px`;
    void this.layoutSprite(el, def, targetH);
    return el;
  }
  async layoutSprite(el, def, targetH) {
    const m = await this.getMetrics(def);
    if (!el.isConnected) return;
    const bh = Math.max(1, m.bh);
    const scale = targetH / bh;
    const w = Math.max(1, Math.round(m.bw * scale));
    const h = Math.max(1, Math.round(m.bh * scale));
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.backgroundSize = `${m.imgW * scale}px ${m.imgH * scale}px`;
    const x0 = -m.bx * scale;
    const y0 = -m.by * scale;
    el.style.backgroundPosition = `${x0}px ${y0}px`;
    el.getAnimations().forEach((a) => a.cancel());
    if (def.frames > 1) {
      el.animate(
        [
          { backgroundPosition: `${x0}px ${y0}px` },
          { backgroundPosition: `${x0 - m.frameW * def.frames * scale}px ${y0}px` }
        ],
        {
          duration: def.frames / Math.max(1, def.fps) * 1e3,
          iterations: Infinity,
          easing: `steps(${def.frames}, end)`
        }
      );
    }
  }
  isMouthSwitch(from, to) {
    const mouth = (s) => s === "sit-talk" || s === "talk";
    const rest = (s) => s === "sit" || s === "idle";
    return mouth(from) && rest(to) || rest(from) && mouth(to);
  }
  swapSprite(body, prev, def, targetH, fade) {
    const sp = this.makeSprite(def, targetH);
    if (fade && prev) sp.style.opacity = "0";
    body.appendChild(sp);
    if (fade && prev) {
      prev.addClass("pet-leaving");
      requestAnimationFrame(() => {
        sp.style.opacity = "1";
        prev.style.opacity = "0";
      });
      window.setTimeout(() => prev.remove(), FADE_MS);
    } else {
      prev == null ? void 0 : prev.remove();
    }
    return sp;
  }
  restName(who) {
    const map = this.stateMaps[who];
    if (map["sit"]) return "sit";
    if (map["idle"]) return "idle";
    return "sit";
  }
  sitting(who) {
    const s = this.curState[who];
    return s === "sit" || s === "sit-talk" || s === "sitdown" || s === "";
  }
  poseRest(who) {
    const map = this.stateMaps[who];
    if (this.sitting(who)) {
      if (map["sit"]) return "sit";
    }
    if (map["idle"]) return "idle";
    if (map["sit"]) return "sit";
    return "idle";
  }
  talkName(who) {
    const map = this.stateMaps[who];
    if (this.sitting(who)) {
      if (map["sit-talk"]) return "sit-talk";
      if (map["sit"]) return "sit";
    }
    if (map["talk"]) return "talk";
    if (map["idle"]) return "idle";
    if (map["sit-talk"]) return "sit-talk";
    return this.poseRest(who);
  }
  beginTalk(who) {
    if (this.pairMode) return;
    WHOS.forEach((w) => this.setState(w, w === who ? this.talkName(w) : this.poseRest(w)));
  }
  setState(who, name) {
    const body = this.bodyEls[who];
    if (!body) return;
    const c = who === "A" ? this.settings.a : this.settings.b;
    const map = this.stateMaps[who];
    const key = map[name] ? name : map["sit"] ? "sit" : map["idle"] ? "idle" : null;
    if (key === null) {
      if (!body.childElementCount) body.createDiv({ cls: "pet-placeholder", text: c.name.slice(0, 1) || who });
      this.curState[who] = "";
      return;
    }
    if (this.curState[who] === key && body.childElementCount) return;
    const fade = !!this.spriteEls[who] && !this.isMouthSwitch(this.curState[who], key);
    const prev = this.spriteEls[who];
    this.curState[who] = key;
    this.spriteEls[who] = this.swapSprite(body, prev, map[key], c.size, fade);
    this.updateFacing();
  }
  setPair(name) {
    const el = this.coupleEl;
    if (!el || !this.pairBodyEl) return;
    if (name === "off") {
      this.pairMode = false;
      this.curPair = "";
      el.removeClass("pet-pair-mode");
      this.pairBodyEl.empty();
      this.pairSpriteEl = null;
      return;
    }
    const map = this.pairStateMap;
    const key = map[name] ? name : map["idle"] ? "idle" : null;
    if (key === null) {
      console.warn(`[pet] \u6CA1\u6709\u914D\u7F6E\u53CC\u4EBA\u72B6\u6001 "${name}"\uFF0C\u8DF3\u8FC7`);
      return;
    }
    if (this.pairMode && this.curPair === key) return;
    const fade = this.pairMode && !!this.pairSpriteEl;
    const prev = this.pairSpriteEl;
    this.pairMode = true;
    this.curPair = key;
    el.addClass("pet-pair-mode");
    this.pairSpriteEl = this.swapSprite(this.pairBodyEl, prev, map[key], this.pairTargetHeight(), fade);
    this.updateFacing();
  }
  rebuildStates() {
    this.stateMaps.A = this.parseStates(this.settings.a.states);
    this.stateMaps.B = this.parseStates(this.settings.b.states);
    this.pairStateMap = this.parseStates(this.settings.pairStates);
  }
  parseStates(text) {
    const map = {};
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) continue;
      const m = line.match(/^([^\s:：]+)\s*[:：]\s*(.+)$/);
      if (!m) continue;
      const tokens = m[2].trim().split(/\s+/);
      let frames = 1, fps = 8;
      const isNum = (t) => t !== void 0 && !isNaN(Number(t));
      if (tokens.length >= 3 && isNum(tokens[tokens.length - 1]) && isNum(tokens[tokens.length - 2])) {
        fps = Number(tokens.pop());
        frames = Number(tokens.pop());
      } else if (tokens.length >= 2 && isNum(tokens[tokens.length - 1])) {
        frames = Number(tokens.pop());
      }
      map[m[1].toLowerCase()] = {
        path: tokens.join(" "),
        frames: Math.max(1, Math.floor(frames)),
        fps: Math.max(1, fps)
      };
    }
    return map;
  }
  setFacing(f) {
    this.facing = f;
    this.updateFacing();
  }
  updateFacing() {
    WHOS.forEach((w) => {
      const c = w === "A" ? this.settings.a : this.settings.b;
      const sp = this.spriteEls[w];
      if (!sp) return;
      const sitting = this.curState[w] === "sit" || this.curState[w] === "sit-talk";
      const flipped = sitting ? this.facing === "left" : c.flip !== (this.facing === "left");
      sp.toggleClass("pet-flip", flipped);
    });
    if (this.pairSpriteEl) this.pairSpriteEl.toggleClass("pet-flip", this.facing === "left");
  }
  clampPos(x, y) {
    var _a, _b, _c, _d;
    const w = (_b = (_a = this.coupleEl) == null ? void 0 : _a.offsetWidth) != null ? _b : 0;
    const h = (_d = (_c = this.coupleEl) == null ? void 0 : _c.offsetHeight) != null ? _d : 0;
    return {
      x: Math.round(Math.max(0, Math.min(window.innerWidth - w, x))),
      y: Math.round(Math.max(0, Math.min(window.innerHeight - h, y)))
    };
  }
  clampIntoView() {
    if (!this.coupleEl) return;
    const p = this.clampPos(this.settings.x, this.settings.y);
    this.settings.x = p.x;
    this.settings.y = p.y;
    this.coupleEl.style.left = `${p.x}px`;
    this.coupleEl.style.top = `${p.y}px`;
  }
  sleep(ms, id) {
    return new Promise((resolve) => window.setTimeout(() => resolve(id === this.runId), ms));
  }
  stopClip() {
    var _a, _b;
    (_a = this.coupleEl) == null ? void 0 : _a.removeClass("pet-clip-playing");
    (_b = this.coupleEl) == null ? void 0 : _b.removeClass("pet-clip-blend");
    if (this.clipRaf) {
      cancelAnimationFrame(this.clipRaf);
      this.clipRaf = 0;
    }
    if (this.clipVideo) {
      this.clipVideo.pause();
      this.clipVideo.remove();
      this.clipVideo = null;
    }
    if (this.clipEl) {
      this.clipEl.remove();
      this.clipEl = null;
    }
  }
  keyWhite(ctx, w, h) {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const dist = Math.sqrt((255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2);
      if (dist < 30) d[i + 3] = 0;
      else if (dist < 54) d[i + 3] = Math.round(d[i + 3] * (dist - 30) / 24);
    }
    ctx.putImageData(img, 0, 0);
  }
  async slideCouple(x, y, ms, id, flip) {
    const el = this.coupleEl;
    if (!el) return false;
    const p = this.clampPos(x, y);
    if (this.clipEl) this.clipEl.style.transform = flip ? "scaleX(-1)" : "";
    el.style.transition = `left ${ms}ms linear, top ${ms}ms linear`;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.settings.x = p.x;
    this.settings.y = p.y;
    const ok = await this.sleep(ms, id);
    if (ok) el.style.transition = "";
    return ok;
  }
  async runClipWalk(walkAt, walkMs, id) {
    if (!await this.sleep(walkAt, id)) return;
    const el = this.coupleEl;
    if (!el || id !== this.runId) return;
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || 180;
    const margin = 20;
    const roomR = window.innerWidth - w - this.settings.x - margin;
    const roomL = this.settings.x - margin;
    const span = Math.max(260, Math.round(window.innerWidth * 0.36));
    let dx = 0;
    if (roomR >= 160) dx = Math.min(roomR, span);
    else if (roomL >= 160) dx = -Math.min(roomL, span);
    else dx = roomR >= roomL ? roomR * 0.7 : -roomL * 0.7;
    const dy = Math.round(Math.random() * 64 - 32);
    await this.slideCouple(this.settings.x + dx, this.settings.y + dy, walkMs, id, dx < 0);
  }
  async playClip(path, id, walkAt, walkMs) {
    const couple = this.coupleEl;
    const body = this.pairBodyEl;
    if (!couple || !body) return false;
    const rel = (0, import_obsidian.normalizePath)(path);
    const file = this.app.vault.getAbstractFileByPath(rel);
    let src = "";
    if (file instanceof import_obsidian.TFile) {
      src = this.app.vault.adapter.getResourcePath(file.path);
    } else if (await this.app.vault.adapter.exists(rel)) {
      src = this.app.vault.adapter.getResourcePath(rel);
    } else {
      new import_obsidian.Notice(`\u627E\u4E0D\u5230\u89C6\u9891\uFF1A${path}`);
      return false;
    }
    const v = document.createElement("video");
    v.className = "pet-clip-src";
    v.src = src;
    v.muted = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "true");
    v.setAttribute("muted", "true");
    const ready = await new Promise((resolve) => {
      let settled = false;
      const done = (ok2) => {
        if (settled) return;
        settled = true;
        resolve(ok2);
      };
      v.addEventListener("canplay", () => done(true), { once: true });
      v.addEventListener("error", () => done(false), { once: true });
      v.load();
      window.setTimeout(() => done(v.readyState >= 2), 2500);
    });
    if (id !== this.runId || !ready) {
      v.remove();
      if (id === this.runId && !ready) new import_obsidian.Notice("\u89C6\u9891\u64AD\u4E0D\u51FA\u6765");
      return false;
    }
    const h = Math.round(this.pairTargetHeight() * 1.42);
    const vw = v.videoWidth || 1112;
    const vh = v.videoHeight || 834;
    const w = Math.max(1, Math.round(h * vw / vh));
    const canvas = document.createElement("canvas");
    canvas.className = "pet-clip";
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let canKey = !!ctx;
    if (ctx) {
      try {
        ctx.drawImage(v, 0, 0, 1, 1);
        ctx.getImageData(0, 0, 1, 1);
      } catch (e) {
        canKey = false;
      }
    }
    this.stopClip();
    this.pairMode = true;
    this.curPair = "";
    couple.addClass("pet-pair-mode");
    couple.addClass("pet-clip-playing");
    body.empty();
    this.pairSpriteEl = null;
    if (canKey && ctx) {
      v.className = "pet-clip-src";
      couple.appendChild(v);
      body.appendChild(canvas);
      this.clipEl = canvas;
      this.clipVideo = v;
      const paint = () => {
        if (this.clipVideo !== v || !this.clipEl) return;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(v, 0, 0, w, h);
        this.keyWhite(ctx, w, h);
        if (this.clipVideo === v && !v.ended) this.clipRaf = requestAnimationFrame(paint);
      };
      this.clipRaf = requestAnimationFrame(paint);
    } else {
      couple.addClass("pet-clip-blend");
      v.className = "pet-clip";
      v.style.height = `${h}px`;
      v.style.width = "auto";
      body.appendChild(v);
      this.clipEl = v;
      this.clipVideo = v;
    }
    if (walkAt == null && /pair-stroll/i.test(rel)) {
      walkAt = 4100;
      walkMs = 5e3;
    }
    if (walkAt != null && walkAt >= 0) void this.runClipWalk(walkAt, walkMs != null ? walkMs : 5e3, id);
    const ok = await new Promise((resolve) => {
      let settled = false;
      const finish = (success) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(success && id === this.runId);
      };
      const ms = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1e3 + 500 : 2e4;
      const timer = window.setTimeout(() => finish(true), ms);
      v.addEventListener("ended", () => finish(true), { once: true });
      v.addEventListener("error", () => finish(false), { once: true });
      void v.play().catch(() => finish(false));
    });
    if (id !== this.runId) return false;
    this.stopClip();
    this.setPair("off");
    WHOS.forEach((who) => this.setState(who, this.restName(who)));
    return ok;
  }
  cancel(opts) {
    var _a;
    this.runId++;
    this.busy = false;
    this.stopClip();
    this.hideBubbles();
    WHOS.forEach((w) => {
      var _a2;
      (_a2 = this.charEls[w]) == null ? void 0 : _a2.removeClass("pet-talking");
      const b = this.bodyEls[w];
      if (b) Object.keys(ANIM_MS).forEach((n) => b.removeClass(`pet-anim-${n}`));
    });
    (_a = this.pairEl) == null ? void 0 : _a.removeClass("pet-talking");
    if (this.pairBodyEl) Object.keys(ANIM_MS).forEach((n) => this.pairBodyEl.removeClass(`pet-anim-${n}`));
    const el = this.coupleEl;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.transition = "none";
      el.style.left = `${Math.round(r.left)}px`;
      el.style.top = `${Math.round(r.top)}px`;
      el.removeClass("pet-walking");
      this.settings.x = Math.round(r.left);
      this.settings.y = Math.round(r.top);
      void el.offsetWidth;
      el.style.transition = "";
    }
    this.setFacing(null);
    if ((opts == null ? void 0 : opts.restore) !== false) {
      WHOS.forEach((w) => this.setState(w, this.restName(w)));
      this.setPair("off");
    }
  }
  async runAction(action) {
    if (!this.coupleEl) return;
    this.cancel();
    const id = ++this.runId;
    this.busy = true;
    for (const step of action.steps) {
      if (id !== this.runId) return;
      const ok = await this.runStep(step, id);
      if (!ok) {
        if (id === this.runId) this.busy = false;
        return;
      }
    }
    if (id === this.runId) {
      this.busy = false;
      this.setFacing(null);
      await this.saveSettings();
    }
  }
  async runStep(step, id) {
    var _a, _b, _c, _d;
    switch (step.kind) {
      case "wait":
        return this.sleep(step.ms, id);
      case "move":
        return this.moveTo(this.settings.x + step.dx, this.settings.y + step.dy, step.ms, id);
      case "wander": {
        const w = (_b = (_a = this.coupleEl) == null ? void 0 : _a.offsetWidth) != null ? _b : 0;
        const h = (_d = (_c = this.coupleEl) == null ? void 0 : _c.offsetHeight) != null ? _d : 0;
        return this.moveTo(
          Math.random() * Math.max(0, window.innerWidth - w),
          Math.random() * Math.max(0, window.innerHeight - h),
          step.ms,
          id
        );
      }
      case "anim":
        return this.playAnim(step.target, step.name, id);
      case "state": {
        const whos = step.target === "both" ? WHOS : [step.target];
        whos.forEach((w) => this.setState(w, step.name));
        return true;
      }
      case "pair":
        this.setPair(step.name);
        return true;
      case "video":
        return this.playClip(step.path, id, step.walkAt, step.walkMs);
      case "say":
        this.beginTalk(step.who);
        this.showBubble(step.who, step.text, Math.min(6e3, 1500 + step.text.length * 150));
        return true;
      case "chat":
        return this.playChat(step.pose, id);
      case "face":
        this.setFacing(step.dir === "reset" ? null : step.dir);
        return true;
    }
  }
  async moveTo(x, y, ms, id) {
    const el = this.coupleEl;
    if (!el) return false;
    const p = this.clampPos(x, y);
    if (p.x > this.settings.x) this.setFacing("right");
    else if (p.x < this.settings.x) this.setFacing("left");
    const usePairWalk = !this.clipEl && this.pairMode && !!this.pairStateMap["walk"];
    const prevPair = this.curPair;
    const soloWalk = this.pairMode ? [] : WHOS.filter((w) => !!this.stateMaps[w]["walk"]);
    if (usePairWalk) this.setPair("walk");
    soloWalk.forEach((w) => this.setState(w, "walk"));
    if (!usePairWalk && soloWalk.length === 0) el.addClass("pet-walking");
    el.style.transition = `left ${ms}ms linear, top ${ms}ms linear`;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    this.settings.x = p.x;
    this.settings.y = p.y;
    const ok = await this.sleep(ms, id);
    if (ok) {
      el.removeClass("pet-walking");
      el.style.transition = "";
      if (usePairWalk) this.setPair(prevPair || "idle");
      soloWalk.forEach((w) => this.setState(w, "idle"));
    }
    return ok;
  }
  async playAnim(target, name, id) {
    const ms = ANIM_MS[name];
    if (ms === void 0) return true;
    const cls = `pet-anim-${name}`;
    const bodies = this.pairMode ? this.pairBodyEl ? [this.pairBodyEl] : [] : (target === "both" ? WHOS : [target]).map((w) => this.bodyEls[w]).filter((b) => !!b);
    bodies.forEach((b) => {
      b.removeClass(cls);
      void b.offsetWidth;
      b.addClass(cls);
    });
    const ok = await this.sleep(ms, id);
    bodies.forEach((b) => b.removeClass(cls));
    return ok;
  }
  canStandTalk() {
    return !!this.stateMaps.A["idle"] && !!this.stateMaps.B["idle"];
  }
  applyTalkPose(pose) {
    this.setPair("off");
    if (pose === "idle" && this.canStandTalk()) {
      WHOS.forEach((w) => this.setState(w, "idle"));
      return;
    }
    WHOS.forEach((w) => this.setState(w, this.restName(w)));
  }
  async playDialogueLines(d, id) {
    for (const line of d) {
      if (id !== this.runId) return false;
      const ms = Math.min(6e3, 1500 + line.text.length * 150);
      this.showBubble(line.who, line.text, ms);
      this.beginTalk(line.who);
      const host = this.pairMode ? this.pairEl : this.charEls[line.who];
      host == null ? void 0 : host.addClass("pet-talking");
      const ok = await this.sleep(ms + 300, id);
      host == null ? void 0 : host.removeClass("pet-talking");
      if (id === this.runId && !this.pairMode) this.setState(line.who, this.poseRest(line.who));
      if (!ok) return false;
    }
    return true;
  }
  async playChat(pose, id) {
    if (!this.dialogues.length) return true;
    this.applyTalkPose(pose);
    return this.playDialogueLines(pick(this.dialogues), id);
  }
  async runDialogue(d, pose) {
    if (!this.coupleEl) return;
    const stand = pose === "idle" || pose === void 0 && this.canStandTalk() && Math.random() < 0.5;
    this.cancel({ restore: false });
    const id = ++this.runId;
    this.busy = true;
    this.applyTalkPose(stand ? "idle" : "sit");
    await this.playDialogueLines(d, id);
    if (id === this.runId) this.busy = false;
  }
  showBubble(who, text, ms) {
    const b = this.pairMode ? this.pairBubbleEls[who] : this.bubbleEls[who];
    if (!b) return;
    b.setText(text);
    b.addClass("pet-bubble-show");
    const t = this.bubbleTimers[who];
    if (t) window.clearTimeout(t);
    this.bubbleTimers[who] = window.setTimeout(() => b.removeClass("pet-bubble-show"), ms);
  }
  hideBubbles() {
    WHOS.forEach((w) => {
      var _a, _b;
      (_a = this.bubbleEls[w]) == null ? void 0 : _a.removeClass("pet-bubble-show");
      (_b = this.pairBubbleEls[w]) == null ? void 0 : _b.removeClass("pet-bubble-show");
      const t = this.bubbleTimers[w];
      if (t) window.clearTimeout(t);
      this.bubbleTimers[w] = null;
    });
  }
  scheduleNext() {
    const mn = Math.max(3, Math.min(this.settings.intervalMin, this.settings.intervalMax));
    const mx = Math.max(mn, this.settings.intervalMax);
    this.nextAt = Date.now() + (mn + Math.random() * (mx - mn)) * 1e3;
  }
  tick() {
    if (!this.settings.autoPlay || !this.coupleEl || this.busy || this.dragging) return;
    if (Date.now() < this.nextAt) return;
    this.playRandom();
    this.scheduleNext();
  }
  playRandom() {
    const wantDialogue = Math.random() * 100 < this.settings.dialogueChance;
    if (wantDialogue && this.dialogues.length) return this.runDialogue(pick(this.dialogues));
    if (this.actions.length) return this.runAction(pick(this.actions));
    if (this.dialogues.length) return this.runDialogue(pick(this.dialogues));
  }
  enableDrag(el) {
    let startX = 0, startY = 0, originX = 0, originY = 0, moved = false;
    const onMove = (e) => {
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (!moved) return;
      el.addClass("pet-dragging");
      el.style.left = `${originX + dx}px`;
      el.style.top = `${originY + dy}px`;
    };
    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      this.dragging = false;
      if (moved) {
        const p = this.clampPos(parseInt(el.style.left), parseInt(el.style.top));
        this.settings.x = p.x;
        this.settings.y = p.y;
        el.style.left = `${p.x}px`;
        el.style.top = `${p.y}px`;
        await this.saveSettings();
        window.setTimeout(() => el.removeClass("pet-dragging"), 0);
      }
    };
    this.registerDomEvent(el, "mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.cancel();
      this.dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originX = el.offsetLeft;
      originY = el.offsetTop;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  async loadScripts() {
    var _a, _b;
    const dText = (_a = await this.readNote(this.settings.dialogueNote)) != null ? _a : this.settings.dialogueScript;
    const aText = (_b = await this.readNote(this.settings.actionNote)) != null ? _b : this.settings.actionScript;
    this.dialogues = this.parseDialogues(dText);
    this.actions = this.parseActions(aText);
  }
  async readNote(path) {
    const p = path.trim();
    if (!p) return null;
    const f = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(p));
    if (f instanceof import_obsidian.TFile) return this.app.vault.cachedRead(f);
    return null;
  }
  resolveWho(s) {
    const k = s.trim();
    if (/^a$/i.test(k) || k === this.settings.a.name) return "A";
    if (/^b$/i.test(k) || k === this.settings.b.name) return "B";
    return null;
  }
  resolveTarget(s) {
    const k = s.trim().toLowerCase();
    if (k === "both" || k === "all" || k === "\u90FD" || k === "\u4E24\u4EBA" || k === "\u4FE9") return "both";
    return this.resolveWho(s);
  }
  parseDialogues(text) {
    const out = [];
    for (const block of text.split(/\n\s*\n/)) {
      const lines = [];
      for (const raw of block.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("//") || line === "---") continue;
        const m = line.match(/^(.+?)\s*[:：]\s*(.+)$/);
        if (!m) continue;
        const who = this.resolveWho(m[1]);
        if (!who) continue;
        lines.push({ who, text: m[2].trim() });
      }
      if (lines.length) out.push(lines);
    }
    return out;
  }
  parseActions(text) {
    const out = [];
    let cur = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line === "---") continue;
      if (line.startsWith("#")) {
        cur = { name: line.replace(/^#+\s*/, "") || "\u672A\u547D\u540D", steps: [] };
        out.push(cur);
        continue;
      }
      if (!cur) {
        cur = { name: "\u672A\u547D\u540D", steps: [] };
        out.push(cur);
      }
      const step = this.parseStep(line);
      if (step) cur.steps.push(step);
    }
    return out.filter((a) => a.steps.length);
  }
  parseStep(line) {
    var _a, _b, _c;
    const parts = line.split(/\s+/);
    const head = parts[0].toLowerCase();
    const num = (s, d) => {
      const n = parseFloat(s != null ? s : "");
      return isNaN(n) ? d : n;
    };
    switch (head) {
      case "wait":
        return { kind: "wait", ms: num(parts[1], 1e3) };
      case "walk":
        return { kind: "move", dx: num(parts[1], 200), dy: 0, ms: num(parts[2], 3e3) };
      case "move":
        return { kind: "move", dx: num(parts[1], 0), dy: num(parts[2], 0), ms: num(parts[3], 3e3) };
      case "wander":
        return { kind: "wander", ms: num(parts[1], 4e3) };
      case "pair":
        return { kind: "pair", name: ((_a = parts[1]) != null ? _a : "idle").toLowerCase() };
      case "chat": {
        const p = ((_b = parts[1]) != null ? _b : "sit").toLowerCase();
        return { kind: "chat", pose: p === "idle" || p === "stand" ? "idle" : "sit" };
      }
      case "video": {
        const rest = parts.slice(1);
        let walkAt;
        let walkMs;
        if (rest.length >= 3 && !isNaN(Number(rest[rest.length - 1])) && !isNaN(Number(rest[rest.length - 2]))) {
          walkMs = Number(rest.pop()) * 1e3;
          walkAt = Number(rest.pop()) * 1e3;
        }
        const path = rest.join(" ").trim();
        return path ? { kind: "video", path, walkAt, walkMs } : null;
      }
      case "face": {
        const d = ((_c = parts[1]) != null ? _c : "reset").toLowerCase();
        return { kind: "face", dir: d === "left" ? "left" : d === "right" ? "right" : "reset" };
      }
    }
    const target = this.resolveTarget(parts[0]);
    if (!target || parts.length < 2) return null;
    const verb = parts[1].toLowerCase();
    if (verb === "say") {
      if (target === "both") return null;
      const text = parts.slice(2).join(" ");
      return text ? { kind: "say", who: target, text } : null;
    }
    if (verb === "state") {
      const n = parts[2];
      return n ? { kind: "state", target, name: n.toLowerCase() } : null;
    }
    if (ANIM_MS[verb] !== void 0) return { kind: "anim", target, name: verb };
    return null;
  }
  async loadSettings() {
    var _a;
    const raw = (_a = await this.loadData()) != null ? _a : {};
    const { pets, animate, ...rest } = raw;
    const migrateChar = (who, base, src) => {
      const c = { ...base, ...src != null ? src : {} };
      if (!(src == null ? void 0 : src.states) || !String(src.states).trim()) {
        c.states = base.states;
        if (typeof (src == null ? void 0 : src.size) === "number" && src.size <= 120) c.size = base.size;
      }
      if (typeof c.states === "string" && !/\bsit\s*:/.test(c.states)) {
        c.states = (who === "B" ? "sit: assets/B-sit.png\nsit-talk: assets/B-sit-talk.png 2 4\n" : "sit: assets/A-sit.png\nsit-talk: assets/A-sit-talk.png 2 4\n") + c.states;
      }
      delete c.imagePath;
      return c;
    };
    const s = {
      ...DEFAULT_SETTINGS,
      ...rest,
      a: migrateChar("A", DEFAULT_SETTINGS.a, rest.a),
      b: migrateChar("B", DEFAULT_SETTINGS.b, rest.b)
    };
    if (animate !== void 0 && rest.idleAnimate === void 0) s.idleAnimate = !!animate;
    if (!rest.pairStates) s.pairStates = PAIR_STATES;
    if (typeof rest.pairSize !== "number") s.pairSize = 1;
    if (s.pairSize > 3) s.pairSize = 1;
    let actionsMigrated = false;
    if (typeof s.actionScript === "string" && !s.actionScript.includes("video assets/pair-stroll.mp4")) {
      let script = s.actionScript;
      script = script.replace(/# 坐下聊天再牵手[\s\S]*?(?=\n# |$)/, "");
      script = script.replace(/# 牵手到处逛逛[\s\S]*?(?=\n# |$)/, "");
      script = script.replace(/# 牵手散步[\s\S]*?(?=\n# |$)/, "");
      script = script.replace(/# 到处逛逛[\s\S]*?(?=\n# |$)/, "");
      s.actionScript = `# \u7275\u624B\u5230\u5904\u901B\u901B
video assets/pair-stroll.mp4

${script.trim()}
`;
      actionsMigrated = true;
    }
    if (typeof s.actionScript === "string" && !s.actionScript.includes("# \u7AD9\u7740\u804A\u5929")) {
      s.actionScript = `${s.actionScript.trim()}

# \u7AD9\u7740\u804A\u5929
chat idle
`;
      actionsMigrated = true;
    }
    if (Array.isArray(pets) && !rest.a) {
      const [p0, p1] = pets;
      if (p0) {
        s.a = migrateChar("A", DEFAULT_SETTINGS.a, p0);
        if (typeof p0.x === "number") s.x = p0.x;
        if (typeof p0.y === "number") s.y = p0.y;
      }
      if (p1) s.b = migrateChar("B", DEFAULT_SETTINGS.b, p1);
    }
    this.settings = s;
    this.rebuildStates();
    if (actionsMigrated) await this.saveData(s);
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async applySettings() {
    await this.saveSettings();
    this.rebuildStates();
    this.renderCouple();
    this.scheduleNext();
  }
  async applyScripts() {
    await this.saveSettings();
    await this.loadScripts();
  }
};
var PetSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  wideTextArea(containerEl, name, desc, get, set) {
    const st = new import_obsidian.Setting(containerEl).setName(name).setDesc(desc).addTextArea((t) => t.setValue(get()).onChange(set));
    st.settingEl.addClass("pet-setting-wide");
  }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const apply = () => this.plugin.applySettings();
    const applyScripts = () => this.plugin.applyScripts();
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("CP").setHeading();
    new import_obsidian.Setting(containerEl).setName("CP \u540D").addText(
      (t) => t.setValue(s.coupleName).onChange(async (v) => {
        s.coupleName = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A CP \u540D").addToggle(
      (tg) => tg.setValue(s.showCoupleName).onChange(async (v) => {
        s.showCoupleName = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u663E\u793A\u5404\u81EA\u540D\u5B57").addToggle(
      (tg) => tg.setValue(s.showNames).onChange(async (v) => {
        s.showNames = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u4E24\u4EBA\u95F4\u8DDD").setDesc("\u50CF\u7D20\uFF0C\u53EF\u4E3A\u8D1F\u6570").addSlider(
      (sl) => sl.setLimits(-40, 80, 2).setValue(s.gap).setDynamicTooltip().onChange(async (v) => {
        s.gap = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u4E2D\u95F4\u7B26\u53F7").setDesc("\u5355\u4EBA\u6A21\u5F0F\u4E0B\u663E\u793A\u5728\u4E24\u4EBA\u4E4B\u95F4\uFF0C\u7559\u7A7A\u4E0D\u663E\u793A").addText(
      (t) => t.setValue(s.linkSymbol).onChange(async (v) => {
        s.linkSymbol = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5F85\u673A\u547C\u5438\u52A8\u753B").addToggle(
      (tg) => tg.setValue(s.idleAnimate).onChange(async (v) => {
        s.idleAnimate = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u91CD\u7F6E\u4F4D\u7F6E").addButton(
      (b) => b.setButtonText("\u56DE\u5230\u5DE6\u4E0A\u89D2").onClick(async () => {
        s.x = 40;
        s.y = 120;
        await apply();
      })
    );
    this.charSection(containerEl, "A", s.a);
    this.charSection(containerEl, "B", s.b);
    new import_obsidian.Setting(containerEl).setName("\u53CC\u4EBA\u56FE\uFF08\u7275\u624B / \u62E5\u62B1\u7B49\uFF09").setHeading();
    new import_obsidian.Setting(containerEl).setName("\u53CC\u4EBA\u76F8\u5BF9\u5927\u5C0F").setDesc("\u76F8\u5BF9\u4E24\u4EBA\u7AD9\u7ACB\u8EAB\u9AD8\u7684\u500D\u6570\uFF0C1 \u8868\u793A\u548C\u5355\u4EBA\u7AD9\u7740\u4E00\u6837\u9AD8").addSlider(
      (sl) => sl.setLimits(0.5, 1.5, 0.05).setValue(s.pairSize > 3 ? 1 : s.pairSize).setDynamicTooltip().onChange(async (v) => {
        s.pairSize = v;
        await apply();
      })
    );
    this.wideTextArea(
      containerEl,
      "\u53CC\u4EBA\u72B6\u6001\u8868",
      "\u6BCF\u884C\u300C\u72B6\u6001\u540D: \u8DEF\u5F84 [\u5E27\u6570] [\u5E27\u7387]\u300D\u3002idle \u5FC5\u586B\uFF0Cwalk \u7528\u4E8E\u79FB\u52A8\u65F6\u3002\u52A8\u4F5C\u811A\u672C\u91CC\u7528 pair idle / pair walk / pair off\u3002",
      () => s.pairStates,
      async (v) => {
        s.pairStates = v;
        await apply();
      }
    );
    new import_obsidian.Setting(containerEl).setName("\u81EA\u52A8\u4E92\u52A8").setHeading();
    new import_obsidian.Setting(containerEl).setName("\u5F00\u542F").addToggle(
      (tg) => tg.setValue(s.autoPlay).onChange(async (v) => {
        s.autoPlay = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6700\u77ED\u95F4\u9694").setDesc("\u79D2").addSlider(
      (sl) => sl.setLimits(3, 300, 1).setValue(s.intervalMin).setDynamicTooltip().onChange(async (v) => {
        s.intervalMin = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6700\u957F\u95F4\u9694").setDesc("\u79D2").addSlider(
      (sl) => sl.setLimits(3, 600, 1).setValue(s.intervalMax).setDynamicTooltip().onChange(async (v) => {
        s.intervalMax = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5BF9\u8BDD\u6982\u7387").setDesc("\u81EA\u52A8\u89E6\u53D1\u65F6\u9009\u5BF9\u8BDD\u7684\u6982\u7387(%)").addSlider(
      (sl) => sl.setLimits(0, 100, 5).setValue(s.dialogueChance).setDynamicTooltip().onChange(async (v) => {
        s.dialogueChance = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5BF9\u8BDD").setHeading();
    new import_obsidian.Setting(containerEl).setName("\u4ECE\u7B14\u8BB0\u8BFB\u53D6").setDesc("\u5E93\u5185\u7B14\u8BB0\u8DEF\u5F84\uFF0C\u7559\u7A7A\u5219\u7528\u4E0B\u9762\u7684\u6587\u672C\u6846").addText(
      (t) => t.setPlaceholder("\u6A79\u7A46/\u5BF9\u8BDD.md").setValue(s.dialogueNote).onChange(async (v) => {
        s.dialogueNote = v;
        await applyScripts();
      })
    );
    this.wideTextArea(
      containerEl,
      "\u5BF9\u8BDD\u811A\u672C",
      "\u6BCF\u884C\u300CA: \u5185\u5BB9\u300D\u6216\u300CB: \u5185\u5BB9\u300D\uFF08\u4E5F\u53EF\u5199\u4EBA\u540D\uFF09\uFF0C\u7A7A\u884C\u5206\u9694\u4E0D\u540C\u5BF9\u8BDD\u3002\u70B9\u51FB\u548C\u5C0F\u81EA\u52A8\u4E92\u52A8\u4F1A\u968F\u673A\u62BD\u4E00\u6BB5\uFF0C\u4E00\u534A\u5750\u7740\u8BF4\u3001\u4E00\u534A\u7AD9\u7740\u8BF4\u3002",
      () => s.dialogueScript,
      async (v) => {
        s.dialogueScript = v;
        await applyScripts();
      }
    );
    new import_obsidian.Setting(containerEl).setName("\u52A8\u4F5C").setHeading();
    new import_obsidian.Setting(containerEl).setName("\u4ECE\u7B14\u8BB0\u8BFB\u53D6").setDesc("\u5E93\u5185\u7B14\u8BB0\u8DEF\u5F84\uFF0C\u7559\u7A7A\u5219\u7528\u4E0B\u9762\u7684\u6587\u672C\u6846").addText(
      (t) => t.setPlaceholder("\u6A79\u7A46/\u52A8\u4F5C.md").setValue(s.actionNote).onChange(async (v) => {
        s.actionNote = v;
        await applyScripts();
      })
    );
    this.wideTextArea(
      containerEl,
      "\u52A8\u4F5C\u811A\u672C",
      "\u300C# \u540D\u79F0\u300D\u5B9A\u4E49\u52A8\u4F5C\u3002video \u8DEF\u5F84 \u64AD\u653E\u89C6\u9891\u3002chat idle \u7AD9\u7740\u968F\u673A\u8BF4\u4E00\u6BB5\u5BF9\u8BDD\uFF1Bchat sit \u5750\u7740\u8BF4\u3002",
      () => s.actionScript,
      async (v) => {
        s.actionScript = v;
        await applyScripts();
      }
    );
  }
  charSection(containerEl, who, c) {
    const apply = () => this.plugin.applySettings();
    new import_obsidian.Setting(containerEl).setName(`\u89D2\u8272 ${who}\uFF1A${c.name}`).setHeading();
    new import_obsidian.Setting(containerEl).setName("\u540D\u5B57").addText(
      (t) => t.setValue(c.name).onChange(async (v) => {
        c.name = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u9AD8\u5EA6").setDesc("\u4EBA\u7269\u8EAB\u9AD8\uFF08\u50CF\u7D20\uFF09\u3002\u5750\u4E0B\u3001\u8D70\u8DEF\u3001\u8BF4\u8BDD\u90FD\u6309\u53BB\u900F\u660E\u540E\u7684\u5B9E\u9645\u8F6E\u5ED3\u5BF9\u9F50\u5230\u8FD9\u4E2A\u9AD8\u5EA6\u3002").addSlider(
      (sl) => sl.setLimits(48, 320, 4).setValue(c.size).setDynamicTooltip().onChange(async (v) => {
        c.size = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u955C\u50CF\u7FFB\u8F6C").addToggle(
      (tg) => tg.setValue(c.flip).onChange(async (v) => {
        c.flip = v;
        await apply();
      })
    );
    this.wideTextArea(
      containerEl,
      "\u72B6\u6001\u8868",
      "\u6BCF\u884C\u300C\u72B6\u6001\u540D: \u8DEF\u5F84 [\u5E27\u6570] [\u5E27\u7387]\u300D\u3002\u4F8B\uFF1Aidle: assets/A-idle.png \uFF0F walk: assets/A-walk.png 6 8",
      () => c.states,
      async (v) => {
        c.states = v;
        await apply();
      }
    );
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgQXBwLCBNZW51LCBOb3RpY2UsIFBsdWdpbiwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZywgVEZpbGUsIG5vcm1hbGl6ZVBhdGggfSBmcm9tIFwib2JzaWRpYW5cIjtcblxudHlwZSBXaG8gPSBcIkFcIiB8IFwiQlwiO1xudHlwZSBUYXJnZXQgPSBXaG8gfCBcImJvdGhcIjtcbnR5cGUgRmFjaW5nID0gXCJsZWZ0XCIgfCBcInJpZ2h0XCIgfCBudWxsO1xuXG5pbnRlcmZhY2UgU3ByaXRlRGVmIHsgcGF0aDogc3RyaW5nOyBmcmFtZXM6IG51bWJlcjsgZnBzOiBudW1iZXI7IH1cbmludGVyZmFjZSBTcHJpdGVNZXRyaWNzIHtcbiAgaW1nVzogbnVtYmVyO1xuICBpbWdIOiBudW1iZXI7XG4gIGZyYW1lVzogbnVtYmVyO1xuICBieDogbnVtYmVyO1xuICBieTogbnVtYmVyO1xuICBidzogbnVtYmVyO1xuICBiaDogbnVtYmVyO1xufVxudHlwZSBTdGF0ZU1hcCA9IFJlY29yZDxzdHJpbmcsIFNwcml0ZURlZj47XG5jb25zdCBGQURFX01TID0gMTgwO1xuXG5pbnRlcmZhY2UgQ2hhcmFjdGVyIHtcbiAgbmFtZTogc3RyaW5nO1xuICBzaXplOiBudW1iZXI7XG4gIGZsaXA6IGJvb2xlYW47XG4gIHN0YXRlczogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgUGV0U2V0dGluZ3Mge1xuICBjb3VwbGVOYW1lOiBzdHJpbmc7XG4gIHNob3dDb3VwbGVOYW1lOiBib29sZWFuO1xuICBzaG93TmFtZXM6IGJvb2xlYW47XG4gIGE6IENoYXJhY3RlcjtcbiAgYjogQ2hhcmFjdGVyO1xuICBnYXA6IG51bWJlcjtcbiAgbGlua1N5bWJvbDogc3RyaW5nO1xuICBwYWlyU3RhdGVzOiBzdHJpbmc7XG4gIHBhaXJTaXplOiBudW1iZXI7XG4gIHg6IG51bWJlcjtcbiAgeTogbnVtYmVyO1xuICBpZGxlQW5pbWF0ZTogYm9vbGVhbjtcbiAgYXV0b1BsYXk6IGJvb2xlYW47XG4gIGludGVydmFsTWluOiBudW1iZXI7XG4gIGludGVydmFsTWF4OiBudW1iZXI7XG4gIGRpYWxvZ3VlQ2hhbmNlOiBudW1iZXI7XG4gIGRpYWxvZ3VlU2NyaXB0OiBzdHJpbmc7XG4gIGRpYWxvZ3VlTm90ZTogc3RyaW5nO1xuICBhY3Rpb25TY3JpcHQ6IHN0cmluZztcbiAgYWN0aW9uTm90ZTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRGlhbG9ndWVMaW5lIHsgd2hvOiBXaG87IHRleHQ6IHN0cmluZzsgfVxudHlwZSBEaWFsb2d1ZSA9IERpYWxvZ3VlTGluZVtdO1xuXG50eXBlIFN0ZXAgPVxuICB8IHsga2luZDogXCJ3YWl0XCI7IG1zOiBudW1iZXIgfVxuICB8IHsga2luZDogXCJtb3ZlXCI7IGR4OiBudW1iZXI7IGR5OiBudW1iZXI7IG1zOiBudW1iZXIgfVxuICB8IHsga2luZDogXCJ3YW5kZXJcIjsgbXM6IG51bWJlciB9XG4gIHwgeyBraW5kOiBcImFuaW1cIjsgdGFyZ2V0OiBUYXJnZXQ7IG5hbWU6IHN0cmluZyB9XG4gIHwgeyBraW5kOiBcInN0YXRlXCI7IHRhcmdldDogVGFyZ2V0OyBuYW1lOiBzdHJpbmcgfVxuICB8IHsga2luZDogXCJwYWlyXCI7IG5hbWU6IHN0cmluZyB9XG4gIHwgeyBraW5kOiBcInNheVwiOyB3aG86IFdobzsgdGV4dDogc3RyaW5nIH1cbiAgfCB7IGtpbmQ6IFwiZmFjZVwiOyBkaXI6IFwibGVmdFwiIHwgXCJyaWdodFwiIHwgXCJyZXNldFwiIH1cbiAgfCB7IGtpbmQ6IFwidmlkZW9cIjsgcGF0aDogc3RyaW5nOyB3YWxrQXQ/OiBudW1iZXI7IHdhbGtNcz86IG51bWJlciB9XG4gIHwgeyBraW5kOiBcImNoYXRcIjsgcG9zZTogXCJzaXRcIiB8IFwiaWRsZVwiIH07XG5cbmludGVyZmFjZSBBY3Rpb24geyBuYW1lOiBzdHJpbmc7IHN0ZXBzOiBTdGVwW107IH1cblxuY29uc3QgQU5JTV9NUzogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHtcbiAganVtcDogNjAwLCBib3VuY2U6IDgwMCwgc2hha2U6IDUwMCwgc3BpbjogODAwLCB3aWdnbGU6IDYwMCwgbm9kOiA2MDAsXG59O1xuXG5jb25zdCBERUZBVUxUX0RJQUxPR1VFID0gYEE6IFx1NEY2MFx1NTcyOFx1NTE5OVx1NEVDMFx1NEU0OFx1NTQ0MFx1RkYxRlxuQjogXHU0RUNBXHU1OTI5XHU3Njg0XHU3QjE0XHU4QkIwXHVGRjBDXHU1MjJCXHU1MDc3XHU3NzBCXHUzMDAyXG5BOiBcdTVDMzFcdTc3MEJcdTRFMDBcdTc3M0NcdTU2MUJcdTMwMDJgO1xuXG5jb25zdCBERUZBVUxUX0FDVElPTlMgPSBgIyBcdTcyNzVcdTYyNEJcdTUyMzBcdTU5MDRcdTkwMUJcdTkwMUJcbnZpZGVvIGFzc2V0cy9wYWlyLXN0cm9sbC5tcDRcblxuIyBcdTdBRDlcdTc3NDBcdTgwNEFcdTU5MjlcbmNoYXQgaWRsZVxuXG4jIFx1OEU2Nlx1OERGNlxuQSBqdW1wXG53YWl0IDI1MFxuQiBqdW1wXG53YWl0IDI1MFxuYm90aCBib3VuY2VcblxuIyBcdTY0OTJcdTVBMDdcbkEgc2hha2VcbkEgc2F5IFx1OTY2QVx1NjIxMVx1NzNBOX5cbndhaXQgMTUwMFxuQiBub2RcbkIgc2F5IFx1NTk3RFx1NTk3RFx1NTk3RGA7XG5cbmNvbnN0IEFfU1RBVEVTID0gYHNpdDogYXNzZXRzL0Etc2l0LnBuZ1xuc2l0LXRhbGs6IGFzc2V0cy9BLXNpdC10YWxrLnBuZyAyIDRcbmlkbGU6IGFzc2V0cy9BLWlkbGUucG5nXG53YWxrOiBhc3NldHMvQS13YWxrLnBuZyA2IDhgO1xuXG5jb25zdCBCX1NUQVRFUyA9IGBzaXQ6IGFzc2V0cy9CLXNpdC5wbmdcbnNpdC10YWxrOiBhc3NldHMvQi1zaXQtdGFsay5wbmcgMiA0XG5pZGxlOiBhc3NldHMvQi1pZGxlLnBuZ1xud2FsazogYXNzZXRzL0Itd2Fsay5wbmcgNiA4YDtcblxuY29uc3QgUEFJUl9TVEFURVMgPSBgaWRsZTogYXNzZXRzL3BhaXItaG9sZC5wbmdcbndhbGs6IGFzc2V0cy9wYWlyLXdhbGsucG5nIDYgOGA7XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1M6IFBldFNldHRpbmdzID0ge1xuICBjb3VwbGVOYW1lOiBcIlx1NkE3OVx1N0E0NlwiLFxuICBzaG93Q291cGxlTmFtZTogdHJ1ZSxcbiAgc2hvd05hbWVzOiB0cnVlLFxuICBhOiB7IG5hbWU6IFwiXHU4MDAxXHU1OTg4XHU1OTg4XCIsIHNpemU6IDIwMCwgZmxpcDogZmFsc2UsIHN0YXRlczogQV9TVEFURVMgfSxcbiAgYjogeyBuYW1lOiBcIlx1ODAwMVx1NzIzOFx1NzIzOFwiLCBzaXplOiAyMDAsIGZsaXA6IGZhbHNlLCBzdGF0ZXM6IEJfU1RBVEVTIH0sXG4gIGdhcDogLTgsXG4gIGxpbmtTeW1ib2w6IFwiXHUyNjY1XCIsXG4gIHBhaXJTdGF0ZXM6IFBBSVJfU1RBVEVTLFxuICBwYWlyU2l6ZTogMSxcbiAgeDogMjAwLFxuICB5OiAyMDAsXG4gIGlkbGVBbmltYXRlOiB0cnVlLFxuICBhdXRvUGxheTogdHJ1ZSxcbiAgaW50ZXJ2YWxNaW46IDIwLFxuICBpbnRlcnZhbE1heDogNjAsXG4gIGRpYWxvZ3VlQ2hhbmNlOiA2MCxcbiAgZGlhbG9ndWVTY3JpcHQ6IERFRkFVTFRfRElBTE9HVUUsXG4gIGRpYWxvZ3VlTm90ZTogXCJcIixcbiAgYWN0aW9uU2NyaXB0OiBERUZBVUxUX0FDVElPTlMsXG4gIGFjdGlvbk5vdGU6IFwiXCIsXG59O1xuXG5jb25zdCBXSE9TOiBXaG9bXSA9IFtcIkFcIiwgXCJCXCJdO1xuY29uc3QgcGljayA9IDxUPihhcnI6IFRbXSk6IFQgPT4gYXJyW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGFyci5sZW5ndGgpXTtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgUGV0UGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgc2V0dGluZ3M6IFBldFNldHRpbmdzO1xuXG4gIGNvdXBsZUVsOiBIVE1MRGl2RWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBjaGFyRWxzOiBSZWNvcmQ8V2hvLCBIVE1MRWxlbWVudCB8IG51bGw+ID0geyBBOiBudWxsLCBCOiBudWxsIH07XG4gIGJvZHlFbHM6IFJlY29yZDxXaG8sIEhUTUxFbGVtZW50IHwgbnVsbD4gPSB7IEE6IG51bGwsIEI6IG51bGwgfTtcbiAgc3ByaXRlRWxzOiBSZWNvcmQ8V2hvLCBIVE1MRWxlbWVudCB8IG51bGw+ID0geyBBOiBudWxsLCBCOiBudWxsIH07XG4gIGJ1YmJsZUVsczogUmVjb3JkPFdobywgSFRNTEVsZW1lbnQgfCBudWxsPiA9IHsgQTogbnVsbCwgQjogbnVsbCB9O1xuICBidWJibGVUaW1lcnM6IFJlY29yZDxXaG8sIG51bWJlciB8IG51bGw+ID0geyBBOiBudWxsLCBCOiBudWxsIH07XG5cbiAgcGFpckVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwYWlyQm9keUVsOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuICBwYWlyU3ByaXRlRWw6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGNsaXBFbDogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcbiAgY2xpcFZpZGVvOiBIVE1MVmlkZW9FbGVtZW50IHwgbnVsbCA9IG51bGw7XG4gIGNsaXBSYWYgPSAwO1xuICBwYWlyQnViYmxlRWxzOiBSZWNvcmQ8V2hvLCBIVE1MRWxlbWVudCB8IG51bGw+ID0geyBBOiBudWxsLCBCOiBudWxsIH07XG5cbiAgc3RhdGVNYXBzOiBSZWNvcmQ8V2hvLCBTdGF0ZU1hcD4gPSB7IEE6IHt9LCBCOiB7fSB9O1xuICBwYWlyU3RhdGVNYXA6IFN0YXRlTWFwID0ge307XG4gIGN1clN0YXRlOiBSZWNvcmQ8V2hvLCBzdHJpbmc+ID0geyBBOiBcIlwiLCBCOiBcIlwiIH07XG4gIHBhaXJNb2RlID0gZmFsc2U7XG4gIGN1clBhaXIgPSBcIlwiO1xuICBtZXRyaWNzQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgU3ByaXRlTWV0cmljcz4oKTtcbiAgbWV0cmljc1dhaXQgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxTcHJpdGVNZXRyaWNzPj4oKTtcblxuICBkaWFsb2d1ZXM6IERpYWxvZ3VlW10gPSBbXTtcbiAgYWN0aW9uczogQWN0aW9uW10gPSBbXTtcblxuICBydW5JZCA9IDA7XG4gIGJ1c3kgPSBmYWxzZTtcbiAgZHJhZ2dpbmcgPSBmYWxzZTtcbiAgZmFjaW5nOiBGYWNpbmcgPSBudWxsO1xuICBuZXh0QXQgPSAwO1xuXG4gIGFzeW5jIG9ubG9hZCgpIHtcbiAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjcmlwdHMoKTtcbiAgICB0aGlzLmFkZFNldHRpbmdUYWIobmV3IFBldFNldHRpbmdUYWIodGhpcy5hcHAsIHRoaXMpKTtcblxuICAgIHRoaXMuYXBwLndvcmtzcGFjZS5vbkxheW91dFJlYWR5KCgpID0+IHtcbiAgICAgIHRoaXMucmVuZGVyQ291cGxlKCk7XG4gICAgICB0aGlzLnNjaGVkdWxlTmV4dCgpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yZWdpc3RlckludGVydmFsKHdpbmRvdy5zZXRJbnRlcnZhbCgoKSA9PiB0aGlzLnRpY2soKSwgMTAwMCkpO1xuICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudCh3aW5kb3csIFwicmVzaXplXCIsICgpID0+IHRoaXMuY2xhbXBJbnRvVmlldygpKTtcblxuICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKFwibW9kaWZ5XCIsIChmKSA9PiB7XG4gICAgICAgIGNvbnN0IHdhdGNoZWQgPSBbdGhpcy5zZXR0aW5ncy5kaWFsb2d1ZU5vdGUsIHRoaXMuc2V0dGluZ3MuYWN0aW9uTm90ZV1cbiAgICAgICAgICAubWFwKChwKSA9PiBwLnRyaW0oKSkuZmlsdGVyKEJvb2xlYW4pLm1hcCgocCkgPT4gbm9ybWFsaXplUGF0aChwKSk7XG4gICAgICAgIGlmICh3YXRjaGVkLmluY2x1ZGVzKGYucGF0aCkpIHRoaXMubG9hZFNjcmlwdHMoKTtcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRoaXMuYWRkQ29tbWFuZCh7IGlkOiBcInRvZ2dsZS1wZXRcIiwgbmFtZTogXCJcdTY2M0VcdTc5M0EgLyBcdTk2OTBcdTg1Q0ZcIiwgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmNvdXBsZUVsKSB0aGlzLmRlc3Ryb3lDb3VwbGUoKTsgZWxzZSB0aGlzLnJlbmRlckNvdXBsZSgpO1xuICAgIH19KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJyYW5kb20tZGlhbG9ndWVcIiwgbmFtZTogXCJcdTk2OEZcdTY3M0FcdTVCRjlcdThCRERcIiwgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmRpYWxvZ3Vlcy5sZW5ndGgpIHRoaXMucnVuRGlhbG9ndWUocGljayh0aGlzLmRpYWxvZ3VlcykpO1xuICAgIH19KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJyYW5kb20tYWN0aW9uXCIsIG5hbWU6IFwiXHU5NjhGXHU2NzNBXHU1MkE4XHU0RjVDXCIsIGNhbGxiYWNrOiAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5hY3Rpb25zLmxlbmd0aCkgdGhpcy5ydW5BY3Rpb24ocGljayh0aGlzLmFjdGlvbnMpKTtcbiAgICB9fSk7XG4gICAgdGhpcy5hZGRDb21tYW5kKHsgaWQ6IFwic3RvcFwiLCBuYW1lOiBcIlx1NTA1Q1x1NkI2Mlx1NUY1M1x1NTI0RFx1NTJBOFx1NEY1Q1wiLCBjYWxsYmFjazogKCkgPT4gdGhpcy5jYW5jZWwoKSB9KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJ0b2dnbGUtYXV0b1wiLCBuYW1lOiBcIlx1NUYwMFx1NTE3M1x1ODFFQVx1NTJBOFx1NEU5Mlx1NTJBOFwiLCBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgdGhpcy5zZXR0aW5ncy5hdXRvUGxheSA9ICF0aGlzLnNldHRpbmdzLmF1dG9QbGF5O1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICAgIG5ldyBOb3RpY2UoYFx1ODFFQVx1NTJBOFx1NEU5Mlx1NTJBOFx1RkYxQSR7dGhpcy5zZXR0aW5ncy5hdXRvUGxheSA/IFwiXHU1RjAwXCIgOiBcIlx1NTE3M1wifWApO1xuICAgIH19KTtcbiAgICB0aGlzLmFkZENvbW1hbmQoeyBpZDogXCJyZWxvYWQtc2NyaXB0c1wiLCBuYW1lOiBcIlx1OTFDRFx1NjVCMFx1OEJGQlx1NTNENlx1NUJGOVx1OEJERCAvIFx1NTJBOFx1NEY1Q1x1ODExQVx1NjcyQ1wiLCBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgYXdhaXQgdGhpcy5sb2FkU2NyaXB0cygpO1xuICAgICAgbmV3IE5vdGljZShgXHU1REYyXHU4QkZCXHU1M0Q2ICR7dGhpcy5kaWFsb2d1ZXMubGVuZ3RofSBcdTZCQjVcdTVCRjlcdThCRERcdUZGMEMke3RoaXMuYWN0aW9ucy5sZW5ndGh9IFx1NEUyQVx1NTJBOFx1NEY1Q2ApO1xuICAgIH19KTtcbiAgfVxuXG4gIG9udW5sb2FkKCkge1xuICAgIHRoaXMuZGVzdHJveUNvdXBsZSgpO1xuICB9XG5cbiAgcmVuZGVyQ291cGxlKCkge1xuICAgIHRoaXMuZGVzdHJveUNvdXBsZSgpO1xuICAgIGNvbnN0IHMgPSB0aGlzLnNldHRpbmdzO1xuXG4gICAgY29uc3QgZWwgPSBkb2N1bWVudC5ib2R5LmNyZWF0ZURpdih7IGNsczogXCJwZXQtY291cGxlXCIgfSk7XG4gICAgZWwuc3R5bGUubGVmdCA9IGAke3MueH1weGA7XG4gICAgZWwuc3R5bGUudG9wID0gYCR7cy55fXB4YDtcbiAgICBpZiAocy5pZGxlQW5pbWF0ZSkgZWwuYWRkQ2xhc3MoXCJwZXQtaWRsZVwiKTtcblxuICAgIGNvbnN0IHJvdyA9IGVsLmNyZWF0ZURpdih7IGNsczogXCJwZXQtcm93XCIgfSk7XG4gICAgcm93LnN0eWxlLmdhcCA9IGAke3MuZ2FwfXB4YDtcbiAgICB0aGlzLmNyZWF0ZUNoYXIocm93LCBcIkFcIik7XG4gICAgaWYgKHMubGlua1N5bWJvbC50cmltKCkpIHJvdy5jcmVhdGVEaXYoeyBjbHM6IFwicGV0LWxpbmtcIiwgdGV4dDogcy5saW5rU3ltYm9sLnRyaW0oKSB9KTtcbiAgICB0aGlzLmNyZWF0ZUNoYXIocm93LCBcIkJcIik7XG4gICAgdGhpcy5jcmVhdGVQYWlyKHJvdyk7XG5cbiAgICBpZiAocy5zaG93Q291cGxlTmFtZSAmJiBzLmNvdXBsZU5hbWUudHJpbSgpKSB7XG4gICAgICBlbC5jcmVhdGVEaXYoeyBjbHM6IFwicGV0LWNvdXBsZS1uYW1lXCIsIHRleHQ6IHMuY291cGxlTmFtZS50cmltKCkgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5lbmFibGVEcmFnKGVsKTtcbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoZWwsIFwiY29udGV4dG1lbnVcIiwgKGU6IE1vdXNlRXZlbnQpID0+IHRoaXMuc2hvd01lbnUoZSkpO1xuXG4gICAgdGhpcy5jb3VwbGVFbCA9IGVsO1xuICAgIFdIT1MuZm9yRWFjaCgodykgPT4gdGhpcy5zZXRTdGF0ZSh3LCB0aGlzLnJlc3ROYW1lKHcpKSk7XG4gICAgdGhpcy51cGRhdGVGYWNpbmcoKTtcbiAgICB0aGlzLmNsYW1wSW50b1ZpZXcoKTtcbiAgfVxuXG4gIGNyZWF0ZUNoYXIocGFyZW50OiBIVE1MRWxlbWVudCwgd2hvOiBXaG8pIHtcbiAgICBjb25zdCBjID0gd2hvID09PSBcIkFcIiA/IHRoaXMuc2V0dGluZ3MuYSA6IHRoaXMuc2V0dGluZ3MuYjtcbiAgICBjb25zdCBjaGFyID0gcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJwZXQtY2hhclwiIH0pO1xuICAgIGNvbnN0IGJvZHkgPSBjaGFyLmNyZWF0ZURpdih7IGNsczogXCJwZXQtYm9keVwiIH0pO1xuXG4gICAgaWYgKHRoaXMuc2V0dGluZ3Muc2hvd05hbWVzKSBjaGFyLmNyZWF0ZURpdih7IGNsczogXCJwZXQtbmFtZVwiLCB0ZXh0OiBjLm5hbWUgfSk7XG4gICAgdGhpcy5idWJibGVFbHNbd2hvXSA9IGNoYXIuY3JlYXRlRGl2KHsgY2xzOiBcInBldC1idWJibGVcIiB9KTtcbiAgICB0aGlzLmNoYXJFbHNbd2hvXSA9IGNoYXI7XG4gICAgdGhpcy5ib2R5RWxzW3dob10gPSBib2R5O1xuICAgIHRoaXMuc3ByaXRlRWxzW3dob10gPSBudWxsO1xuICAgIHRoaXMuY3VyU3RhdGVbd2hvXSA9IFwiXCI7XG5cbiAgICB0aGlzLnJlZ2lzdGVyRG9tRXZlbnQoY2hhciwgXCJjbGlja1wiLCAoKSA9PiB0aGlzLm9uQ2xpY2tQZXQod2hvKSk7XG4gIH1cblxuICBjcmVhdGVQYWlyKHBhcmVudDogSFRNTEVsZW1lbnQpIHtcbiAgICBjb25zdCBwYWlyID0gcGFyZW50LmNyZWF0ZURpdih7IGNsczogXCJwZXQtcGFpclwiIH0pO1xuICAgIGNvbnN0IGJvZHkgPSBwYWlyLmNyZWF0ZURpdih7IGNsczogXCJwZXQtYm9keVwiIH0pO1xuICAgIHRoaXMucGFpckJ1YmJsZUVscy5BID0gcGFpci5jcmVhdGVEaXYoeyBjbHM6IFwicGV0LWJ1YmJsZSBwZXQtYnViYmxlLWFcIiB9KTtcbiAgICB0aGlzLnBhaXJCdWJibGVFbHMuQiA9IHBhaXIuY3JlYXRlRGl2KHsgY2xzOiBcInBldC1idWJibGUgcGV0LWJ1YmJsZS1iXCIgfSk7XG4gICAgdGhpcy5wYWlyRWwgPSBwYWlyO1xuICAgIHRoaXMucGFpckJvZHlFbCA9IGJvZHk7XG4gICAgdGhpcy5wYWlyU3ByaXRlRWwgPSBudWxsO1xuICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChwYWlyLCBcImNsaWNrXCIsICgpID0+IHRoaXMub25DbGlja1BldChcIkFcIikpO1xuICB9XG5cbiAgb25DbGlja1BldCh3aG86IFdobykge1xuICAgIGlmICh0aGlzLmRyYWdnaW5nIHx8IHRoaXMuY291cGxlRWw/Lmhhc0NsYXNzKFwicGV0LWRyYWdnaW5nXCIpKSByZXR1cm47XG4gICAgaWYgKHRoaXMuZGlhbG9ndWVzLmxlbmd0aCkgdGhpcy5ydW5EaWFsb2d1ZShwaWNrKHRoaXMuZGlhbG9ndWVzKSk7XG4gICAgZWxzZSB0aGlzLnBsYXlBbmltKHdobywgXCJqdW1wXCIsICsrdGhpcy5ydW5JZCk7XG4gIH1cblxuICBkZXN0cm95Q291cGxlKCkge1xuICAgIHRoaXMuY2FuY2VsKCk7XG4gICAgdGhpcy5jb3VwbGVFbD8ucmVtb3ZlKCk7XG4gICAgdGhpcy5jb3VwbGVFbCA9IG51bGw7XG4gICAgdGhpcy5wYWlyRWwgPSB0aGlzLnBhaXJCb2R5RWwgPSB0aGlzLnBhaXJTcHJpdGVFbCA9IHRoaXMuY2xpcEVsID0gdGhpcy5jbGlwVmlkZW8gPSBudWxsO1xuICAgIHRoaXMuY2xpcFJhZiA9IDA7XG4gICAgV0hPUy5mb3JFYWNoKCh3KSA9PiB7XG4gICAgICB0aGlzLmNoYXJFbHNbd10gPSB0aGlzLmJvZHlFbHNbd10gPSB0aGlzLmJ1YmJsZUVsc1t3XSA9IG51bGw7XG4gICAgICB0aGlzLnNwcml0ZUVsc1t3XSA9IHRoaXMucGFpckJ1YmJsZUVsc1t3XSA9IG51bGw7XG4gICAgfSk7XG4gIH1cblxuICBzaG93TWVudShlOiBNb3VzZUV2ZW50KSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGNvbnN0IG1lbnUgPSBuZXcgTWVudSgpO1xuICAgIHRoaXMuYWN0aW9ucy5mb3JFYWNoKChhKSA9PlxuICAgICAgbWVudS5hZGRJdGVtKChpKSA9PiBpLnNldFRpdGxlKGBcdTUyQThcdTRGNUNcdUZGMUEke2EubmFtZX1gKS5zZXRJY29uKFwicGxheVwiKS5vbkNsaWNrKCgpID0+IHRoaXMucnVuQWN0aW9uKGEpKSlcbiAgICApO1xuICAgIGlmICh0aGlzLmFjdGlvbnMubGVuZ3RoICYmIHRoaXMuZGlhbG9ndWVzLmxlbmd0aCkgbWVudS5hZGRTZXBhcmF0b3IoKTtcbiAgICB0aGlzLmRpYWxvZ3Vlcy5mb3JFYWNoKChkKSA9PlxuICAgICAgbWVudS5hZGRJdGVtKChpKSA9PlxuICAgICAgICBpLnNldFRpdGxlKGBcdTVCRjlcdThCRERcdUZGMUEke2RbMF0udGV4dC5zbGljZSgwLCAxNCl9YCkuc2V0SWNvbihcIm1lc3NhZ2UtY2lyY2xlXCIpLm9uQ2xpY2soKCkgPT4gdGhpcy5ydW5EaWFsb2d1ZShkKSlcbiAgICAgIClcbiAgICApO1xuICAgIG1lbnUuYWRkU2VwYXJhdG9yKCk7XG4gICAgbWVudS5hZGRJdGVtKChpKSA9PiBpLnNldFRpdGxlKFwiXHU1MDVDXHU0RTBCXCIpLnNldEljb24oXCJzcXVhcmVcIikub25DbGljaygoKSA9PiB0aGlzLmNhbmNlbCgpKSk7XG4gICAgbWVudS5hZGRJdGVtKChpKSA9PiBpLnNldFRpdGxlKFwiXHU5NjkwXHU4NUNGXCIpLnNldEljb24oXCJleWUtb2ZmXCIpLm9uQ2xpY2soKCkgPT4gdGhpcy5kZXN0cm95Q291cGxlKCkpKTtcbiAgICBtZW51LnNob3dBdE1vdXNlRXZlbnQoZSk7XG4gIH1cblxuICBtZXRyaWNzS2V5KGRlZjogU3ByaXRlRGVmKTogc3RyaW5nIHtcbiAgICByZXR1cm4gYCR7bm9ybWFsaXplUGF0aChkZWYucGF0aCl9fCR7ZGVmLmZyYW1lc31gO1xuICB9XG5cbiAgZ2V0TWV0cmljcyhkZWY6IFNwcml0ZURlZik6IFByb21pc2U8U3ByaXRlTWV0cmljcz4ge1xuICAgIGNvbnN0IGtleSA9IHRoaXMubWV0cmljc0tleShkZWYpO1xuICAgIGNvbnN0IGhpdCA9IHRoaXMubWV0cmljc0NhY2hlLmdldChrZXkpO1xuICAgIGlmIChoaXQpIHJldHVybiBQcm9taXNlLnJlc29sdmUoaGl0KTtcbiAgICBjb25zdCBwZW5kaW5nID0gdGhpcy5tZXRyaWNzV2FpdC5nZXQoa2V5KTtcbiAgICBpZiAocGVuZGluZykgcmV0dXJuIHBlbmRpbmc7XG5cbiAgICBjb25zdCB1cmwgPSB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmdldFJlc291cmNlUGF0aChub3JtYWxpemVQYXRoKGRlZi5wYXRoKSk7XG4gICAgY29uc3Qgam9iID0gbmV3IFByb21pc2U8U3ByaXRlTWV0cmljcz4oKHJlc29sdmUpID0+IHtcbiAgICAgIGNvbnN0IGltZyA9IG5ldyBJbWFnZSgpO1xuICAgICAgaW1nLm9ubG9hZCA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgbSA9IHRoaXMubWVhc3VyZVNwcml0ZShpbWcsIGRlZi5mcmFtZXMpO1xuICAgICAgICB0aGlzLm1ldHJpY3NDYWNoZS5zZXQoa2V5LCBtKTtcbiAgICAgICAgdGhpcy5tZXRyaWNzV2FpdC5kZWxldGUoa2V5KTtcbiAgICAgICAgcmVzb2x2ZShtKTtcbiAgICAgIH07XG4gICAgICBpbWcub25lcnJvciA9ICgpID0+IHtcbiAgICAgICAgY29uc3QgbTogU3ByaXRlTWV0cmljcyA9IHsgaW1nVzogMSwgaW1nSDogMSwgZnJhbWVXOiAxLCBieDogMCwgYnk6IDAsIGJ3OiAxLCBiaDogMSB9O1xuICAgICAgICB0aGlzLm1ldHJpY3NDYWNoZS5zZXQoa2V5LCBtKTtcbiAgICAgICAgdGhpcy5tZXRyaWNzV2FpdC5kZWxldGUoa2V5KTtcbiAgICAgICAgcmVzb2x2ZShtKTtcbiAgICAgIH07XG4gICAgICBpbWcuc3JjID0gdXJsO1xuICAgIH0pO1xuICAgIHRoaXMubWV0cmljc1dhaXQuc2V0KGtleSwgam9iKTtcbiAgICByZXR1cm4gam9iO1xuICB9XG5cbiAgbWVhc3VyZVNwcml0ZShpbWc6IEhUTUxJbWFnZUVsZW1lbnQsIGZyYW1lczogbnVtYmVyKTogU3ByaXRlTWV0cmljcyB7XG4gICAgY29uc3QgaW1nVyA9IGltZy5uYXR1cmFsV2lkdGggfHwgMTtcbiAgICBjb25zdCBpbWdIID0gaW1nLm5hdHVyYWxIZWlnaHQgfHwgMTtcbiAgICBjb25zdCBuID0gTWF0aC5tYXgoMSwgZnJhbWVzKTtcbiAgICBjb25zdCBmcmFtZVcgPSBpbWdXIC8gbjtcbiAgICBjb25zdCBmYWxsYmFjazogU3ByaXRlTWV0cmljcyA9IHsgaW1nVywgaW1nSCwgZnJhbWVXLCBieDogMCwgYnk6IDAsIGJ3OiBmcmFtZVcsIGJoOiBpbWdIIH07XG4gICAgY29uc3QgdyA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoZnJhbWVXKSk7XG4gICAgY29uc3QgaCA9IE1hdGgubWF4KDEsIGltZ0gpO1xuICAgIGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJjYW52YXNcIik7XG4gICAgY2FudmFzLndpZHRoID0gdztcbiAgICBjYW52YXMuaGVpZ2h0ID0gaDtcbiAgICBjb25zdCBjdHggPSBjYW52YXMuZ2V0Q29udGV4dChcIjJkXCIsIHsgd2lsbFJlYWRGcmVxdWVudGx5OiB0cnVlIH0pO1xuICAgIGlmICghY3R4KSByZXR1cm4gZmFsbGJhY2s7XG4gICAgdHJ5IHtcbiAgICAgIGN0eC5kcmF3SW1hZ2UoaW1nLCAwLCAwLCBmcmFtZVcsIGltZ0gsIDAsIDAsIHcsIGgpO1xuICAgICAgY29uc3QgZGF0YSA9IGN0eC5nZXRJbWFnZURhdGEoMCwgMCwgdywgaCkuZGF0YTtcbiAgICAgIGxldCBtaW5YID0gdywgbWluWSA9IGgsIG1heFggPSAwLCBtYXhZID0gMDtcbiAgICAgIGZvciAobGV0IHkgPSAwOyB5IDwgaDsgeSsrKSB7XG4gICAgICAgIGZvciAobGV0IHggPSAwOyB4IDwgdzsgeCsrKSB7XG4gICAgICAgICAgaWYgKGRhdGFbKHkgKiB3ICsgeCkgKiA0ICsgM10gPCAxNikgY29udGludWU7XG4gICAgICAgICAgaWYgKHggPCBtaW5YKSBtaW5YID0geDtcbiAgICAgICAgICBpZiAoeSA8IG1pblkpIG1pblkgPSB5O1xuICAgICAgICAgIGlmICh4ID4gbWF4WCkgbWF4WCA9IHg7XG4gICAgICAgICAgaWYgKHkgPiBtYXhZKSBtYXhZID0geTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKG1heFggPCBtaW5YKSByZXR1cm4gZmFsbGJhY2s7XG4gICAgICByZXR1cm4geyBpbWdXLCBpbWdILCBmcmFtZVcsIGJ4OiBtaW5YLCBieTogbWluWSwgYnc6IG1heFggLSBtaW5YICsgMSwgYmg6IG1heFkgLSBtaW5ZICsgMSB9O1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIGZhbGxiYWNrO1xuICAgIH1cbiAgfVxuXG4gIHBhaXJUYXJnZXRIZWlnaHQoKTogbnVtYmVyIHtcbiAgICBjb25zdCBzY2FsZSA9IHRoaXMuc2V0dGluZ3MucGFpclNpemUgPiAzID8gMSA6IHRoaXMuc2V0dGluZ3MucGFpclNpemU7XG4gICAgcmV0dXJuIE1hdGgubWF4KHRoaXMuc2V0dGluZ3MuYS5zaXplLCB0aGlzLnNldHRpbmdzLmIuc2l6ZSkgKiAoc2NhbGUgfHwgMSk7XG4gIH1cblxuICBtYWtlU3ByaXRlKGRlZjogU3ByaXRlRGVmLCB0YXJnZXRIOiBudW1iZXIpOiBIVE1MRWxlbWVudCB7XG4gICAgY29uc3QgZWwgPSBjcmVhdGVEaXYoeyBjbHM6IFwicGV0LXNwcml0ZVwiIH0pO1xuICAgIGNvbnN0IHVybCA9IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuZ2V0UmVzb3VyY2VQYXRoKG5vcm1hbGl6ZVBhdGgoZGVmLnBhdGgpKTtcbiAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSBgdXJsKFwiJHt1cmx9XCIpYDtcbiAgICBlbC5zdHlsZS5oZWlnaHQgPSBgJHt0YXJnZXRIfXB4YDtcbiAgICBlbC5zdHlsZS53aWR0aCA9IGAke01hdGgucm91bmQodGFyZ2V0SCAqIDAuNyl9cHhgO1xuICAgIHZvaWQgdGhpcy5sYXlvdXRTcHJpdGUoZWwsIGRlZiwgdGFyZ2V0SCk7XG4gICAgcmV0dXJuIGVsO1xuICB9XG5cbiAgYXN5bmMgbGF5b3V0U3ByaXRlKGVsOiBIVE1MRWxlbWVudCwgZGVmOiBTcHJpdGVEZWYsIHRhcmdldEg6IG51bWJlcikge1xuICAgIGNvbnN0IG0gPSBhd2FpdCB0aGlzLmdldE1ldHJpY3MoZGVmKTtcbiAgICBpZiAoIWVsLmlzQ29ubmVjdGVkKSByZXR1cm47XG4gICAgY29uc3QgYmggPSBNYXRoLm1heCgxLCBtLmJoKTtcbiAgICBjb25zdCBzY2FsZSA9IHRhcmdldEggLyBiaDtcbiAgICBjb25zdCB3ID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChtLmJ3ICogc2NhbGUpKTtcbiAgICBjb25zdCBoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChtLmJoICogc2NhbGUpKTtcbiAgICBlbC5zdHlsZS53aWR0aCA9IGAke3d9cHhgO1xuICAgIGVsLnN0eWxlLmhlaWdodCA9IGAke2h9cHhgO1xuICAgIGVsLnN0eWxlLmJhY2tncm91bmRTaXplID0gYCR7bS5pbWdXICogc2NhbGV9cHggJHttLmltZ0ggKiBzY2FsZX1weGA7XG4gICAgY29uc3QgeDAgPSAtbS5ieCAqIHNjYWxlO1xuICAgIGNvbnN0IHkwID0gLW0uYnkgKiBzY2FsZTtcbiAgICBlbC5zdHlsZS5iYWNrZ3JvdW5kUG9zaXRpb24gPSBgJHt4MH1weCAke3kwfXB4YDtcbiAgICBlbC5nZXRBbmltYXRpb25zKCkuZm9yRWFjaCgoYSkgPT4gYS5jYW5jZWwoKSk7XG4gICAgaWYgKGRlZi5mcmFtZXMgPiAxKSB7XG4gICAgICBlbC5hbmltYXRlKFxuICAgICAgICBbXG4gICAgICAgICAgeyBiYWNrZ3JvdW5kUG9zaXRpb246IGAke3gwfXB4ICR7eTB9cHhgIH0sXG4gICAgICAgICAgeyBiYWNrZ3JvdW5kUG9zaXRpb246IGAke3gwIC0gbS5mcmFtZVcgKiBkZWYuZnJhbWVzICogc2NhbGV9cHggJHt5MH1weGAgfSxcbiAgICAgICAgXSxcbiAgICAgICAge1xuICAgICAgICAgIGR1cmF0aW9uOiAoZGVmLmZyYW1lcyAvIE1hdGgubWF4KDEsIGRlZi5mcHMpKSAqIDEwMDAsXG4gICAgICAgICAgaXRlcmF0aW9uczogSW5maW5pdHksXG4gICAgICAgICAgZWFzaW5nOiBgc3RlcHMoJHtkZWYuZnJhbWVzfSwgZW5kKWAsXG4gICAgICAgIH1cbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgaXNNb3V0aFN3aXRjaChmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBjb25zdCBtb3V0aCA9IChzOiBzdHJpbmcpID0+IHMgPT09IFwic2l0LXRhbGtcIiB8fCBzID09PSBcInRhbGtcIjtcbiAgICBjb25zdCByZXN0ID0gKHM6IHN0cmluZykgPT4gcyA9PT0gXCJzaXRcIiB8fCBzID09PSBcImlkbGVcIjtcbiAgICByZXR1cm4gKG1vdXRoKGZyb20pICYmIHJlc3QodG8pKSB8fCAocmVzdChmcm9tKSAmJiBtb3V0aCh0bykpO1xuICB9XG5cbiAgc3dhcFNwcml0ZShib2R5OiBIVE1MRWxlbWVudCwgcHJldjogSFRNTEVsZW1lbnQgfCBudWxsLCBkZWY6IFNwcml0ZURlZiwgdGFyZ2V0SDogbnVtYmVyLCBmYWRlOiBib29sZWFuKTogSFRNTEVsZW1lbnQge1xuICAgIGNvbnN0IHNwID0gdGhpcy5tYWtlU3ByaXRlKGRlZiwgdGFyZ2V0SCk7XG4gICAgaWYgKGZhZGUgJiYgcHJldikgc3Auc3R5bGUub3BhY2l0eSA9IFwiMFwiO1xuICAgIGJvZHkuYXBwZW5kQ2hpbGQoc3ApO1xuICAgIGlmIChmYWRlICYmIHByZXYpIHtcbiAgICAgIHByZXYuYWRkQ2xhc3MoXCJwZXQtbGVhdmluZ1wiKTtcbiAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG4gICAgICAgIHNwLnN0eWxlLm9wYWNpdHkgPSBcIjFcIjtcbiAgICAgICAgcHJldi5zdHlsZS5vcGFjaXR5ID0gXCIwXCI7XG4gICAgICB9KTtcbiAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IHByZXYucmVtb3ZlKCksIEZBREVfTVMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcmV2Py5yZW1vdmUoKTtcbiAgICB9XG4gICAgcmV0dXJuIHNwO1xuICB9XG5cbiAgcmVzdE5hbWUod2hvOiBXaG8pOiBzdHJpbmcge1xuICAgIGNvbnN0IG1hcCA9IHRoaXMuc3RhdGVNYXBzW3dob107XG4gICAgaWYgKG1hcFtcInNpdFwiXSkgcmV0dXJuIFwic2l0XCI7XG4gICAgaWYgKG1hcFtcImlkbGVcIl0pIHJldHVybiBcImlkbGVcIjtcbiAgICByZXR1cm4gXCJzaXRcIjtcbiAgfVxuXG4gIHNpdHRpbmcod2hvOiBXaG8pOiBib29sZWFuIHtcbiAgICBjb25zdCBzID0gdGhpcy5jdXJTdGF0ZVt3aG9dO1xuICAgIHJldHVybiBzID09PSBcInNpdFwiIHx8IHMgPT09IFwic2l0LXRhbGtcIiB8fCBzID09PSBcInNpdGRvd25cIiB8fCBzID09PSBcIlwiO1xuICB9XG5cbiAgcG9zZVJlc3Qod2hvOiBXaG8pOiBzdHJpbmcge1xuICAgIGNvbnN0IG1hcCA9IHRoaXMuc3RhdGVNYXBzW3dob107XG4gICAgaWYgKHRoaXMuc2l0dGluZyh3aG8pKSB7XG4gICAgICBpZiAobWFwW1wic2l0XCJdKSByZXR1cm4gXCJzaXRcIjtcbiAgICB9XG4gICAgaWYgKG1hcFtcImlkbGVcIl0pIHJldHVybiBcImlkbGVcIjtcbiAgICBpZiAobWFwW1wic2l0XCJdKSByZXR1cm4gXCJzaXRcIjtcbiAgICByZXR1cm4gXCJpZGxlXCI7XG4gIH1cbiAgXG4gIHRhbGtOYW1lKHdobzogV2hvKTogc3RyaW5nIHtcbiAgICBjb25zdCBtYXAgPSB0aGlzLnN0YXRlTWFwc1t3aG9dO1xuICAgIGlmICh0aGlzLnNpdHRpbmcod2hvKSkge1xuICAgICAgaWYgKG1hcFtcInNpdC10YWxrXCJdKSByZXR1cm4gXCJzaXQtdGFsa1wiO1xuICAgICAgaWYgKG1hcFtcInNpdFwiXSkgcmV0dXJuIFwic2l0XCI7XG4gICAgfVxuICAgIGlmIChtYXBbXCJ0YWxrXCJdKSByZXR1cm4gXCJ0YWxrXCI7XG4gICAgaWYgKG1hcFtcImlkbGVcIl0pIHJldHVybiBcImlkbGVcIjtcbiAgICBpZiAobWFwW1wic2l0LXRhbGtcIl0pIHJldHVybiBcInNpdC10YWxrXCI7XG4gICAgcmV0dXJuIHRoaXMucG9zZVJlc3Qod2hvKTtcbiAgfVxuICBcbiAgYmVnaW5UYWxrKHdobzogV2hvKSB7XG4gICAgaWYgKHRoaXMucGFpck1vZGUpIHJldHVybjtcbiAgICBXSE9TLmZvckVhY2goKHcpID0+IHRoaXMuc2V0U3RhdGUodywgdyA9PT0gd2hvID8gdGhpcy50YWxrTmFtZSh3KSA6IHRoaXMucG9zZVJlc3QodykpKTtcbiAgfVxuXG4gIHNldFN0YXRlKHdobzogV2hvLCBuYW1lOiBzdHJpbmcpIHtcbiAgICBjb25zdCBib2R5ID0gdGhpcy5ib2R5RWxzW3dob107XG4gICAgaWYgKCFib2R5KSByZXR1cm47XG4gICAgY29uc3QgYyA9IHdobyA9PT0gXCJBXCIgPyB0aGlzLnNldHRpbmdzLmEgOiB0aGlzLnNldHRpbmdzLmI7XG4gICAgY29uc3QgbWFwID0gdGhpcy5zdGF0ZU1hcHNbd2hvXTtcbiAgICBjb25zdCBrZXkgPSBtYXBbbmFtZV0gPyBuYW1lIDogbWFwW1wic2l0XCJdID8gXCJzaXRcIiA6IG1hcFtcImlkbGVcIl0gPyBcImlkbGVcIiA6IG51bGw7XG5cbiAgICBpZiAoa2V5ID09PSBudWxsKSB7XG4gICAgICBpZiAoIWJvZHkuY2hpbGRFbGVtZW50Q291bnQpIGJvZHkuY3JlYXRlRGl2KHsgY2xzOiBcInBldC1wbGFjZWhvbGRlclwiLCB0ZXh0OiBjLm5hbWUuc2xpY2UoMCwgMSkgfHwgd2hvIH0pO1xuICAgICAgdGhpcy5jdXJTdGF0ZVt3aG9dID0gXCJcIjtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKHRoaXMuY3VyU3RhdGVbd2hvXSA9PT0ga2V5ICYmIGJvZHkuY2hpbGRFbGVtZW50Q291bnQpIHJldHVybjtcblxuICAgIGNvbnN0IGZhZGUgPSAhIXRoaXMuc3ByaXRlRWxzW3dob10gJiYgIXRoaXMuaXNNb3V0aFN3aXRjaCh0aGlzLmN1clN0YXRlW3dob10sIGtleSk7XG4gICAgY29uc3QgcHJldiA9IHRoaXMuc3ByaXRlRWxzW3dob107XG4gICAgdGhpcy5jdXJTdGF0ZVt3aG9dID0ga2V5O1xuICAgIHRoaXMuc3ByaXRlRWxzW3dob10gPSB0aGlzLnN3YXBTcHJpdGUoYm9keSwgcHJldiwgbWFwW2tleV0sIGMuc2l6ZSwgZmFkZSk7XG4gICAgdGhpcy51cGRhdGVGYWNpbmcoKTtcbiAgfVxuXG4gIHNldFBhaXIobmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgZWwgPSB0aGlzLmNvdXBsZUVsO1xuICAgIGlmICghZWwgfHwgIXRoaXMucGFpckJvZHlFbCkgcmV0dXJuO1xuXG4gICAgaWYgKG5hbWUgPT09IFwib2ZmXCIpIHtcbiAgICAgIHRoaXMucGFpck1vZGUgPSBmYWxzZTtcbiAgICAgIHRoaXMuY3VyUGFpciA9IFwiXCI7XG4gICAgICBlbC5yZW1vdmVDbGFzcyhcInBldC1wYWlyLW1vZGVcIik7XG4gICAgICB0aGlzLnBhaXJCb2R5RWwuZW1wdHkoKTtcbiAgICAgIHRoaXMucGFpclNwcml0ZUVsID0gbnVsbDtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBtYXAgPSB0aGlzLnBhaXJTdGF0ZU1hcDtcbiAgICBjb25zdCBrZXkgPSBtYXBbbmFtZV0gPyBuYW1lIDogbWFwW1wiaWRsZVwiXSA/IFwiaWRsZVwiIDogbnVsbDtcbiAgICBpZiAoa2V5ID09PSBudWxsKSB7XG4gICAgICBjb25zb2xlLndhcm4oYFtwZXRdIFx1NkNBMVx1NjcwOVx1OTE0RFx1N0Y2RVx1NTNDQ1x1NEVCQVx1NzJCNlx1NjAwMSBcIiR7bmFtZX1cIlx1RkYwQ1x1OERGM1x1OEZDN2ApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAodGhpcy5wYWlyTW9kZSAmJiB0aGlzLmN1clBhaXIgPT09IGtleSkgcmV0dXJuO1xuXG4gICAgY29uc3QgZmFkZSA9IHRoaXMucGFpck1vZGUgJiYgISF0aGlzLnBhaXJTcHJpdGVFbDtcbiAgICBjb25zdCBwcmV2ID0gdGhpcy5wYWlyU3ByaXRlRWw7XG4gICAgdGhpcy5wYWlyTW9kZSA9IHRydWU7XG4gICAgdGhpcy5jdXJQYWlyID0ga2V5O1xuICAgIGVsLmFkZENsYXNzKFwicGV0LXBhaXItbW9kZVwiKTtcbiAgICB0aGlzLnBhaXJTcHJpdGVFbCA9IHRoaXMuc3dhcFNwcml0ZSh0aGlzLnBhaXJCb2R5RWwsIHByZXYsIG1hcFtrZXldLCB0aGlzLnBhaXJUYXJnZXRIZWlnaHQoKSwgZmFkZSk7XG4gICAgdGhpcy51cGRhdGVGYWNpbmcoKTtcbiAgfVxuXG4gIHJlYnVpbGRTdGF0ZXMoKSB7XG4gICAgdGhpcy5zdGF0ZU1hcHMuQSA9IHRoaXMucGFyc2VTdGF0ZXModGhpcy5zZXR0aW5ncy5hLnN0YXRlcyk7XG4gICAgdGhpcy5zdGF0ZU1hcHMuQiA9IHRoaXMucGFyc2VTdGF0ZXModGhpcy5zZXR0aW5ncy5iLnN0YXRlcyk7XG4gICAgdGhpcy5wYWlyU3RhdGVNYXAgPSB0aGlzLnBhcnNlU3RhdGVzKHRoaXMuc2V0dGluZ3MucGFpclN0YXRlcyk7XG4gIH1cblxuICBwYXJzZVN0YXRlcyh0ZXh0OiBzdHJpbmcpOiBTdGF0ZU1hcCB7XG4gICAgY29uc3QgbWFwOiBTdGF0ZU1hcCA9IHt9O1xuICAgIGZvciAoY29uc3QgcmF3IG9mIHRleHQuc3BsaXQoXCJcXG5cIikpIHtcbiAgICAgIGNvbnN0IGxpbmUgPSByYXcudHJpbSgpO1xuICAgICAgaWYgKCFsaW5lIHx8IGxpbmUuc3RhcnRzV2l0aChcIi8vXCIpIHx8IGxpbmUuc3RhcnRzV2l0aChcIiNcIikpIGNvbnRpbnVlO1xuICAgICAgY29uc3QgbSA9IGxpbmUubWF0Y2goL14oW15cXHM6XHVGRjFBXSspXFxzKls6XHVGRjFBXVxccyooLispJC8pO1xuICAgICAgaWYgKCFtKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IHRva2VucyA9IG1bMl0udHJpbSgpLnNwbGl0KC9cXHMrLyk7XG4gICAgICBsZXQgZnJhbWVzID0gMSwgZnBzID0gODtcbiAgICAgIGNvbnN0IGlzTnVtID0gKHQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gdCAhPT0gdW5kZWZpbmVkICYmICFpc05hTihOdW1iZXIodCkpO1xuICAgICAgaWYgKHRva2Vucy5sZW5ndGggPj0gMyAmJiBpc051bSh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdKSAmJiBpc051bSh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDJdKSkge1xuICAgICAgICBmcHMgPSBOdW1iZXIodG9rZW5zLnBvcCgpKTtcbiAgICAgICAgZnJhbWVzID0gTnVtYmVyKHRva2Vucy5wb3AoKSk7XG4gICAgICB9IGVsc2UgaWYgKHRva2Vucy5sZW5ndGggPj0gMiAmJiBpc051bSh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdKSkge1xuICAgICAgICBmcmFtZXMgPSBOdW1iZXIodG9rZW5zLnBvcCgpKTtcbiAgICAgIH1cbiAgICAgIG1hcFttWzFdLnRvTG93ZXJDYXNlKCldID0ge1xuICAgICAgICBwYXRoOiB0b2tlbnMuam9pbihcIiBcIiksXG4gICAgICAgIGZyYW1lczogTWF0aC5tYXgoMSwgTWF0aC5mbG9vcihmcmFtZXMpKSxcbiAgICAgICAgZnBzOiBNYXRoLm1heCgxLCBmcHMpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIG1hcDtcbiAgfVxuXG4gIHNldEZhY2luZyhmOiBGYWNpbmcpIHtcbiAgICB0aGlzLmZhY2luZyA9IGY7XG4gICAgdGhpcy51cGRhdGVGYWNpbmcoKTtcbiAgfVxuXG4gIHVwZGF0ZUZhY2luZygpIHtcbiAgICBXSE9TLmZvckVhY2goKHcpID0+IHtcbiAgICAgIGNvbnN0IGMgPSB3ID09PSBcIkFcIiA/IHRoaXMuc2V0dGluZ3MuYSA6IHRoaXMuc2V0dGluZ3MuYjtcbiAgICAgIGNvbnN0IHNwID0gdGhpcy5zcHJpdGVFbHNbd107XG4gICAgICBpZiAoIXNwKSByZXR1cm47XG4gICAgICBjb25zdCBzaXR0aW5nID0gdGhpcy5jdXJTdGF0ZVt3XSA9PT0gXCJzaXRcIiB8fCB0aGlzLmN1clN0YXRlW3ddID09PSBcInNpdC10YWxrXCI7XG4gICAgICBjb25zdCBmbGlwcGVkID0gc2l0dGluZ1xuICAgICAgICA/IHRoaXMuZmFjaW5nID09PSBcImxlZnRcIlxuICAgICAgICA6IGMuZmxpcCAhPT0gKHRoaXMuZmFjaW5nID09PSBcImxlZnRcIik7XG4gICAgICBzcC50b2dnbGVDbGFzcyhcInBldC1mbGlwXCIsIGZsaXBwZWQpO1xuICAgIH0pO1xuICAgIGlmICh0aGlzLnBhaXJTcHJpdGVFbCkgdGhpcy5wYWlyU3ByaXRlRWwudG9nZ2xlQ2xhc3MoXCJwZXQtZmxpcFwiLCB0aGlzLmZhY2luZyA9PT0gXCJsZWZ0XCIpO1xuICB9XG5cbiAgY2xhbXBQb3MoeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcbiAgICBjb25zdCB3ID0gdGhpcy5jb3VwbGVFbD8ub2Zmc2V0V2lkdGggPz8gMDtcbiAgICBjb25zdCBoID0gdGhpcy5jb3VwbGVFbD8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IE1hdGgucm91bmQoTWF0aC5tYXgoMCwgTWF0aC5taW4od2luZG93LmlubmVyV2lkdGggLSB3LCB4KSkpLFxuICAgICAgeTogTWF0aC5yb3VuZChNYXRoLm1heCgwLCBNYXRoLm1pbih3aW5kb3cuaW5uZXJIZWlnaHQgLSBoLCB5KSkpLFxuICAgIH07XG4gIH1cblxuICBjbGFtcEludG9WaWV3KCkge1xuICAgIGlmICghdGhpcy5jb3VwbGVFbCkgcmV0dXJuO1xuICAgIGNvbnN0IHAgPSB0aGlzLmNsYW1wUG9zKHRoaXMuc2V0dGluZ3MueCwgdGhpcy5zZXR0aW5ncy55KTtcbiAgICB0aGlzLnNldHRpbmdzLnggPSBwLng7XG4gICAgdGhpcy5zZXR0aW5ncy55ID0gcC55O1xuICAgIHRoaXMuY291cGxlRWwuc3R5bGUubGVmdCA9IGAke3AueH1weGA7XG4gICAgdGhpcy5jb3VwbGVFbC5zdHlsZS50b3AgPSBgJHtwLnl9cHhgO1xuICB9XG5cbiAgcHJpdmF0ZSBzbGVlcChtczogbnVtYmVyLCBpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiByZXNvbHZlKGlkID09PSB0aGlzLnJ1bklkKSwgbXMpKTtcbiAgfVxuXG4gIHN0b3BDbGlwKCkge1xuICAgIHRoaXMuY291cGxlRWw/LnJlbW92ZUNsYXNzKFwicGV0LWNsaXAtcGxheWluZ1wiKTtcbiAgICB0aGlzLmNvdXBsZUVsPy5yZW1vdmVDbGFzcyhcInBldC1jbGlwLWJsZW5kXCIpO1xuICAgIGlmICh0aGlzLmNsaXBSYWYpIHtcbiAgICAgIGNhbmNlbEFuaW1hdGlvbkZyYW1lKHRoaXMuY2xpcFJhZik7XG4gICAgICB0aGlzLmNsaXBSYWYgPSAwO1xuICAgIH1cbiAgICBpZiAodGhpcy5jbGlwVmlkZW8pIHtcbiAgICAgIHRoaXMuY2xpcFZpZGVvLnBhdXNlKCk7XG4gICAgICB0aGlzLmNsaXBWaWRlby5yZW1vdmUoKTtcbiAgICAgIHRoaXMuY2xpcFZpZGVvID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHRoaXMuY2xpcEVsKSB7XG4gICAgICB0aGlzLmNsaXBFbC5yZW1vdmUoKTtcbiAgICAgIHRoaXMuY2xpcEVsID0gbnVsbDtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGtleVdoaXRlKGN0eDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELCB3OiBudW1iZXIsIGg6IG51bWJlcikge1xuICAgIGNvbnN0IGltZyA9IGN0eC5nZXRJbWFnZURhdGEoMCwgMCwgdywgaCk7XG4gICAgY29uc3QgZCA9IGltZy5kYXRhO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZC5sZW5ndGg7IGkgKz0gNCkge1xuICAgICAgY29uc3QgciA9IGRbaV0sIGcgPSBkW2kgKyAxXSwgYiA9IGRbaSArIDJdO1xuICAgICAgY29uc3QgZGlzdCA9IE1hdGguc3FydCgoMjU1IC0gcikgKiogMiArICgyNTUgLSBnKSAqKiAyICsgKDI1NSAtIGIpICoqIDIpO1xuICAgICAgaWYgKGRpc3QgPCAzMCkgZFtpICsgM10gPSAwO1xuICAgICAgZWxzZSBpZiAoZGlzdCA8IDU0KSBkW2kgKyAzXSA9IE1hdGgucm91bmQoZFtpICsgM10gKiAoZGlzdCAtIDMwKSAvIDI0KTtcbiAgICB9XG4gICAgY3R4LnB1dEltYWdlRGF0YShpbWcsIDAsIDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzbGlkZUNvdXBsZSh4OiBudW1iZXIsIHk6IG51bWJlciwgbXM6IG51bWJlciwgaWQ6IG51bWJlciwgZmxpcDogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IGVsID0gdGhpcy5jb3VwbGVFbDtcbiAgICBpZiAoIWVsKSByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgcCA9IHRoaXMuY2xhbXBQb3MoeCwgeSk7XG4gICAgaWYgKHRoaXMuY2xpcEVsKSB0aGlzLmNsaXBFbC5zdHlsZS50cmFuc2Zvcm0gPSBmbGlwID8gXCJzY2FsZVgoLTEpXCIgOiBcIlwiO1xuICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBgbGVmdCAke21zfW1zIGxpbmVhciwgdG9wICR7bXN9bXMgbGluZWFyYDtcbiAgICBlbC5zdHlsZS5sZWZ0ID0gYCR7cC54fXB4YDtcbiAgICBlbC5zdHlsZS50b3AgPSBgJHtwLnl9cHhgO1xuICAgIHRoaXMuc2V0dGluZ3MueCA9IHAueDtcbiAgICB0aGlzLnNldHRpbmdzLnkgPSBwLnk7XG4gICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLnNsZWVwKG1zLCBpZCk7XG4gICAgaWYgKG9rKSBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJcIjtcbiAgICByZXR1cm4gb2s7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ1bkNsaXBXYWxrKHdhbGtBdDogbnVtYmVyLCB3YWxrTXM6IG51bWJlciwgaWQ6IG51bWJlcikge1xuICAgIGlmICghKGF3YWl0IHRoaXMuc2xlZXAod2Fsa0F0LCBpZCkpKSByZXR1cm47XG4gICAgY29uc3QgZWwgPSB0aGlzLmNvdXBsZUVsO1xuICAgIGlmICghZWwgfHwgaWQgIT09IHRoaXMucnVuSWQpIHJldHVybjtcbiAgICBjb25zdCB3ID0gZWwub2Zmc2V0V2lkdGggfHwgMjAwO1xuICAgIGNvbnN0IGggPSBlbC5vZmZzZXRIZWlnaHQgfHwgMTgwO1xuICAgIGNvbnN0IG1hcmdpbiA9IDIwO1xuICAgIGNvbnN0IHJvb21SID0gd2luZG93LmlubmVyV2lkdGggLSB3IC0gdGhpcy5zZXR0aW5ncy54IC0gbWFyZ2luO1xuICAgIGNvbnN0IHJvb21MID0gdGhpcy5zZXR0aW5ncy54IC0gbWFyZ2luO1xuICAgIGNvbnN0IHNwYW4gPSBNYXRoLm1heCgyNjAsIE1hdGgucm91bmQod2luZG93LmlubmVyV2lkdGggKiAwLjM2KSk7XG4gICAgbGV0IGR4ID0gMDtcbiAgICBpZiAocm9vbVIgPj0gMTYwKSBkeCA9IE1hdGgubWluKHJvb21SLCBzcGFuKTtcbiAgICBlbHNlIGlmIChyb29tTCA+PSAxNjApIGR4ID0gLU1hdGgubWluKHJvb21MLCBzcGFuKTtcbiAgICBlbHNlIGR4ID0gcm9vbVIgPj0gcm9vbUwgPyByb29tUiAqIDAuNyA6IC1yb29tTCAqIDAuNztcbiAgICBjb25zdCBkeSA9IE1hdGgucm91bmQoTWF0aC5yYW5kb20oKSAqIDY0IC0gMzIpO1xuICAgIGF3YWl0IHRoaXMuc2xpZGVDb3VwbGUodGhpcy5zZXR0aW5ncy54ICsgZHgsIHRoaXMuc2V0dGluZ3MueSArIGR5LCB3YWxrTXMsIGlkLCBkeCA8IDApO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwbGF5Q2xpcChwYXRoOiBzdHJpbmcsIGlkOiBudW1iZXIsIHdhbGtBdD86IG51bWJlciwgd2Fsa01zPzogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgY291cGxlID0gdGhpcy5jb3VwbGVFbDtcbiAgICBjb25zdCBib2R5ID0gdGhpcy5wYWlyQm9keUVsO1xuICAgIGlmICghY291cGxlIHx8ICFib2R5KSByZXR1cm4gZmFsc2U7XG5cbiAgICBjb25zdCByZWwgPSBub3JtYWxpemVQYXRoKHBhdGgpO1xuICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgocmVsKTtcbiAgICBsZXQgc3JjID0gXCJcIjtcbiAgICBpZiAoZmlsZSBpbnN0YW5jZW9mIFRGaWxlKSB7XG4gICAgICBzcmMgPSB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLmdldFJlc291cmNlUGF0aChmaWxlLnBhdGgpO1xuICAgIH0gZWxzZSBpZiAoYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5leGlzdHMocmVsKSkge1xuICAgICAgc3JjID0gdGhpcy5hcHAudmF1bHQuYWRhcHRlci5nZXRSZXNvdXJjZVBhdGgocmVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3IE5vdGljZShgXHU2MjdFXHU0RTBEXHU1MjMwXHU4OUM2XHU5ODkxXHVGRjFBJHtwYXRofWApO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwidmlkZW9cIik7XG4gICAgdi5jbGFzc05hbWUgPSBcInBldC1jbGlwLXNyY1wiO1xuICAgIHYuc3JjID0gc3JjO1xuICAgIHYubXV0ZWQgPSB0cnVlO1xuICAgIHYuYXV0b3BsYXkgPSB0cnVlO1xuICAgIHYucGxheXNJbmxpbmUgPSB0cnVlO1xuICAgIHYuc2V0QXR0cmlidXRlKFwicGxheXNpbmxpbmVcIiwgXCJ0cnVlXCIpO1xuICAgIHYuc2V0QXR0cmlidXRlKFwibXV0ZWRcIiwgXCJ0cnVlXCIpO1xuXG4gICAgY29uc3QgcmVhZHkgPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuICAgICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcbiAgICAgIGNvbnN0IGRvbmUgPSAob2s6IGJvb2xlYW4pID0+IHtcbiAgICAgICAgaWYgKHNldHRsZWQpIHJldHVybjtcbiAgICAgICAgc2V0dGxlZCA9IHRydWU7XG4gICAgICAgIHJlc29sdmUob2spO1xuICAgICAgfTtcbiAgICAgIHYuYWRkRXZlbnRMaXN0ZW5lcihcImNhbnBsYXlcIiwgKCkgPT4gZG9uZSh0cnVlKSwgeyBvbmNlOiB0cnVlIH0pO1xuICAgICAgdi5hZGRFdmVudExpc3RlbmVyKFwiZXJyb3JcIiwgKCkgPT4gZG9uZShmYWxzZSksIHsgb25jZTogdHJ1ZSB9KTtcbiAgICAgIHYubG9hZCgpO1xuICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT4gZG9uZSh2LnJlYWR5U3RhdGUgPj0gMiksIDI1MDApO1xuICAgIH0pO1xuXG4gICAgaWYgKGlkICE9PSB0aGlzLnJ1bklkIHx8ICFyZWFkeSkge1xuICAgICAgdi5yZW1vdmUoKTtcbiAgICAgIGlmIChpZCA9PT0gdGhpcy5ydW5JZCAmJiAhcmVhZHkpIG5ldyBOb3RpY2UoXCJcdTg5QzZcdTk4OTFcdTY0QURcdTRFMERcdTUxRkFcdTY3NjVcIik7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgaCA9IE1hdGgucm91bmQodGhpcy5wYWlyVGFyZ2V0SGVpZ2h0KCkgKiAxLjQyKTtcbiAgICBjb25zdCB2dyA9IHYudmlkZW9XaWR0aCB8fCAxMTEyO1xuICAgIGNvbnN0IHZoID0gdi52aWRlb0hlaWdodCB8fCA4MzQ7XG4gICAgY29uc3QgdyA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQoaCAqIHZ3IC8gdmgpKTtcbiAgICBjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiY2FudmFzXCIpO1xuICAgIGNhbnZhcy5jbGFzc05hbWUgPSBcInBldC1jbGlwXCI7XG4gICAgY2FudmFzLndpZHRoID0gdztcbiAgICBjYW52YXMuaGVpZ2h0ID0gaDtcbiAgICBjYW52YXMuc3R5bGUud2lkdGggPSBgJHt3fXB4YDtcbiAgICBjYW52YXMuc3R5bGUuaGVpZ2h0ID0gYCR7aH1weGA7XG4gICAgY29uc3QgY3R4ID0gY2FudmFzLmdldENvbnRleHQoXCIyZFwiLCB7IHdpbGxSZWFkRnJlcXVlbnRseTogdHJ1ZSB9KTtcbiAgICBsZXQgY2FuS2V5ID0gISFjdHg7XG4gICAgaWYgKGN0eCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY3R4LmRyYXdJbWFnZSh2LCAwLCAwLCAxLCAxKTtcbiAgICAgICAgY3R4LmdldEltYWdlRGF0YSgwLCAwLCAxLCAxKTtcbiAgICAgIH0gY2F0Y2gge1xuICAgICAgICBjYW5LZXkgPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLnN0b3BDbGlwKCk7XG4gICAgdGhpcy5wYWlyTW9kZSA9IHRydWU7XG4gICAgdGhpcy5jdXJQYWlyID0gXCJcIjtcbiAgICBjb3VwbGUuYWRkQ2xhc3MoXCJwZXQtcGFpci1tb2RlXCIpO1xuICAgIGNvdXBsZS5hZGRDbGFzcyhcInBldC1jbGlwLXBsYXlpbmdcIik7XG4gICAgYm9keS5lbXB0eSgpO1xuICAgIHRoaXMucGFpclNwcml0ZUVsID0gbnVsbDtcblxuICAgIGlmIChjYW5LZXkgJiYgY3R4KSB7XG4gICAgICB2LmNsYXNzTmFtZSA9IFwicGV0LWNsaXAtc3JjXCI7XG4gICAgICBjb3VwbGUuYXBwZW5kQ2hpbGQodik7XG4gICAgICBib2R5LmFwcGVuZENoaWxkKGNhbnZhcyk7XG4gICAgICB0aGlzLmNsaXBFbCA9IGNhbnZhcztcbiAgICAgIHRoaXMuY2xpcFZpZGVvID0gdjtcbiAgICAgIGNvbnN0IHBhaW50ID0gKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5jbGlwVmlkZW8gIT09IHYgfHwgIXRoaXMuY2xpcEVsKSByZXR1cm47XG4gICAgICAgIGN0eC5jbGVhclJlY3QoMCwgMCwgdywgaCk7XG4gICAgICAgIGN0eC5kcmF3SW1hZ2UodiwgMCwgMCwgdywgaCk7XG4gICAgICAgIHRoaXMua2V5V2hpdGUoY3R4LCB3LCBoKTtcbiAgICAgICAgaWYgKHRoaXMuY2xpcFZpZGVvID09PSB2ICYmICF2LmVuZGVkKSB0aGlzLmNsaXBSYWYgPSByZXF1ZXN0QW5pbWF0aW9uRnJhbWUocGFpbnQpO1xuICAgICAgfTtcbiAgICAgIHRoaXMuY2xpcFJhZiA9IHJlcXVlc3RBbmltYXRpb25GcmFtZShwYWludCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvdXBsZS5hZGRDbGFzcyhcInBldC1jbGlwLWJsZW5kXCIpO1xuICAgICAgdi5jbGFzc05hbWUgPSBcInBldC1jbGlwXCI7XG4gICAgICB2LnN0eWxlLmhlaWdodCA9IGAke2h9cHhgO1xuICAgICAgdi5zdHlsZS53aWR0aCA9IFwiYXV0b1wiO1xuICAgICAgYm9keS5hcHBlbmRDaGlsZCh2KTtcbiAgICAgIHRoaXMuY2xpcEVsID0gdjtcbiAgICAgIHRoaXMuY2xpcFZpZGVvID0gdjtcbiAgICB9XG5cbiAgICBpZiAod2Fsa0F0ID09IG51bGwgJiYgL3BhaXItc3Ryb2xsL2kudGVzdChyZWwpKSB7XG4gICAgICB3YWxrQXQgPSA0MTAwO1xuICAgICAgd2Fsa01zID0gNTAwMDtcbiAgICB9XG4gICAgaWYgKHdhbGtBdCAhPSBudWxsICYmIHdhbGtBdCA+PSAwKSB2b2lkIHRoaXMucnVuQ2xpcFdhbGsod2Fsa0F0LCB3YWxrTXMgPz8gNTAwMCwgaWQpO1xuXG4gICAgY29uc3Qgb2sgPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuICAgICAgbGV0IHNldHRsZWQgPSBmYWxzZTtcbiAgICAgIGNvbnN0IGZpbmlzaCA9IChzdWNjZXNzOiBib29sZWFuKSA9PiB7XG4gICAgICAgIGlmIChzZXR0bGVkKSByZXR1cm47XG4gICAgICAgIHNldHRsZWQgPSB0cnVlO1xuICAgICAgICB3aW5kb3cuY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgcmVzb2x2ZShzdWNjZXNzICYmIGlkID09PSB0aGlzLnJ1bklkKTtcbiAgICAgIH07XG4gICAgICBjb25zdCBtcyA9IE51bWJlci5pc0Zpbml0ZSh2LmR1cmF0aW9uKSAmJiB2LmR1cmF0aW9uID4gMCA/IHYuZHVyYXRpb24gKiAxMDAwICsgNTAwIDogMjAwMDA7XG4gICAgICBjb25zdCB0aW1lciA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IGZpbmlzaCh0cnVlKSwgbXMpO1xuICAgICAgdi5hZGRFdmVudExpc3RlbmVyKFwiZW5kZWRcIiwgKCkgPT4gZmluaXNoKHRydWUpLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgICB2LmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoKSA9PiBmaW5pc2goZmFsc2UpLCB7IG9uY2U6IHRydWUgfSk7XG4gICAgICB2b2lkIHYucGxheSgpLmNhdGNoKCgpID0+IGZpbmlzaChmYWxzZSkpO1xuICAgIH0pO1xuXG4gICAgaWYgKGlkICE9PSB0aGlzLnJ1bklkKSByZXR1cm4gZmFsc2U7XG4gICAgdGhpcy5zdG9wQ2xpcCgpO1xuICAgIHRoaXMuc2V0UGFpcihcIm9mZlwiKTtcbiAgICBXSE9TLmZvckVhY2goKHdobykgPT4gdGhpcy5zZXRTdGF0ZSh3aG8sIHRoaXMucmVzdE5hbWUod2hvKSkpO1xuICAgIHJldHVybiBvaztcbiAgfVxuXG4gIGNhbmNlbChvcHRzPzogeyByZXN0b3JlPzogYm9vbGVhbiB9KSB7XG4gICAgdGhpcy5ydW5JZCsrO1xuICAgIHRoaXMuYnVzeSA9IGZhbHNlO1xuICAgIHRoaXMuc3RvcENsaXAoKTtcbiAgICB0aGlzLmhpZGVCdWJibGVzKCk7XG4gICAgV0hPUy5mb3JFYWNoKCh3KSA9PiB7XG4gICAgICB0aGlzLmNoYXJFbHNbd10/LnJlbW92ZUNsYXNzKFwicGV0LXRhbGtpbmdcIik7XG4gICAgICBjb25zdCBiID0gdGhpcy5ib2R5RWxzW3ddO1xuICAgICAgaWYgKGIpIE9iamVjdC5rZXlzKEFOSU1fTVMpLmZvckVhY2goKG4pID0+IGIucmVtb3ZlQ2xhc3MoYHBldC1hbmltLSR7bn1gKSk7XG4gICAgfSk7XG4gICAgdGhpcy5wYWlyRWw/LnJlbW92ZUNsYXNzKFwicGV0LXRhbGtpbmdcIik7XG4gICAgaWYgKHRoaXMucGFpckJvZHlFbCkgT2JqZWN0LmtleXMoQU5JTV9NUykuZm9yRWFjaCgobikgPT4gdGhpcy5wYWlyQm9keUVsIS5yZW1vdmVDbGFzcyhgcGV0LWFuaW0tJHtufWApKTtcblxuICAgIGNvbnN0IGVsID0gdGhpcy5jb3VwbGVFbDtcbiAgICBpZiAoZWwpIHtcbiAgICAgIGNvbnN0IHIgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcIm5vbmVcIjtcbiAgICAgIGVsLnN0eWxlLmxlZnQgPSBgJHtNYXRoLnJvdW5kKHIubGVmdCl9cHhgO1xuICAgICAgZWwuc3R5bGUudG9wID0gYCR7TWF0aC5yb3VuZChyLnRvcCl9cHhgO1xuICAgICAgZWwucmVtb3ZlQ2xhc3MoXCJwZXQtd2Fsa2luZ1wiKTtcbiAgICAgIHRoaXMuc2V0dGluZ3MueCA9IE1hdGgucm91bmQoci5sZWZ0KTtcbiAgICAgIHRoaXMuc2V0dGluZ3MueSA9IE1hdGgucm91bmQoci50b3ApO1xuICAgICAgdm9pZCBlbC5vZmZzZXRXaWR0aDtcbiAgICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBcIlwiO1xuICAgIH1cbiAgICB0aGlzLnNldEZhY2luZyhudWxsKTtcbiAgICBpZiAob3B0cz8ucmVzdG9yZSAhPT0gZmFsc2UpIHtcbiAgICAgIFdIT1MuZm9yRWFjaCgodykgPT4gdGhpcy5zZXRTdGF0ZSh3LCB0aGlzLnJlc3ROYW1lKHcpKSk7XG4gICAgICB0aGlzLnNldFBhaXIoXCJvZmZcIik7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogQWN0aW9uKSB7XG4gICAgaWYgKCF0aGlzLmNvdXBsZUVsKSByZXR1cm47XG4gICAgdGhpcy5jYW5jZWwoKTtcbiAgICBjb25zdCBpZCA9ICsrdGhpcy5ydW5JZDtcbiAgICB0aGlzLmJ1c3kgPSB0cnVlO1xuICAgIGZvciAoY29uc3Qgc3RlcCBvZiBhY3Rpb24uc3RlcHMpIHtcbiAgICAgIGlmIChpZCAhPT0gdGhpcy5ydW5JZCkgcmV0dXJuO1xuICAgICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLnJ1blN0ZXAoc3RlcCwgaWQpO1xuICAgICAgaWYgKCFvaykge1xuICAgICAgICBpZiAoaWQgPT09IHRoaXMucnVuSWQpIHRoaXMuYnVzeSA9IGZhbHNlO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChpZCA9PT0gdGhpcy5ydW5JZCkge1xuICAgICAgdGhpcy5idXN5ID0gZmFsc2U7XG4gICAgICB0aGlzLnNldEZhY2luZyhudWxsKTtcbiAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydW5TdGVwKHN0ZXA6IFN0ZXAsIGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBzd2l0Y2ggKHN0ZXAua2luZCkge1xuICAgICAgY2FzZSBcIndhaXRcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMuc2xlZXAoc3RlcC5tcywgaWQpO1xuICAgICAgY2FzZSBcIm1vdmVcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMubW92ZVRvKHRoaXMuc2V0dGluZ3MueCArIHN0ZXAuZHgsIHRoaXMuc2V0dGluZ3MueSArIHN0ZXAuZHksIHN0ZXAubXMsIGlkKTtcbiAgICAgIGNhc2UgXCJ3YW5kZXJcIjoge1xuICAgICAgICBjb25zdCB3ID0gdGhpcy5jb3VwbGVFbD8ub2Zmc2V0V2lkdGggPz8gMDtcbiAgICAgICAgY29uc3QgaCA9IHRoaXMuY291cGxlRWw/Lm9mZnNldEhlaWdodCA/PyAwO1xuICAgICAgICByZXR1cm4gdGhpcy5tb3ZlVG8oXG4gICAgICAgICAgTWF0aC5yYW5kb20oKSAqIE1hdGgubWF4KDAsIHdpbmRvdy5pbm5lcldpZHRoIC0gdyksXG4gICAgICAgICAgTWF0aC5yYW5kb20oKSAqIE1hdGgubWF4KDAsIHdpbmRvdy5pbm5lckhlaWdodCAtIGgpLFxuICAgICAgICAgIHN0ZXAubXMsIGlkXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBjYXNlIFwiYW5pbVwiOlxuICAgICAgICByZXR1cm4gdGhpcy5wbGF5QW5pbShzdGVwLnRhcmdldCwgc3RlcC5uYW1lLCBpZCk7XG4gICAgICBjYXNlIFwic3RhdGVcIjoge1xuICAgICAgICBjb25zdCB3aG9zOiBXaG9bXSA9IHN0ZXAudGFyZ2V0ID09PSBcImJvdGhcIiA/IFdIT1MgOiBbc3RlcC50YXJnZXRdO1xuICAgICAgICB3aG9zLmZvckVhY2goKHcpID0+IHRoaXMuc2V0U3RhdGUodywgc3RlcC5uYW1lKSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgICAgY2FzZSBcInBhaXJcIjpcbiAgICAgICAgdGhpcy5zZXRQYWlyKHN0ZXAubmFtZSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgY2FzZSBcInZpZGVvXCI6XG4gICAgICAgIHJldHVybiB0aGlzLnBsYXlDbGlwKHN0ZXAucGF0aCwgaWQsIHN0ZXAud2Fsa0F0LCBzdGVwLndhbGtNcyk7XG4gICAgICBjYXNlIFwic2F5XCI6XG4gICAgICAgIHRoaXMuYmVnaW5UYWxrKHN0ZXAud2hvKTtcbiAgICAgICAgdGhpcy5zaG93QnViYmxlKHN0ZXAud2hvLCBzdGVwLnRleHQsIE1hdGgubWluKDYwMDAsIDE1MDAgKyBzdGVwLnRleHQubGVuZ3RoICogMTUwKSk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgY2FzZSBcImNoYXRcIjpcbiAgICAgICAgcmV0dXJuIHRoaXMucGxheUNoYXQoc3RlcC5wb3NlLCBpZCk7XG4gICAgICBjYXNlIFwiZmFjZVwiOlxuICAgICAgICB0aGlzLnNldEZhY2luZyhzdGVwLmRpciA9PT0gXCJyZXNldFwiID8gbnVsbCA6IHN0ZXAuZGlyKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBtb3ZlVG8oeDogbnVtYmVyLCB5OiBudW1iZXIsIG1zOiBudW1iZXIsIGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBlbCA9IHRoaXMuY291cGxlRWw7XG4gICAgaWYgKCFlbCkgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IHAgPSB0aGlzLmNsYW1wUG9zKHgsIHkpO1xuICAgIGlmIChwLnggPiB0aGlzLnNldHRpbmdzLngpIHRoaXMuc2V0RmFjaW5nKFwicmlnaHRcIik7XG4gICAgZWxzZSBpZiAocC54IDwgdGhpcy5zZXR0aW5ncy54KSB0aGlzLnNldEZhY2luZyhcImxlZnRcIik7XG5cbiAgICBjb25zdCB1c2VQYWlyV2FsayA9ICF0aGlzLmNsaXBFbCAmJiB0aGlzLnBhaXJNb2RlICYmICEhdGhpcy5wYWlyU3RhdGVNYXBbXCJ3YWxrXCJdO1xuICAgIGNvbnN0IHByZXZQYWlyID0gdGhpcy5jdXJQYWlyO1xuICAgIGNvbnN0IHNvbG9XYWxrOiBXaG9bXSA9IHRoaXMucGFpck1vZGUgPyBbXSA6IFdIT1MuZmlsdGVyKCh3KSA9PiAhIXRoaXMuc3RhdGVNYXBzW3ddW1wid2Fsa1wiXSk7XG4gICAgaWYgKHVzZVBhaXJXYWxrKSB0aGlzLnNldFBhaXIoXCJ3YWxrXCIpO1xuICAgIHNvbG9XYWxrLmZvckVhY2goKHcpID0+IHRoaXMuc2V0U3RhdGUodywgXCJ3YWxrXCIpKTtcbiAgICBpZiAoIXVzZVBhaXJXYWxrICYmIHNvbG9XYWxrLmxlbmd0aCA9PT0gMCkgZWwuYWRkQ2xhc3MoXCJwZXQtd2Fsa2luZ1wiKTtcblxuICAgIGVsLnN0eWxlLnRyYW5zaXRpb24gPSBgbGVmdCAke21zfW1zIGxpbmVhciwgdG9wICR7bXN9bXMgbGluZWFyYDtcbiAgICBlbC5zdHlsZS5sZWZ0ID0gYCR7cC54fXB4YDtcbiAgICBlbC5zdHlsZS50b3AgPSBgJHtwLnl9cHhgO1xuICAgIHRoaXMuc2V0dGluZ3MueCA9IHAueDtcbiAgICB0aGlzLnNldHRpbmdzLnkgPSBwLnk7XG5cbiAgICBjb25zdCBvayA9IGF3YWl0IHRoaXMuc2xlZXAobXMsIGlkKTtcbiAgICBpZiAob2spIHtcbiAgICAgIGVsLnJlbW92ZUNsYXNzKFwicGV0LXdhbGtpbmdcIik7XG4gICAgICBlbC5zdHlsZS50cmFuc2l0aW9uID0gXCJcIjtcbiAgICAgIGlmICh1c2VQYWlyV2FsaykgdGhpcy5zZXRQYWlyKHByZXZQYWlyIHx8IFwiaWRsZVwiKTtcbiAgICAgIHNvbG9XYWxrLmZvckVhY2goKHcpID0+IHRoaXMuc2V0U3RhdGUodywgXCJpZGxlXCIpKTtcbiAgICB9XG4gICAgcmV0dXJuIG9rO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwbGF5QW5pbSh0YXJnZXQ6IFRhcmdldCwgbmFtZTogc3RyaW5nLCBpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgbXMgPSBBTklNX01TW25hbWVdO1xuICAgIGlmIChtcyA9PT0gdW5kZWZpbmVkKSByZXR1cm4gdHJ1ZTtcbiAgICBjb25zdCBjbHMgPSBgcGV0LWFuaW0tJHtuYW1lfWA7XG4gICAgY29uc3QgYm9kaWVzOiBIVE1MRWxlbWVudFtdID0gdGhpcy5wYWlyTW9kZVxuICAgICAgPyAodGhpcy5wYWlyQm9keUVsID8gW3RoaXMucGFpckJvZHlFbF0gOiBbXSlcbiAgICAgIDogKHRhcmdldCA9PT0gXCJib3RoXCIgPyBXSE9TIDogW3RhcmdldF0pLm1hcCgodykgPT4gdGhpcy5ib2R5RWxzW3ddKS5maWx0ZXIoKGIpOiBiIGlzIEhUTUxFbGVtZW50ID0+ICEhYik7XG4gICAgYm9kaWVzLmZvckVhY2goKGIpID0+IHsgYi5yZW1vdmVDbGFzcyhjbHMpOyB2b2lkIGIub2Zmc2V0V2lkdGg7IGIuYWRkQ2xhc3MoY2xzKTsgfSk7XG4gICAgY29uc3Qgb2sgPSBhd2FpdCB0aGlzLnNsZWVwKG1zLCBpZCk7XG4gICAgYm9kaWVzLmZvckVhY2goKGIpID0+IGIucmVtb3ZlQ2xhc3MoY2xzKSk7XG4gICAgcmV0dXJuIG9rO1xuICB9XG5cbiAgcHJpdmF0ZSBjYW5TdGFuZFRhbGsoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuICEhdGhpcy5zdGF0ZU1hcHMuQVtcImlkbGVcIl0gJiYgISF0aGlzLnN0YXRlTWFwcy5CW1wiaWRsZVwiXTtcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlUYWxrUG9zZShwb3NlOiBcInNpdFwiIHwgXCJpZGxlXCIpIHtcbiAgICB0aGlzLnNldFBhaXIoXCJvZmZcIik7XG4gICAgaWYgKHBvc2UgPT09IFwiaWRsZVwiICYmIHRoaXMuY2FuU3RhbmRUYWxrKCkpIHtcbiAgICAgIFdIT1MuZm9yRWFjaCgodykgPT4gdGhpcy5zZXRTdGF0ZSh3LCBcImlkbGVcIikpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBXSE9TLmZvckVhY2goKHcpID0+IHRoaXMuc2V0U3RhdGUodywgdGhpcy5yZXN0TmFtZSh3KSkpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBwbGF5RGlhbG9ndWVMaW5lcyhkOiBEaWFsb2d1ZSwgaWQ6IG51bWJlcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGZvciAoY29uc3QgbGluZSBvZiBkKSB7XG4gICAgICBpZiAoaWQgIT09IHRoaXMucnVuSWQpIHJldHVybiBmYWxzZTtcbiAgICAgIGNvbnN0IG1zID0gTWF0aC5taW4oNjAwMCwgMTUwMCArIGxpbmUudGV4dC5sZW5ndGggKiAxNTApO1xuICAgICAgdGhpcy5zaG93QnViYmxlKGxpbmUud2hvLCBsaW5lLnRleHQsIG1zKTtcbiAgICAgIHRoaXMuYmVnaW5UYWxrKGxpbmUud2hvKTtcbiAgICAgIGNvbnN0IGhvc3QgPSB0aGlzLnBhaXJNb2RlID8gdGhpcy5wYWlyRWwgOiB0aGlzLmNoYXJFbHNbbGluZS53aG9dO1xuICAgICAgaG9zdD8uYWRkQ2xhc3MoXCJwZXQtdGFsa2luZ1wiKTtcbiAgICAgIGNvbnN0IG9rID0gYXdhaXQgdGhpcy5zbGVlcChtcyArIDMwMCwgaWQpO1xuICAgICAgaG9zdD8ucmVtb3ZlQ2xhc3MoXCJwZXQtdGFsa2luZ1wiKTtcbiAgICAgIGlmIChpZCA9PT0gdGhpcy5ydW5JZCAmJiAhdGhpcy5wYWlyTW9kZSkgdGhpcy5zZXRTdGF0ZShsaW5lLndobywgdGhpcy5wb3NlUmVzdChsaW5lLndobykpO1xuICAgICAgaWYgKCFvaykgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgcGxheUNoYXQocG9zZTogXCJzaXRcIiB8IFwiaWRsZVwiLCBpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKCF0aGlzLmRpYWxvZ3Vlcy5sZW5ndGgpIHJldHVybiB0cnVlO1xuICAgIHRoaXMuYXBwbHlUYWxrUG9zZShwb3NlKTtcbiAgICByZXR1cm4gdGhpcy5wbGF5RGlhbG9ndWVMaW5lcyhwaWNrKHRoaXMuZGlhbG9ndWVzKSwgaWQpO1xuICB9XG5cbiAgYXN5bmMgcnVuRGlhbG9ndWUoZDogRGlhbG9ndWUsIHBvc2U/OiBcInNpdFwiIHwgXCJpZGxlXCIpIHtcbiAgICBpZiAoIXRoaXMuY291cGxlRWwpIHJldHVybjtcbiAgICBjb25zdCBzdGFuZCA9IHBvc2UgPT09IFwiaWRsZVwiIHx8IChwb3NlID09PSB1bmRlZmluZWQgJiYgdGhpcy5jYW5TdGFuZFRhbGsoKSAmJiBNYXRoLnJhbmRvbSgpIDwgMC41KTtcbiAgICB0aGlzLmNhbmNlbCh7IHJlc3RvcmU6IGZhbHNlIH0pO1xuICAgIGNvbnN0IGlkID0gKyt0aGlzLnJ1bklkO1xuICAgIHRoaXMuYnVzeSA9IHRydWU7XG4gICAgdGhpcy5hcHBseVRhbGtQb3NlKHN0YW5kID8gXCJpZGxlXCIgOiBcInNpdFwiKTtcbiAgICBhd2FpdCB0aGlzLnBsYXlEaWFsb2d1ZUxpbmVzKGQsIGlkKTtcbiAgICBpZiAoaWQgPT09IHRoaXMucnVuSWQpIHRoaXMuYnVzeSA9IGZhbHNlO1xuICB9XG5cbiAgc2hvd0J1YmJsZSh3aG86IFdobywgdGV4dDogc3RyaW5nLCBtczogbnVtYmVyKSB7XG4gICAgY29uc3QgYiA9IHRoaXMucGFpck1vZGUgPyB0aGlzLnBhaXJCdWJibGVFbHNbd2hvXSA6IHRoaXMuYnViYmxlRWxzW3dob107XG4gICAgaWYgKCFiKSByZXR1cm47XG4gICAgYi5zZXRUZXh0KHRleHQpO1xuICAgIGIuYWRkQ2xhc3MoXCJwZXQtYnViYmxlLXNob3dcIik7XG4gICAgY29uc3QgdCA9IHRoaXMuYnViYmxlVGltZXJzW3dob107XG4gICAgaWYgKHQpIHdpbmRvdy5jbGVhclRpbWVvdXQodCk7XG4gICAgdGhpcy5idWJibGVUaW1lcnNbd2hvXSA9IHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+IGIucmVtb3ZlQ2xhc3MoXCJwZXQtYnViYmxlLXNob3dcIiksIG1zKTtcbiAgfVxuXG4gIGhpZGVCdWJibGVzKCkge1xuICAgIFdIT1MuZm9yRWFjaCgodykgPT4ge1xuICAgICAgdGhpcy5idWJibGVFbHNbd10/LnJlbW92ZUNsYXNzKFwicGV0LWJ1YmJsZS1zaG93XCIpO1xuICAgICAgdGhpcy5wYWlyQnViYmxlRWxzW3ddPy5yZW1vdmVDbGFzcyhcInBldC1idWJibGUtc2hvd1wiKTtcbiAgICAgIGNvbnN0IHQgPSB0aGlzLmJ1YmJsZVRpbWVyc1t3XTtcbiAgICAgIGlmICh0KSB3aW5kb3cuY2xlYXJUaW1lb3V0KHQpO1xuICAgICAgdGhpcy5idWJibGVUaW1lcnNbd10gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgc2NoZWR1bGVOZXh0KCkge1xuICAgIGNvbnN0IG1uID0gTWF0aC5tYXgoMywgTWF0aC5taW4odGhpcy5zZXR0aW5ncy5pbnRlcnZhbE1pbiwgdGhpcy5zZXR0aW5ncy5pbnRlcnZhbE1heCkpO1xuICAgIGNvbnN0IG14ID0gTWF0aC5tYXgobW4sIHRoaXMuc2V0dGluZ3MuaW50ZXJ2YWxNYXgpO1xuICAgIHRoaXMubmV4dEF0ID0gRGF0ZS5ub3coKSArIChtbiArIE1hdGgucmFuZG9tKCkgKiAobXggLSBtbikpICogMTAwMDtcbiAgfVxuXG4gIHByaXZhdGUgdGljaygpIHtcbiAgICBpZiAoIXRoaXMuc2V0dGluZ3MuYXV0b1BsYXkgfHwgIXRoaXMuY291cGxlRWwgfHwgdGhpcy5idXN5IHx8IHRoaXMuZHJhZ2dpbmcpIHJldHVybjtcbiAgICBpZiAoRGF0ZS5ub3coKSA8IHRoaXMubmV4dEF0KSByZXR1cm47XG4gICAgdGhpcy5wbGF5UmFuZG9tKCk7XG4gICAgdGhpcy5zY2hlZHVsZU5leHQoKTtcbiAgfVxuXG4gIHBsYXlSYW5kb20oKSB7XG4gICAgY29uc3Qgd2FudERpYWxvZ3VlID0gTWF0aC5yYW5kb20oKSAqIDEwMCA8IHRoaXMuc2V0dGluZ3MuZGlhbG9ndWVDaGFuY2U7XG4gICAgaWYgKHdhbnREaWFsb2d1ZSAmJiB0aGlzLmRpYWxvZ3Vlcy5sZW5ndGgpIHJldHVybiB0aGlzLnJ1bkRpYWxvZ3VlKHBpY2sodGhpcy5kaWFsb2d1ZXMpKTtcbiAgICBpZiAodGhpcy5hY3Rpb25zLmxlbmd0aCkgcmV0dXJuIHRoaXMucnVuQWN0aW9uKHBpY2sodGhpcy5hY3Rpb25zKSk7XG4gICAgaWYgKHRoaXMuZGlhbG9ndWVzLmxlbmd0aCkgcmV0dXJuIHRoaXMucnVuRGlhbG9ndWUocGljayh0aGlzLmRpYWxvZ3VlcykpO1xuICB9XG5cbiAgZW5hYmxlRHJhZyhlbDogSFRNTERpdkVsZW1lbnQpIHtcbiAgICBsZXQgc3RhcnRYID0gMCwgc3RhcnRZID0gMCwgb3JpZ2luWCA9IDAsIG9yaWdpblkgPSAwLCBtb3ZlZCA9IGZhbHNlO1xuXG4gICAgY29uc3Qgb25Nb3ZlID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGNvbnN0IGR4ID0gZS5jbGllbnRYIC0gc3RhcnRYLCBkeSA9IGUuY2xpZW50WSAtIHN0YXJ0WTtcbiAgICAgIGlmIChNYXRoLmFicyhkeCkgKyBNYXRoLmFicyhkeSkgPiAzKSBtb3ZlZCA9IHRydWU7XG4gICAgICBpZiAoIW1vdmVkKSByZXR1cm47XG4gICAgICBlbC5hZGRDbGFzcyhcInBldC1kcmFnZ2luZ1wiKTtcbiAgICAgIGVsLnN0eWxlLmxlZnQgPSBgJHtvcmlnaW5YICsgZHh9cHhgO1xuICAgICAgZWwuc3R5bGUudG9wID0gYCR7b3JpZ2luWSArIGR5fXB4YDtcbiAgICB9O1xuXG4gICAgY29uc3Qgb25VcCA9IGFzeW5jICgpID0+IHtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZW1vdmVcIiwgb25Nb3ZlKTtcbiAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJtb3VzZXVwXCIsIG9uVXApO1xuICAgICAgdGhpcy5kcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgaWYgKG1vdmVkKSB7XG4gICAgICAgIGNvbnN0IHAgPSB0aGlzLmNsYW1wUG9zKHBhcnNlSW50KGVsLnN0eWxlLmxlZnQpLCBwYXJzZUludChlbC5zdHlsZS50b3ApKTtcbiAgICAgICAgdGhpcy5zZXR0aW5ncy54ID0gcC54O1xuICAgICAgICB0aGlzLnNldHRpbmdzLnkgPSBwLnk7XG4gICAgICAgIGVsLnN0eWxlLmxlZnQgPSBgJHtwLnh9cHhgO1xuICAgICAgICBlbC5zdHlsZS50b3AgPSBgJHtwLnl9cHhgO1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB3aW5kb3cuc2V0VGltZW91dCgoKSA9PiBlbC5yZW1vdmVDbGFzcyhcInBldC1kcmFnZ2luZ1wiKSwgMCk7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHRoaXMucmVnaXN0ZXJEb21FdmVudChlbCwgXCJtb3VzZWRvd25cIiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcbiAgICAgIGlmIChlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuO1xuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgdGhpcy5jYW5jZWwoKTtcbiAgICAgIHRoaXMuZHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgbW92ZWQgPSBmYWxzZTtcbiAgICAgIHN0YXJ0WCA9IGUuY2xpZW50WDsgc3RhcnRZID0gZS5jbGllbnRZO1xuICAgICAgb3JpZ2luWCA9IGVsLm9mZnNldExlZnQ7IG9yaWdpblkgPSBlbC5vZmZzZXRUb3A7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vtb3ZlXCIsIG9uTW92ZSk7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKFwibW91c2V1cFwiLCBvblVwKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGxvYWRTY3JpcHRzKCkge1xuICAgIGNvbnN0IGRUZXh0ID0gKGF3YWl0IHRoaXMucmVhZE5vdGUodGhpcy5zZXR0aW5ncy5kaWFsb2d1ZU5vdGUpKSA/PyB0aGlzLnNldHRpbmdzLmRpYWxvZ3VlU2NyaXB0O1xuICAgIGNvbnN0IGFUZXh0ID0gKGF3YWl0IHRoaXMucmVhZE5vdGUodGhpcy5zZXR0aW5ncy5hY3Rpb25Ob3RlKSkgPz8gdGhpcy5zZXR0aW5ncy5hY3Rpb25TY3JpcHQ7XG4gICAgdGhpcy5kaWFsb2d1ZXMgPSB0aGlzLnBhcnNlRGlhbG9ndWVzKGRUZXh0KTtcbiAgICB0aGlzLmFjdGlvbnMgPSB0aGlzLnBhcnNlQWN0aW9ucyhhVGV4dCk7XG4gIH1cblxuICBhc3luYyByZWFkTm90ZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcbiAgICBjb25zdCBwID0gcGF0aC50cmltKCk7XG4gICAgaWYgKCFwKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBmID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKG5vcm1hbGl6ZVBhdGgocCkpO1xuICAgIGlmIChmIGluc3RhbmNlb2YgVEZpbGUpIHJldHVybiB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGYpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcmVzb2x2ZVdobyhzOiBzdHJpbmcpOiBXaG8gfCBudWxsIHtcbiAgICBjb25zdCBrID0gcy50cmltKCk7XG4gICAgaWYgKC9eYSQvaS50ZXN0KGspIHx8IGsgPT09IHRoaXMuc2V0dGluZ3MuYS5uYW1lKSByZXR1cm4gXCJBXCI7XG4gICAgaWYgKC9eYiQvaS50ZXN0KGspIHx8IGsgPT09IHRoaXMuc2V0dGluZ3MuYi5uYW1lKSByZXR1cm4gXCJCXCI7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICByZXNvbHZlVGFyZ2V0KHM6IHN0cmluZyk6IFRhcmdldCB8IG51bGwge1xuICAgIGNvbnN0IGsgPSBzLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgIGlmIChrID09PSBcImJvdGhcIiB8fCBrID09PSBcImFsbFwiIHx8IGsgPT09IFwiXHU5MEZEXCIgfHwgayA9PT0gXCJcdTRFMjRcdTRFQkFcIiB8fCBrID09PSBcIlx1NEZFOVwiKSByZXR1cm4gXCJib3RoXCI7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZVdobyhzKTtcbiAgfVxuXG4gIHBhcnNlRGlhbG9ndWVzKHRleHQ6IHN0cmluZyk6IERpYWxvZ3VlW10ge1xuICAgIGNvbnN0IG91dDogRGlhbG9ndWVbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgdGV4dC5zcGxpdCgvXFxuXFxzKlxcbi8pKSB7XG4gICAgICBjb25zdCBsaW5lczogRGlhbG9ndWVMaW5lW10gPSBbXTtcbiAgICAgIGZvciAoY29uc3QgcmF3IG9mIGJsb2NrLnNwbGl0KFwiXFxuXCIpKSB7XG4gICAgICAgIGNvbnN0IGxpbmUgPSByYXcudHJpbSgpO1xuICAgICAgICBpZiAoIWxpbmUgfHwgbGluZS5zdGFydHNXaXRoKFwiI1wiKSB8fCBsaW5lLnN0YXJ0c1dpdGgoXCIvL1wiKSB8fCBsaW5lID09PSBcIi0tLVwiKSBjb250aW51ZTtcbiAgICAgICAgY29uc3QgbSA9IGxpbmUubWF0Y2goL14oLis/KVxccypbOlx1RkYxQV1cXHMqKC4rKSQvKTtcbiAgICAgICAgaWYgKCFtKSBjb250aW51ZTtcbiAgICAgICAgY29uc3Qgd2hvID0gdGhpcy5yZXNvbHZlV2hvKG1bMV0pO1xuICAgICAgICBpZiAoIXdobykgY29udGludWU7XG4gICAgICAgIGxpbmVzLnB1c2goeyB3aG8sIHRleHQ6IG1bMl0udHJpbSgpIH0pO1xuICAgICAgfVxuICAgICAgaWYgKGxpbmVzLmxlbmd0aCkgb3V0LnB1c2gobGluZXMpO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xuICB9XG5cbiAgcGFyc2VBY3Rpb25zKHRleHQ6IHN0cmluZyk6IEFjdGlvbltdIHtcbiAgICBjb25zdCBvdXQ6IEFjdGlvbltdID0gW107XG4gICAgbGV0IGN1cjogQWN0aW9uIHwgbnVsbCA9IG51bGw7XG4gICAgZm9yIChjb25zdCByYXcgb2YgdGV4dC5zcGxpdChcIlxcblwiKSkge1xuICAgICAgY29uc3QgbGluZSA9IHJhdy50cmltKCk7XG4gICAgICBpZiAoIWxpbmUgfHwgbGluZS5zdGFydHNXaXRoKFwiLy9cIikgfHwgbGluZSA9PT0gXCItLS1cIikgY29udGludWU7XG4gICAgICBpZiAobGluZS5zdGFydHNXaXRoKFwiI1wiKSkge1xuICAgICAgICBjdXIgPSB7IG5hbWU6IGxpbmUucmVwbGFjZSgvXiMrXFxzKi8sIFwiXCIpIHx8IFwiXHU2NzJBXHU1NDdEXHU1NDBEXCIsIHN0ZXBzOiBbXSB9O1xuICAgICAgICBvdXQucHVzaChjdXIpO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmICghY3VyKSB7IGN1ciA9IHsgbmFtZTogXCJcdTY3MkFcdTU0N0RcdTU0MERcIiwgc3RlcHM6IFtdIH07IG91dC5wdXNoKGN1cik7IH1cbiAgICAgIGNvbnN0IHN0ZXAgPSB0aGlzLnBhcnNlU3RlcChsaW5lKTtcbiAgICAgIGlmIChzdGVwKSBjdXIuc3RlcHMucHVzaChzdGVwKTtcbiAgICB9XG4gICAgcmV0dXJuIG91dC5maWx0ZXIoKGEpID0+IGEuc3RlcHMubGVuZ3RoKTtcbiAgfVxuXG4gIHBhcnNlU3RlcChsaW5lOiBzdHJpbmcpOiBTdGVwIHwgbnVsbCB7XG4gICAgY29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KC9cXHMrLyk7XG4gICAgY29uc3QgaGVhZCA9IHBhcnRzWzBdLnRvTG93ZXJDYXNlKCk7XG4gICAgY29uc3QgbnVtID0gKHM6IHN0cmluZyB8IHVuZGVmaW5lZCwgZDogbnVtYmVyKSA9PiB7XG4gICAgICBjb25zdCBuID0gcGFyc2VGbG9hdChzID8/IFwiXCIpO1xuICAgICAgcmV0dXJuIGlzTmFOKG4pID8gZCA6IG47XG4gICAgfTtcbiAgICBzd2l0Y2ggKGhlYWQpIHtcbiAgICAgIGNhc2UgXCJ3YWl0XCI6IHJldHVybiB7IGtpbmQ6IFwid2FpdFwiLCBtczogbnVtKHBhcnRzWzFdLCAxMDAwKSB9O1xuICAgICAgY2FzZSBcIndhbGtcIjogcmV0dXJuIHsga2luZDogXCJtb3ZlXCIsIGR4OiBudW0ocGFydHNbMV0sIDIwMCksIGR5OiAwLCBtczogbnVtKHBhcnRzWzJdLCAzMDAwKSB9O1xuICAgICAgY2FzZSBcIm1vdmVcIjogcmV0dXJuIHsga2luZDogXCJtb3ZlXCIsIGR4OiBudW0ocGFydHNbMV0sIDApLCBkeTogbnVtKHBhcnRzWzJdLCAwKSwgbXM6IG51bShwYXJ0c1szXSwgMzAwMCkgfTtcbiAgICAgIGNhc2UgXCJ3YW5kZXJcIjogcmV0dXJuIHsga2luZDogXCJ3YW5kZXJcIiwgbXM6IG51bShwYXJ0c1sxXSwgNDAwMCkgfTtcbiAgICAgIGNhc2UgXCJwYWlyXCI6IHJldHVybiB7IGtpbmQ6IFwicGFpclwiLCBuYW1lOiAocGFydHNbMV0gPz8gXCJpZGxlXCIpLnRvTG93ZXJDYXNlKCkgfTtcbiAgICAgIGNhc2UgXCJjaGF0XCI6IHtcbiAgICAgICAgY29uc3QgcCA9IChwYXJ0c1sxXSA/PyBcInNpdFwiKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4geyBraW5kOiBcImNoYXRcIiwgcG9zZTogcCA9PT0gXCJpZGxlXCIgfHwgcCA9PT0gXCJzdGFuZFwiID8gXCJpZGxlXCIgOiBcInNpdFwiIH07XG4gICAgICB9XG4gICAgICBjYXNlIFwidmlkZW9cIjoge1xuICAgICAgICBjb25zdCByZXN0ID0gcGFydHMuc2xpY2UoMSk7XG4gICAgICAgIGxldCB3YWxrQXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcbiAgICAgICAgbGV0IHdhbGtNczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgICAgICBpZiAocmVzdC5sZW5ndGggPj0gMyAmJiAhaXNOYU4oTnVtYmVyKHJlc3RbcmVzdC5sZW5ndGggLSAxXSkpICYmICFpc05hTihOdW1iZXIocmVzdFtyZXN0Lmxlbmd0aCAtIDJdKSkpIHtcbiAgICAgICAgICB3YWxrTXMgPSBOdW1iZXIocmVzdC5wb3AoKSkgKiAxMDAwO1xuICAgICAgICAgIHdhbGtBdCA9IE51bWJlcihyZXN0LnBvcCgpKSAqIDEwMDA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGF0aCA9IHJlc3Quam9pbihcIiBcIikudHJpbSgpO1xuICAgICAgICByZXR1cm4gcGF0aCA/IHsga2luZDogXCJ2aWRlb1wiLCBwYXRoLCB3YWxrQXQsIHdhbGtNcyB9IDogbnVsbDtcbiAgICAgIH1cbiAgICAgIGNhc2UgXCJmYWNlXCI6IHtcbiAgICAgICAgY29uc3QgZCA9IChwYXJ0c1sxXSA/PyBcInJlc2V0XCIpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIHJldHVybiB7IGtpbmQ6IFwiZmFjZVwiLCBkaXI6IGQgPT09IFwibGVmdFwiID8gXCJsZWZ0XCIgOiBkID09PSBcInJpZ2h0XCIgPyBcInJpZ2h0XCIgOiBcInJlc2V0XCIgfTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgdGFyZ2V0ID0gdGhpcy5yZXNvbHZlVGFyZ2V0KHBhcnRzWzBdKTtcbiAgICBpZiAoIXRhcmdldCB8fCBwYXJ0cy5sZW5ndGggPCAyKSByZXR1cm4gbnVsbDtcbiAgICBjb25zdCB2ZXJiID0gcGFydHNbMV0udG9Mb3dlckNhc2UoKTtcbiAgICBpZiAodmVyYiA9PT0gXCJzYXlcIikge1xuICAgICAgaWYgKHRhcmdldCA9PT0gXCJib3RoXCIpIHJldHVybiBudWxsO1xuICAgICAgY29uc3QgdGV4dCA9IHBhcnRzLnNsaWNlKDIpLmpvaW4oXCIgXCIpO1xuICAgICAgcmV0dXJuIHRleHQgPyB7IGtpbmQ6IFwic2F5XCIsIHdobzogdGFyZ2V0LCB0ZXh0IH0gOiBudWxsO1xuICAgIH1cbiAgICBpZiAodmVyYiA9PT0gXCJzdGF0ZVwiKSB7XG4gICAgICBjb25zdCBuID0gcGFydHNbMl07XG4gICAgICByZXR1cm4gbiA/IHsga2luZDogXCJzdGF0ZVwiLCB0YXJnZXQsIG5hbWU6IG4udG9Mb3dlckNhc2UoKSB9IDogbnVsbDtcbiAgICB9XG4gICAgaWYgKEFOSU1fTVNbdmVyYl0gIT09IHVuZGVmaW5lZCkgcmV0dXJuIHsga2luZDogXCJhbmltXCIsIHRhcmdldCwgbmFtZTogdmVyYiB9O1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xuICAgIGNvbnN0IHJhdzogYW55ID0gKGF3YWl0IHRoaXMubG9hZERhdGEoKSkgPz8ge307XG4gICAgY29uc3QgeyBwZXRzLCBhbmltYXRlLCAuLi5yZXN0IH0gPSByYXc7XG5cbiAgICBjb25zdCBtaWdyYXRlQ2hhciA9ICh3aG86IFdobywgYmFzZTogQ2hhcmFjdGVyLCBzcmM6IGFueSk6IENoYXJhY3RlciA9PiB7XG4gICAgICBjb25zdCBjOiBhbnkgPSB7IC4uLmJhc2UsIC4uLihzcmMgPz8ge30pIH07XG4gICAgICBpZiAoIXNyYz8uc3RhdGVzIHx8ICFTdHJpbmcoc3JjLnN0YXRlcykudHJpbSgpKSB7XG4gICAgICAgIGMuc3RhdGVzID0gYmFzZS5zdGF0ZXM7XG4gICAgICAgIGlmICh0eXBlb2Ygc3JjPy5zaXplID09PSBcIm51bWJlclwiICYmIHNyYy5zaXplIDw9IDEyMCkgYy5zaXplID0gYmFzZS5zaXplO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBjLnN0YXRlcyA9PT0gXCJzdHJpbmdcIiAmJiAhL1xcYnNpdFxccyo6Ly50ZXN0KGMuc3RhdGVzKSkge1xuICAgICAgICBjLnN0YXRlcyA9ICh3aG8gPT09IFwiQlwiXG4gICAgICAgICAgPyBcInNpdDogYXNzZXRzL0Itc2l0LnBuZ1xcbnNpdC10YWxrOiBhc3NldHMvQi1zaXQtdGFsay5wbmcgMiA0XFxuXCJcbiAgICAgICAgICA6IFwic2l0OiBhc3NldHMvQS1zaXQucG5nXFxuc2l0LXRhbGs6IGFzc2V0cy9BLXNpdC10YWxrLnBuZyAyIDRcXG5cIikgKyBjLnN0YXRlcztcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBjLmltYWdlUGF0aDtcbiAgICAgIHJldHVybiBjIGFzIENoYXJhY3RlcjtcbiAgICB9O1xuXG4gICAgY29uc3QgczogUGV0U2V0dGluZ3MgPSB7XG4gICAgICAuLi5ERUZBVUxUX1NFVFRJTkdTLFxuICAgICAgLi4ucmVzdCxcbiAgICAgIGE6IG1pZ3JhdGVDaGFyKFwiQVwiLCBERUZBVUxUX1NFVFRJTkdTLmEsIHJlc3QuYSksXG4gICAgICBiOiBtaWdyYXRlQ2hhcihcIkJcIiwgREVGQVVMVF9TRVRUSU5HUy5iLCByZXN0LmIpLFxuICAgIH07XG4gICAgaWYgKGFuaW1hdGUgIT09IHVuZGVmaW5lZCAmJiByZXN0LmlkbGVBbmltYXRlID09PSB1bmRlZmluZWQpIHMuaWRsZUFuaW1hdGUgPSAhIWFuaW1hdGU7XG4gICAgaWYgKCFyZXN0LnBhaXJTdGF0ZXMpIHMucGFpclN0YXRlcyA9IFBBSVJfU1RBVEVTO1xuICAgIGlmICh0eXBlb2YgcmVzdC5wYWlyU2l6ZSAhPT0gXCJudW1iZXJcIikgcy5wYWlyU2l6ZSA9IDE7XG4gICAgaWYgKHMucGFpclNpemUgPiAzKSBzLnBhaXJTaXplID0gMTtcblxuICAgIGxldCBhY3Rpb25zTWlncmF0ZWQgPSBmYWxzZTtcbiAgICBpZiAodHlwZW9mIHMuYWN0aW9uU2NyaXB0ID09PSBcInN0cmluZ1wiICYmICFzLmFjdGlvblNjcmlwdC5pbmNsdWRlcyhcInZpZGVvIGFzc2V0cy9wYWlyLXN0cm9sbC5tcDRcIikpIHtcbiAgICAgIGxldCBzY3JpcHQgPSBzLmFjdGlvblNjcmlwdDtcbiAgICAgIHNjcmlwdCA9IHNjcmlwdC5yZXBsYWNlKC8jIFx1NTc1MFx1NEUwQlx1ODA0QVx1NTkyOVx1NTE4RFx1NzI3NVx1NjI0QltcXHNcXFNdKj8oPz1cXG4jIHwkKS8sIFwiXCIpO1xuICAgICAgc2NyaXB0ID0gc2NyaXB0LnJlcGxhY2UoLyMgXHU3Mjc1XHU2MjRCXHU1MjMwXHU1OTA0XHU5MDFCXHU5MDFCW1xcc1xcU10qPyg/PVxcbiMgfCQpLywgXCJcIik7XG4gICAgICBzY3JpcHQgPSBzY3JpcHQucmVwbGFjZSgvIyBcdTcyNzVcdTYyNEJcdTY1NjNcdTZCNjVbXFxzXFxTXSo/KD89XFxuIyB8JCkvLCBcIlwiKTtcbiAgICAgIHNjcmlwdCA9IHNjcmlwdC5yZXBsYWNlKC8jIFx1NTIzMFx1NTkwNFx1OTAxQlx1OTAxQltcXHNcXFNdKj8oPz1cXG4jIHwkKS8sIFwiXCIpO1xuICAgICAgcy5hY3Rpb25TY3JpcHQgPSBgIyBcdTcyNzVcdTYyNEJcdTUyMzBcdTU5MDRcdTkwMUJcdTkwMUJcXG52aWRlbyBhc3NldHMvcGFpci1zdHJvbGwubXA0XFxuXFxuJHtzY3JpcHQudHJpbSgpfVxcbmA7XG4gICAgICBhY3Rpb25zTWlncmF0ZWQgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHMuYWN0aW9uU2NyaXB0ID09PSBcInN0cmluZ1wiICYmICFzLmFjdGlvblNjcmlwdC5pbmNsdWRlcyhcIiMgXHU3QUQ5XHU3NzQwXHU4MDRBXHU1OTI5XCIpKSB7XG4gICAgICBzLmFjdGlvblNjcmlwdCA9IGAke3MuYWN0aW9uU2NyaXB0LnRyaW0oKX1cXG5cXG4jIFx1N0FEOVx1Nzc0MFx1ODA0QVx1NTkyOVxcbmNoYXQgaWRsZVxcbmA7XG4gICAgICBhY3Rpb25zTWlncmF0ZWQgPSB0cnVlO1xuICAgIH1cblxuICAgIGlmIChBcnJheS5pc0FycmF5KHBldHMpICYmICFyZXN0LmEpIHtcbiAgICAgIGNvbnN0IFtwMCwgcDFdID0gcGV0cztcbiAgICAgIGlmIChwMCkge1xuICAgICAgICBzLmEgPSBtaWdyYXRlQ2hhcihcIkFcIiwgREVGQVVMVF9TRVRUSU5HUy5hLCBwMCk7XG4gICAgICAgIGlmICh0eXBlb2YgcDAueCA9PT0gXCJudW1iZXJcIikgcy54ID0gcDAueDtcbiAgICAgICAgaWYgKHR5cGVvZiBwMC55ID09PSBcIm51bWJlclwiKSBzLnkgPSBwMC55O1xuICAgICAgfVxuICAgICAgaWYgKHAxKSBzLmIgPSBtaWdyYXRlQ2hhcihcIkJcIiwgREVGQVVMVF9TRVRUSU5HUy5iLCBwMSk7XG4gICAgfVxuICAgIHRoaXMuc2V0dGluZ3MgPSBzO1xuICAgIHRoaXMucmVidWlsZFN0YXRlcygpO1xuICAgIGlmIChhY3Rpb25zTWlncmF0ZWQpIGF3YWl0IHRoaXMuc2F2ZURhdGEocyk7XG4gIH1cblxuICBhc3luYyBzYXZlU2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgfVxuXG4gIGFzeW5jIGFwcGx5U2V0dGluZ3MoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICB0aGlzLnJlYnVpbGRTdGF0ZXMoKTtcbiAgICB0aGlzLnJlbmRlckNvdXBsZSgpO1xuICAgIHRoaXMuc2NoZWR1bGVOZXh0KCk7XG4gIH1cblxuICBhc3luYyBhcHBseVNjcmlwdHMoKSB7XG4gICAgYXdhaXQgdGhpcy5zYXZlU2V0dGluZ3MoKTtcbiAgICBhd2FpdCB0aGlzLmxvYWRTY3JpcHRzKCk7XG4gIH1cbn1cblxuY2xhc3MgUGV0U2V0dGluZ1RhYiBleHRlbmRzIFBsdWdpblNldHRpbmdUYWIge1xuICBwbHVnaW46IFBldFBsdWdpbjtcblxuICBjb25zdHJ1Y3RvcihhcHA6IEFwcCwgcGx1Z2luOiBQZXRQbHVnaW4pIHtcbiAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gIH1cblxuICB3aWRlVGV4dEFyZWEoY29udGFpbmVyRWw6IEhUTUxFbGVtZW50LCBuYW1lOiBzdHJpbmcsIGRlc2M6IHN0cmluZywgZ2V0OiAoKSA9PiBzdHJpbmcsIHNldDogKHY6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPikge1xuICAgIGNvbnN0IHN0ID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUobmFtZSkuc2V0RGVzYyhkZXNjKVxuICAgICAgLmFkZFRleHRBcmVhKCh0KSA9PiB0LnNldFZhbHVlKGdldCgpKS5vbkNoYW5nZShzZXQpKTtcbiAgICBzdC5zZXR0aW5nRWwuYWRkQ2xhc3MoXCJwZXQtc2V0dGluZy13aWRlXCIpO1xuICB9XG5cbiAgZGlzcGxheSgpOiB2b2lkIHtcbiAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgIGNvbnN0IHMgPSB0aGlzLnBsdWdpbi5zZXR0aW5ncztcbiAgICBjb25zdCBhcHBseSA9ICgpID0+IHRoaXMucGx1Z2luLmFwcGx5U2V0dGluZ3MoKTtcbiAgICBjb25zdCBhcHBseVNjcmlwdHMgPSAoKSA9PiB0aGlzLnBsdWdpbi5hcHBseVNjcmlwdHMoKTtcbiAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJDUFwiKS5zZXRIZWFkaW5nKCk7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJDUCBcdTU0MERcIikuYWRkVGV4dCgodCkgPT5cbiAgICAgIHQuc2V0VmFsdWUocy5jb3VwbGVOYW1lKS5vbkNoYW5nZShhc3luYyAodikgPT4geyBzLmNvdXBsZU5hbWUgPSB2OyBhd2FpdCBhcHBseSgpOyB9KVxuICAgICk7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTY2M0VcdTc5M0EgQ1AgXHU1NDBEXCIpLmFkZFRvZ2dsZSgodGcpID0+XG4gICAgICB0Zy5zZXRWYWx1ZShzLnNob3dDb3VwbGVOYW1lKS5vbkNoYW5nZShhc3luYyAodikgPT4geyBzLnNob3dDb3VwbGVOYW1lID0gdjsgYXdhaXQgYXBwbHkoKTsgfSlcbiAgICApO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2NjNFXHU3OTNBXHU1NDA0XHU4MUVBXHU1NDBEXHU1QjU3XCIpLmFkZFRvZ2dsZSgodGcpID0+XG4gICAgICB0Zy5zZXRWYWx1ZShzLnNob3dOYW1lcykub25DaGFuZ2UoYXN5bmMgKHYpID0+IHsgcy5zaG93TmFtZXMgPSB2OyBhd2FpdCBhcHBseSgpOyB9KVxuICAgICk7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTRFMjRcdTRFQkFcdTk1RjRcdThERERcIikuc2V0RGVzYyhcIlx1NTBDRlx1N0QyMFx1RkYwQ1x1NTNFRlx1NEUzQVx1OEQxRlx1NjU3MFwiKS5hZGRTbGlkZXIoKHNsKSA9PlxuICAgICAgc2wuc2V0TGltaXRzKC00MCwgODAsIDIpLnNldFZhbHVlKHMuZ2FwKS5zZXREeW5hbWljVG9vbHRpcCgpXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodikgPT4geyBzLmdhcCA9IHY7IGF3YWl0IGFwcGx5KCk7IH0pXG4gICAgKTtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlx1NEUyRFx1OTVGNFx1N0IyNlx1NTNGN1wiKS5zZXREZXNjKFwiXHU1MzU1XHU0RUJBXHU2QTIxXHU1RjBGXHU0RTBCXHU2NjNFXHU3OTNBXHU1NzI4XHU0RTI0XHU0RUJBXHU0RTRCXHU5NUY0XHVGRjBDXHU3NTU5XHU3QTdBXHU0RTBEXHU2NjNFXHU3OTNBXCIpLmFkZFRleHQoKHQpID0+XG4gICAgICB0LnNldFZhbHVlKHMubGlua1N5bWJvbCkub25DaGFuZ2UoYXN5bmMgKHYpID0+IHsgcy5saW5rU3ltYm9sID0gdjsgYXdhaXQgYXBwbHkoKTsgfSlcbiAgICApO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU1Rjg1XHU2NzNBXHU1NDdDXHU1NDM4XHU1MkE4XHU3NTNCXCIpLmFkZFRvZ2dsZSgodGcpID0+XG4gICAgICB0Zy5zZXRWYWx1ZShzLmlkbGVBbmltYXRlKS5vbkNoYW5nZShhc3luYyAodikgPT4geyBzLmlkbGVBbmltYXRlID0gdjsgYXdhaXQgYXBwbHkoKTsgfSlcbiAgICApO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU5MUNEXHU3RjZFXHU0RjREXHU3RjZFXCIpLmFkZEJ1dHRvbigoYikgPT5cbiAgICAgIGIuc2V0QnV0dG9uVGV4dChcIlx1NTZERVx1NTIzMFx1NURFNlx1NEUwQVx1ODlEMlwiKS5vbkNsaWNrKGFzeW5jICgpID0+IHsgcy54ID0gNDA7IHMueSA9IDEyMDsgYXdhaXQgYXBwbHkoKTsgfSlcbiAgICApO1xuXG4gICAgdGhpcy5jaGFyU2VjdGlvbihjb250YWluZXJFbCwgXCJBXCIsIHMuYSk7XG4gICAgdGhpcy5jaGFyU2VjdGlvbihjb250YWluZXJFbCwgXCJCXCIsIHMuYik7XG5cbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlx1NTNDQ1x1NEVCQVx1NTZGRVx1RkYwOFx1NzI3NVx1NjI0QiAvIFx1NjJFNVx1NjJCMVx1N0I0OVx1RkYwOVwiKS5zZXRIZWFkaW5nKCk7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTUzQ0NcdTRFQkFcdTc2RjhcdTVCRjlcdTU5MjdcdTVDMEZcIikuc2V0RGVzYyhcIlx1NzZGOFx1NUJGOVx1NEUyNFx1NEVCQVx1N0FEOVx1N0FDQlx1OEVBQlx1OUFEOFx1NzY4NFx1NTAwRFx1NjU3MFx1RkYwQzEgXHU4ODY4XHU3OTNBXHU1NDhDXHU1MzU1XHU0RUJBXHU3QUQ5XHU3NzQwXHU0RTAwXHU2ODM3XHU5QUQ4XCIpLmFkZFNsaWRlcigoc2wpID0+XG4gICAgICBzbC5zZXRMaW1pdHMoMC41LCAxLjUsIDAuMDUpLnNldFZhbHVlKHMucGFpclNpemUgPiAzID8gMSA6IHMucGFpclNpemUpLnNldER5bmFtaWNUb29sdGlwKClcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2KSA9PiB7IHMucGFpclNpemUgPSB2OyBhd2FpdCBhcHBseSgpOyB9KVxuICAgICk7XG4gICAgdGhpcy53aWRlVGV4dEFyZWEoY29udGFpbmVyRWwsIFwiXHU1M0NDXHU0RUJBXHU3MkI2XHU2MDAxXHU4ODY4XCIsXG4gICAgICBcIlx1NkJDRlx1ODg0Q1x1MzAwQ1x1NzJCNlx1NjAwMVx1NTQwRDogXHU4REVGXHU1Rjg0IFtcdTVFMjdcdTY1NzBdIFtcdTVFMjdcdTczODddXHUzMDBEXHUzMDAyaWRsZSBcdTVGQzVcdTU4NkJcdUZGMEN3YWxrIFx1NzUyOFx1NEU4RVx1NzlGQlx1NTJBOFx1NjVGNlx1MzAwMlx1NTJBOFx1NEY1Q1x1ODExQVx1NjcyQ1x1OTFDQ1x1NzUyOCBwYWlyIGlkbGUgLyBwYWlyIHdhbGsgLyBwYWlyIG9mZlx1MzAwMlwiLFxuICAgICAgKCkgPT4gcy5wYWlyU3RhdGVzLCBhc3luYyAodikgPT4geyBzLnBhaXJTdGF0ZXMgPSB2OyBhd2FpdCBhcHBseSgpOyB9KTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU4MUVBXHU1MkE4XHU0RTkyXHU1MkE4XCIpLnNldEhlYWRpbmcoKTtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlx1NUYwMFx1NTQyRlwiKS5hZGRUb2dnbGUoKHRnKSA9PlxuICAgICAgdGcuc2V0VmFsdWUocy5hdXRvUGxheSkub25DaGFuZ2UoYXN5bmMgKHYpID0+IHsgcy5hdXRvUGxheSA9IHY7IGF3YWl0IGFwcGx5KCk7IH0pXG4gICAgKTtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlx1NjcwMFx1NzdFRFx1OTVGNFx1OTY5NFwiKS5zZXREZXNjKFwiXHU3OUQyXCIpLmFkZFNsaWRlcigoc2wpID0+XG4gICAgICBzbC5zZXRMaW1pdHMoMywgMzAwLCAxKS5zZXRWYWx1ZShzLmludGVydmFsTWluKS5zZXREeW5hbWljVG9vbHRpcCgpXG4gICAgICAgIC5vbkNoYW5nZShhc3luYyAodikgPT4geyBzLmludGVydmFsTWluID0gdjsgYXdhaXQgYXBwbHkoKTsgfSlcbiAgICApO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU2NzAwXHU5NTdGXHU5NUY0XHU5Njk0XCIpLnNldERlc2MoXCJcdTc5RDJcIikuYWRkU2xpZGVyKChzbCkgPT5cbiAgICAgIHNsLnNldExpbWl0cygzLCA2MDAsIDEpLnNldFZhbHVlKHMuaW50ZXJ2YWxNYXgpLnNldER5bmFtaWNUb29sdGlwKClcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2KSA9PiB7IHMuaW50ZXJ2YWxNYXggPSB2OyBhd2FpdCBhcHBseSgpOyB9KVxuICAgICk7XG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTVCRjlcdThCRERcdTY5ODJcdTczODdcIikuc2V0RGVzYyhcIlx1ODFFQVx1NTJBOFx1ODlFNlx1NTNEMVx1NjVGNlx1OTAwOVx1NUJGOVx1OEJERFx1NzY4NFx1Njk4Mlx1NzM4NyglKVwiKS5hZGRTbGlkZXIoKHNsKSA9PlxuICAgICAgc2wuc2V0TGltaXRzKDAsIDEwMCwgNSkuc2V0VmFsdWUocy5kaWFsb2d1ZUNoYW5jZSkuc2V0RHluYW1pY1Rvb2x0aXAoKVxuICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHYpID0+IHsgcy5kaWFsb2d1ZUNoYW5jZSA9IHY7IGF3YWl0IGFwcGx5KCk7IH0pXG4gICAgKTtcblxuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU1QkY5XHU4QkREXCIpLnNldEhlYWRpbmcoKTtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlx1NEVDRVx1N0IxNFx1OEJCMFx1OEJGQlx1NTNENlwiKS5zZXREZXNjKFwiXHU1RTkzXHU1MTg1XHU3QjE0XHU4QkIwXHU4REVGXHU1Rjg0XHVGRjBDXHU3NTU5XHU3QTdBXHU1MjE5XHU3NTI4XHU0RTBCXHU5NzYyXHU3Njg0XHU2NTg3XHU2NzJDXHU2ODQ2XCIpLmFkZFRleHQoKHQpID0+XG4gICAgICB0LnNldFBsYWNlaG9sZGVyKFwiXHU2QTc5XHU3QTQ2L1x1NUJGOVx1OEJERC5tZFwiKS5zZXRWYWx1ZShzLmRpYWxvZ3VlTm90ZSlcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2KSA9PiB7IHMuZGlhbG9ndWVOb3RlID0gdjsgYXdhaXQgYXBwbHlTY3JpcHRzKCk7IH0pXG4gICAgKTtcbiAgICB0aGlzLndpZGVUZXh0QXJlYShjb250YWluZXJFbCwgXCJcdTVCRjlcdThCRERcdTgxMUFcdTY3MkNcIixcbiAgICAgIFwiXHU2QkNGXHU4ODRDXHUzMDBDQTogXHU1MTg1XHU1QkI5XHUzMDBEXHU2MjE2XHUzMDBDQjogXHU1MTg1XHU1QkI5XHUzMDBEXHVGRjA4XHU0RTVGXHU1M0VGXHU1MTk5XHU0RUJBXHU1NDBEXHVGRjA5XHVGRjBDXHU3QTdBXHU4ODRDXHU1MjA2XHU5Njk0XHU0RTBEXHU1NDBDXHU1QkY5XHU4QkREXHUzMDAyXHU3MEI5XHU1MUZCXHU1NDhDXHU1QzBGXHU4MUVBXHU1MkE4XHU0RTkyXHU1MkE4XHU0RjFBXHU5NjhGXHU2NzNBXHU2MkJEXHU0RTAwXHU2QkI1XHVGRjBDXHU0RTAwXHU1MzRBXHU1NzUwXHU3NzQwXHU4QkY0XHUzMDAxXHU0RTAwXHU1MzRBXHU3QUQ5XHU3NzQwXHU4QkY0XHUzMDAyXCIsXG4gICAgICAoKSA9PiBzLmRpYWxvZ3VlU2NyaXB0LCBhc3luYyAodikgPT4geyBzLmRpYWxvZ3VlU2NyaXB0ID0gdjsgYXdhaXQgYXBwbHlTY3JpcHRzKCk7IH0pO1xuXG4gICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoXCJcdTUyQThcdTRGNUNcIikuc2V0SGVhZGluZygpO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU0RUNFXHU3QjE0XHU4QkIwXHU4QkZCXHU1M0Q2XCIpLnNldERlc2MoXCJcdTVFOTNcdTUxODVcdTdCMTRcdThCQjBcdThERUZcdTVGODRcdUZGMENcdTc1NTlcdTdBN0FcdTUyMTlcdTc1MjhcdTRFMEJcdTk3NjJcdTc2ODRcdTY1ODdcdTY3MkNcdTY4NDZcIikuYWRkVGV4dCgodCkgPT5cbiAgICAgIHQuc2V0UGxhY2Vob2xkZXIoXCJcdTZBNzlcdTdBNDYvXHU1MkE4XHU0RjVDLm1kXCIpLnNldFZhbHVlKHMuYWN0aW9uTm90ZSlcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2KSA9PiB7IHMuYWN0aW9uTm90ZSA9IHY7IGF3YWl0IGFwcGx5U2NyaXB0cygpOyB9KVxuICAgICk7XG4gICAgdGhpcy53aWRlVGV4dEFyZWEoY29udGFpbmVyRWwsIFwiXHU1MkE4XHU0RjVDXHU4MTFBXHU2NzJDXCIsXG4gICAgICBcIlx1MzAwQyMgXHU1NDBEXHU3OUYwXHUzMDBEXHU1QjlBXHU0RTQ5XHU1MkE4XHU0RjVDXHUzMDAydmlkZW8gXHU4REVGXHU1Rjg0IFx1NjRBRFx1NjUzRVx1ODlDNlx1OTg5MVx1MzAwMmNoYXQgaWRsZSBcdTdBRDlcdTc3NDBcdTk2OEZcdTY3M0FcdThCRjRcdTRFMDBcdTZCQjVcdTVCRjlcdThCRERcdUZGMUJjaGF0IHNpdCBcdTU3NTBcdTc3NDBcdThCRjRcdTMwMDJcIixcbiAgICAgICgpID0+IHMuYWN0aW9uU2NyaXB0LCBhc3luYyAodikgPT4geyBzLmFjdGlvblNjcmlwdCA9IHY7IGF3YWl0IGFwcGx5U2NyaXB0cygpOyB9KTtcbiAgfVxuXG4gIGNoYXJTZWN0aW9uKGNvbnRhaW5lckVsOiBIVE1MRWxlbWVudCwgd2hvOiBXaG8sIGM6IENoYXJhY3Rlcikge1xuICAgIGNvbnN0IGFwcGx5ID0gKCkgPT4gdGhpcy5wbHVnaW4uYXBwbHlTZXR0aW5ncygpO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKGBcdTg5RDJcdTgyNzIgJHt3aG99XHVGRjFBJHtjLm5hbWV9YCkuc2V0SGVhZGluZygpO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU1NDBEXHU1QjU3XCIpLmFkZFRleHQoKHQpID0+XG4gICAgICB0LnNldFZhbHVlKGMubmFtZSkub25DaGFuZ2UoYXN5bmMgKHYpID0+IHsgYy5uYW1lID0gdjsgYXdhaXQgYXBwbHkoKTsgfSlcbiAgICApO1xuICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKFwiXHU5QUQ4XHU1RUE2XCIpLnNldERlc2MoXCJcdTRFQkFcdTcyNjlcdThFQUJcdTlBRDhcdUZGMDhcdTUwQ0ZcdTdEMjBcdUZGMDlcdTMwMDJcdTU3NTBcdTRFMEJcdTMwMDFcdThENzBcdThERUZcdTMwMDFcdThCRjRcdThCRERcdTkwRkRcdTYzMDlcdTUzQkJcdTkwMEZcdTY2MEVcdTU0MEVcdTc2ODRcdTVCOUVcdTk2NDVcdThGNkVcdTVFRDNcdTVCRjlcdTlGNTBcdTUyMzBcdThGRDlcdTRFMkFcdTlBRDhcdTVFQTZcdTMwMDJcIikuYWRkU2xpZGVyKChzbCkgPT5cbiAgICAgIHNsLnNldExpbWl0cyg0OCwgMzIwLCA0KS5zZXRWYWx1ZShjLnNpemUpLnNldER5bmFtaWNUb29sdGlwKClcbiAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2KSA9PiB7IGMuc2l6ZSA9IHY7IGF3YWl0IGFwcGx5KCk7IH0pXG4gICAgKTtcbiAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZShcIlx1OTU1Q1x1NTBDRlx1N0ZGQlx1OEY2Q1wiKS5hZGRUb2dnbGUoKHRnKSA9PlxuICAgICAgdGcuc2V0VmFsdWUoYy5mbGlwKS5vbkNoYW5nZShhc3luYyAodikgPT4geyBjLmZsaXAgPSB2OyBhd2FpdCBhcHBseSgpOyB9KVxuICAgICk7XG4gICAgdGhpcy53aWRlVGV4dEFyZWEoY29udGFpbmVyRWwsIFwiXHU3MkI2XHU2MDAxXHU4ODY4XCIsXG4gICAgICBcIlx1NkJDRlx1ODg0Q1x1MzAwQ1x1NzJCNlx1NjAwMVx1NTQwRDogXHU4REVGXHU1Rjg0IFtcdTVFMjdcdTY1NzBdIFtcdTVFMjdcdTczODddXHUzMDBEXHUzMDAyXHU0RjhCXHVGRjFBaWRsZTogYXNzZXRzL0EtaWRsZS5wbmcgXHVGRjBGIHdhbGs6IGFzc2V0cy9BLXdhbGsucG5nIDYgOFwiLFxuICAgICAgKCkgPT4gYy5zdGF0ZXMsIGFzeW5jICh2KSA9PiB7IGMuc3RhdGVzID0gdjsgYXdhaXQgYXBwbHkoKTsgfSk7XG4gIH1cbn0iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLHNCQUEyRjtBQWlCM0YsSUFBTSxVQUFVO0FBaURoQixJQUFNLFVBQWtDO0FBQUEsRUFDdEMsTUFBTTtBQUFBLEVBQUssUUFBUTtBQUFBLEVBQUssT0FBTztBQUFBLEVBQUssTUFBTTtBQUFBLEVBQUssUUFBUTtBQUFBLEVBQUssS0FBSztBQUNuRTtBQUVBLElBQU0sbUJBQW1CO0FBQUE7QUFBQTtBQUl6QixJQUFNLGtCQUFrQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQW9CeEIsSUFBTSxXQUFXO0FBQUE7QUFB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
