import { App, Menu, Notice, Plugin, PluginSettingTab, Setting, TFile, normalizePath } from "obsidian";

type Who = "A" | "B";
type Target = Who | "both";
type Facing = "left" | "right" | null;

interface SpriteDef { path: string; frames: number; fps: number; }
interface SpriteMetrics {
  imgW: number;
  imgH: number;
  frameW: number;
  bx: number;
  by: number;
  bw: number;
  bh: number;
}
type StateMap = Record<string, SpriteDef>;
const FADE_MS = 180;

interface Character {
  name: string;
  size: number;
  flip: boolean;
  states: string;
}

interface PetSettings {
  coupleName: string;
  showCoupleName: boolean;
  showNames: boolean;
  a: Character;
  b: Character;
  gap: number;
  linkSymbol: string;
  pairStates: string;
  pairSize: number;
  x: number;
  y: number;
  idleAnimate: boolean;
  autoPlay: boolean;
  intervalMin: number;
  intervalMax: number;
  dialogueChance: number;
  dialogueScript: string;
  dialogueNote: string;
  actionScript: string;
  actionNote: string;
}

interface DialogueLine { who: Who; text: string; }
type Dialogue = DialogueLine[];

type Step =
  | { kind: "wait"; ms: number }
  | { kind: "move"; dx: number; dy: number; ms: number }
  | { kind: "wander"; ms: number }
  | { kind: "anim"; target: Target; name: string }
  | { kind: "state"; target: Target; name: string }
  | { kind: "pair"; name: string }
  | { kind: "say"; who: Who; text: string }
  | { kind: "face"; dir: "left" | "right" | "reset" }
  | { kind: "video"; path: string; walkAt?: number; walkMs?: number }
  | { kind: "chat"; pose: "sit" | "idle" };

interface Action { name: string; steps: Step[]; }

const ANIM_MS: Record<string, number> = {
  jump: 600, bounce: 800, shake: 500, spin: 800, wiggle: 600, nod: 600,
};

const DEFAULT_DIALOGUE = `A: 你在写什么呀？
B: 今天的笔记，别偷看。
A: 就看一眼嘛。`;

const DEFAULT_ACTIONS = `# 牵手到处逛逛
video assets/pair-stroll.mp4

# 站着聊天
chat idle

# 蹦跶
A jump
wait 250
B jump
wait 250
both bounce

# 撒娇
A shake
A say 陪我玩~
wait 1500
B nod
B say 好好好`;

const A_STATES = `sit: assets/A-sit.png
sit-talk: assets/A-sit-talk.png 2 4
idle: assets/A-idle.png
walk: assets/A-walk.png 6 8`;

const B_STATES = `sit: assets/B-sit.png
sit-talk: assets/B-sit-talk.png 2 4
idle: assets/B-idle.png
walk: assets/B-walk.png 6 8`;

const PAIR_STATES = `idle: assets/pair-hold.png
walk: assets/pair-walk.png 6 8`;

const DEFAULT_SETTINGS: PetSettings = {
  coupleName: "橹穆",
  showCoupleName: true,
  showNames: true,
  a: { name: "老妈妈", size: 200, flip: false, states: A_STATES },
  b: { name: "老爸爸", size: 200, flip: false, states: B_STATES },
  gap: -8,
  linkSymbol: "♥",
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
  actionNote: "",
};

const WHOS: Who[] = ["A", "B"];
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export default class PetPlugin extends Plugin {
  settings: PetSettings;

  coupleEl: HTMLDivElement | null = null;
  charEls: Record<Who, HTMLElement | null> = { A: null, B: null };
  bodyEls: Record<Who, HTMLElement | null> = { A: null, B: null };
  spriteEls: Record<Who, HTMLElement | null> = { A: null, B: null };
  bubbleEls: Record<Who, HTMLElement | null> = { A: null, B: null };
  bubbleTimers: Record<Who, number | null> = { A: null, B: null };

  pairEl: HTMLElement | null = null;
  pairBodyEl: HTMLElement | null = null;
  pairSpriteEl: HTMLElement | null = null;
  clipEl: HTMLElement | null = null;
  clipVideo: HTMLVideoElement | null = null;
  clipRaf = 0;
  pairBubbleEls: Record<Who, HTMLElement | null> = { A: null, B: null };

  stateMaps: Record<Who, StateMap> = { A: {}, B: {} };
  pairStateMap: StateMap = {};
  curState: Record<Who, string> = { A: "", B: "" };
  pairMode = false;
  curPair = "";
  metricsCache = new Map<string, SpriteMetrics>();
  metricsWait = new Map<string, Promise<SpriteMetrics>>();

  dialogues: Dialogue[] = [];
  actions: Action[] = [];

  runId = 0;
  busy = false;
  dragging = false;
  facing: Facing = null;
  nextAt = 0;

  async onload() {
    await this.loadSettings();
    await this.loadScripts();
    this.addSettingTab(new PetSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.renderCouple();
      this.scheduleNext();
    });

    this.registerInterval(window.setInterval(() => this.tick(), 1000));
    this.registerDomEvent(window, "resize", () => this.clampIntoView());

    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        const watched = [this.settings.dialogueNote, this.settings.actionNote]
          .map((p) => p.trim()).filter(Boolean).map((p) => normalizePath(p));
        if (watched.includes(f.path)) this.loadScripts();
      })
    );

    this.addCommand({ id: "toggle-pet", name: "显示 / 隐藏", callback: () => {
      if (this.coupleEl) this.destroyCouple(); else this.renderCouple();
    }});
    this.addCommand({ id: "random-dialogue", name: "随机对话", callback: () => {
      if (this.dialogues.length) this.runDialogue(pick(this.dialogues));
    }});
    this.addCommand({ id: "random-action", name: "随机动作", callback: () => {
      if (this.actions.length) this.runAction(pick(this.actions));
    }});
    this.addCommand({ id: "stop", name: "停止当前动作", callback: () => this.cancel() });
    this.addCommand({ id: "toggle-auto", name: "开关自动互动", callback: async () => {
      this.settings.autoPlay = !this.settings.autoPlay;
      await this.saveSettings();
      new Notice(`自动互动：${this.settings.autoPlay ? "开" : "关"}`);
    }});
    this.addCommand({ id: "reload-scripts", name: "重新读取对话 / 动作脚本", callback: async () => {
      await this.loadScripts();
      new Notice(`已读取 ${this.dialogues.length} 段对话，${this.actions.length} 个动作`);
    }});
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
    this.registerDomEvent(el, "contextmenu", (e: MouseEvent) => this.showMenu(e));

    this.coupleEl = el;
    WHOS.forEach((w) => this.setState(w, this.restName(w)));
    this.updateFacing();
    this.clampIntoView();
  }

  createChar(parent: HTMLElement, who: Who) {
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

  createPair(parent: HTMLElement) {
    const pair = parent.createDiv({ cls: "pet-pair" });
    const body = pair.createDiv({ cls: "pet-body" });
    this.pairBubbleEls.A = pair.createDiv({ cls: "pet-bubble pet-bubble-a" });
    this.pairBubbleEls.B = pair.createDiv({ cls: "pet-bubble pet-bubble-b" });
    this.pairEl = pair;
    this.pairBodyEl = body;
    this.pairSpriteEl = null;
    this.registerDomEvent(pair, "click", () => this.onClickPet("A"));
  }

  onClickPet(who: Who) {
    if (this.dragging || this.coupleEl?.hasClass("pet-dragging")) return;
    if (this.dialogues.length) this.runDialogue(pick(this.dialogues));
    else this.playAnim(who, "jump", ++this.runId);
  }

  destroyCouple() {
    this.cancel();
    this.coupleEl?.remove();
    this.coupleEl = null;
    this.pairEl = this.pairBodyEl = this.pairSpriteEl = this.clipEl = this.clipVideo = null;
    this.clipRaf = 0;
    WHOS.forEach((w) => {
      this.charEls[w] = this.bodyEls[w] = this.bubbleEls[w] = null;
      this.spriteEls[w] = this.pairBubbleEls[w] = null;
    });
  }

  showMenu(e: MouseEvent) {
    e.preventDefault();
    const menu = new Menu();
    this.actions.forEach((a) =>
      menu.addItem((i) => i.setTitle(`动作：${a.name}`).setIcon("play").onClick(() => this.runAction(a)))
    );
    if (this.actions.length && this.dialogues.length) menu.addSeparator();
    this.dialogues.forEach((d) =>
      menu.addItem((i) =>
        i.setTitle(`对话：${d[0].text.slice(0, 14)}`).setIcon("message-circle").onClick(() => this.runDialogue(d))
      )
    );
    menu.addSeparator();
    menu.addItem((i) => i.setTitle("停下").setIcon("square").onClick(() => this.cancel()));
    menu.addItem((i) => i.setTitle("隐藏").setIcon("eye-off").onClick(() => this.destroyCouple()));
    menu.showAtMouseEvent(e);
  }

  metricsKey(def: SpriteDef): string {
    return `${normalizePath(def.path)}|${def.frames}`;
  }

  getMetrics(def: SpriteDef): Promise<SpriteMetrics> {
    const key = this.metricsKey(def);
    const hit = this.metricsCache.get(key);
    if (hit) return Promise.resolve(hit);
    const pending = this.metricsWait.get(key);
    if (pending) return pending;

    const url = this.app.vault.adapter.getResourcePath(normalizePath(def.path));
    const job = new Promise<SpriteMetrics>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const m = this.measureSprite(img, def.frames);
        this.metricsCache.set(key, m);
        this.metricsWait.delete(key);
        resolve(m);
      };
      img.onerror = () => {
        const m: SpriteMetrics = { imgW: 1, imgH: 1, frameW: 1, bx: 0, by: 0, bw: 1, bh: 1 };
        this.metricsCache.set(key, m);
        this.metricsWait.delete(key);
        resolve(m);
      };
      img.src = url;
    });
    this.metricsWait.set(key, job);
    return job;
  }

  measureSprite(img: HTMLImageElement, frames: number): SpriteMetrics {
    const imgW = img.naturalWidth || 1;
    const imgH = img.naturalHeight || 1;
    const n = Math.max(1, frames);
    const frameW = imgW / n;
    const fallback: SpriteMetrics = { imgW, imgH, frameW, bx: 0, by: 0, bw: frameW, bh: imgH };
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
    } catch {
      return fallback;
    }
  }

  pairTargetHeight(): number {
    const scale = this.settings.pairSize > 3 ? 1 : this.settings.pairSize;
    return Math.max(this.settings.a.size, this.settings.b.size) * (scale || 1);
  }

  makeSprite(def: SpriteDef, targetH: number): HTMLElement {
    const el = createDiv({ cls: "pet-sprite" });
    const url = this.app.vault.adapter.getResourcePath(normalizePath(def.path));
    el.style.backgroundImage = `url("${url}")`;
    el.style.height = `${targetH}px`;
    el.style.width = `${Math.round(targetH * 0.7)}px`;
    void this.layoutSprite(el, def, targetH);
    return el;
  }

  async layoutSprite(el: HTMLElement, def: SpriteDef, targetH: number) {
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
          { backgroundPosition: `${x0 - m.frameW * def.frames * scale}px ${y0}px` },
        ],
        {
          duration: (def.frames / Math.max(1, def.fps)) * 1000,
          iterations: Infinity,
          easing: `steps(${def.frames}, end)`,
        }
      );
    }
  }

  isMouthSwitch(from: string, to: string): boolean {
    const mouth = (s: string) => s === "sit-talk" || s === "talk";
    const rest = (s: string) => s === "sit" || s === "idle";
    return (mouth(from) && rest(to)) || (rest(from) && mouth(to));
  }

  swapSprite(body: HTMLElement, prev: HTMLElement | null, def: SpriteDef, targetH: number, fade: boolean): HTMLElement {
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
      prev?.remove();
    }
    return sp;
  }

  restName(who: Who): string {
    const map = this.stateMaps[who];
    if (map["sit"]) return "sit";
    if (map["idle"]) return "idle";
    return "sit";
  }

  sitting(who: Who): boolean {
    const s = this.curState[who];
    return s === "sit" || s === "sit-talk" || s === "sitdown" || s === "";
  }

  poseRest(who: Who): string {
    const map = this.stateMaps[who];
    if (this.sitting(who)) {
      if (map["sit"]) return "sit";
    }
    if (map["idle"]) return "idle";
    if (map["sit"]) return "sit";
    return "idle";
  }
  
  talkName(who: Who): string {
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
  
  beginTalk(who: Who) {
    if (this.pairMode) return;
    WHOS.forEach((w) => this.setState(w, w === who ? this.talkName(w) : this.poseRest(w)));
  }

  setState(who: Who, name: string) {
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

  setPair(name: string) {
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
      console.warn(`[pet] 没有配置双人状态 "${name}"，跳过`);
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

  parseStates(text: string): StateMap {
    const map: StateMap = {};
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) continue;
      const m = line.match(/^([^\s:：]+)\s*[:：]\s*(.+)$/);
      if (!m) continue;
      const tokens = m[2].trim().split(/\s+/);
      let frames = 1, fps = 8;
      const isNum = (t: string | undefined) => t !== undefined && !isNaN(Number(t));
      if (tokens.length >= 3 && isNum(tokens[tokens.length - 1]) && isNum(tokens[tokens.length - 2])) {
        fps = Number(tokens.pop());
        frames = Number(tokens.pop());
      } else if (tokens.length >= 2 && isNum(tokens[tokens.length - 1])) {
        frames = Number(tokens.pop());
      }
      map[m[1].toLowerCase()] = {
        path: tokens.join(" "),
        frames: Math.max(1, Math.floor(frames)),
        fps: Math.max(1, fps),
      };
    }
    return map;
  }

  setFacing(f: Facing) {
    this.facing = f;
    this.updateFacing();
  }

  updateFacing() {
    WHOS.forEach((w) => {
      const c = w === "A" ? this.settings.a : this.settings.b;
      const sp = this.spriteEls[w];
      if (!sp) return;
      const sitting = this.curState[w] === "sit" || this.curState[w] === "sit-talk";
      const flipped = sitting
        ? this.facing === "left"
        : c.flip !== (this.facing === "left");
      sp.toggleClass("pet-flip", flipped);
    });
    if (this.pairSpriteEl) this.pairSpriteEl.toggleClass("pet-flip", this.facing === "left");
  }

  clampPos(x: number, y: number) {
    const w = this.coupleEl?.offsetWidth ?? 0;
    const h = this.coupleEl?.offsetHeight ?? 0;
    return {
      x: Math.round(Math.max(0, Math.min(window.innerWidth - w, x))),
      y: Math.round(Math.max(0, Math.min(window.innerHeight - h, y))),
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

  private sleep(ms: number, id: number): Promise<boolean> {
    return new Promise((resolve) => window.setTimeout(() => resolve(id === this.runId), ms));
  }

  stopClip() {
    this.coupleEl?.removeClass("pet-clip-playing");
    this.coupleEl?.removeClass("pet-clip-blend");
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

  private keyWhite(ctx: CanvasRenderingContext2D, w: number, h: number) {
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

  private async slideCouple(x: number, y: number, ms: number, id: number, flip: boolean): Promise<boolean> {
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

  private async runClipWalk(walkAt: number, walkMs: number, id: number) {
    if (!(await this.sleep(walkAt, id))) return;
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

  private async playClip(path: string, id: number, walkAt?: number, walkMs?: number): Promise<boolean> {
    const couple = this.coupleEl;
    const body = this.pairBodyEl;
    if (!couple || !body) return false;

    const rel = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(rel);
    let src = "";
    if (file instanceof TFile) {
      src = this.app.vault.adapter.getResourcePath(file.path);
    } else if (await this.app.vault.adapter.exists(rel)) {
      src = this.app.vault.adapter.getResourcePath(rel);
    } else {
      new Notice(`找不到视频：${path}`);
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

    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      v.addEventListener("canplay", () => done(true), { once: true });
      v.addEventListener("error", () => done(false), { once: true });
      v.load();
      window.setTimeout(() => done(v.readyState >= 2), 2500);
    });

    if (id !== this.runId || !ready) {
      v.remove();
      if (id === this.runId && !ready) new Notice("视频播不出来");
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
      } catch {
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
      walkMs = 5000;
    }
    if (walkAt != null && walkAt >= 0) void this.runClipWalk(walkAt, walkMs ?? 5000, id);

    const ok = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(success && id === this.runId);
      };
      const ms = Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 + 500 : 20000;
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

  cancel(opts?: { restore?: boolean }) {
    this.runId++;
    this.busy = false;
    this.stopClip();
    this.hideBubbles();
    WHOS.forEach((w) => {
      this.charEls[w]?.removeClass("pet-talking");
      const b = this.bodyEls[w];
      if (b) Object.keys(ANIM_MS).forEach((n) => b.removeClass(`pet-anim-${n}`));
    });
    this.pairEl?.removeClass("pet-talking");
    if (this.pairBodyEl) Object.keys(ANIM_MS).forEach((n) => this.pairBodyEl!.removeClass(`pet-anim-${n}`));

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
    if (opts?.restore !== false) {
      WHOS.forEach((w) => this.setState(w, this.restName(w)));
      this.setPair("off");
    }
  }

  async runAction(action: Action) {
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

  private async runStep(step: Step, id: number): Promise<boolean> {
    switch (step.kind) {
      case "wait":
        return this.sleep(step.ms, id);
      case "move":
        return this.moveTo(this.settings.x + step.dx, this.settings.y + step.dy, step.ms, id);
      case "wander": {
        const w = this.coupleEl?.offsetWidth ?? 0;
        const h = this.coupleEl?.offsetHeight ?? 0;
        return this.moveTo(
          Math.random() * Math.max(0, window.innerWidth - w),
          Math.random() * Math.max(0, window.innerHeight - h),
          step.ms, id
        );
      }
      case "anim":
        return this.playAnim(step.target, step.name, id);
      case "state": {
        const whos: Who[] = step.target === "both" ? WHOS : [step.target];
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
        this.showBubble(step.who, step.text, Math.min(6000, 1500 + step.text.length * 150));
        return true;
      case "chat":
        return this.playChat(step.pose, id);
      case "face":
        this.setFacing(step.dir === "reset" ? null : step.dir);
        return true;
    }
  }

  private async moveTo(x: number, y: number, ms: number, id: number): Promise<boolean> {
    const el = this.coupleEl;
    if (!el) return false;
    const p = this.clampPos(x, y);
    if (p.x > this.settings.x) this.setFacing("right");
    else if (p.x < this.settings.x) this.setFacing("left");

    const usePairWalk = !this.clipEl && this.pairMode && !!this.pairStateMap["walk"];
    const prevPair = this.curPair;
    const soloWalk: Who[] = this.pairMode ? [] : WHOS.filter((w) => !!this.stateMaps[w]["walk"]);
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

  private async playAnim(target: Target, name: string, id: number): Promise<boolean> {
    const ms = ANIM_MS[name];
    if (ms === undefined) return true;
    const cls = `pet-anim-${name}`;
    const bodies: HTMLElement[] = this.pairMode
      ? (this.pairBodyEl ? [this.pairBodyEl] : [])
      : (target === "both" ? WHOS : [target]).map((w) => this.bodyEls[w]).filter((b): b is HTMLElement => !!b);
    bodies.forEach((b) => { b.removeClass(cls); void b.offsetWidth; b.addClass(cls); });
    const ok = await this.sleep(ms, id);
    bodies.forEach((b) => b.removeClass(cls));
    return ok;
  }

  private canStandTalk(): boolean {
    return !!this.stateMaps.A["idle"] && !!this.stateMaps.B["idle"];
  }

  private applyTalkPose(pose: "sit" | "idle") {
    this.setPair("off");
    if (pose === "idle" && this.canStandTalk()) {
      WHOS.forEach((w) => this.setState(w, "idle"));
      return;
    }
    WHOS.forEach((w) => this.setState(w, this.restName(w)));
  }

  private async playDialogueLines(d: Dialogue, id: number): Promise<boolean> {
    for (const line of d) {
      if (id !== this.runId) return false;
      const ms = Math.min(6000, 1500 + line.text.length * 150);
      this.showBubble(line.who, line.text, ms);
      this.beginTalk(line.who);
      const host = this.pairMode ? this.pairEl : this.charEls[line.who];
      host?.addClass("pet-talking");
      const ok = await this.sleep(ms + 300, id);
      host?.removeClass("pet-talking");
      if (id === this.runId && !this.pairMode) this.setState(line.who, this.poseRest(line.who));
      if (!ok) return false;
    }
    return true;
  }

  private async playChat(pose: "sit" | "idle", id: number): Promise<boolean> {
    if (!this.dialogues.length) return true;
    this.applyTalkPose(pose);
    return this.playDialogueLines(pick(this.dialogues), id);
  }

  async runDialogue(d: Dialogue, pose?: "sit" | "idle") {
    if (!this.coupleEl) return;
    const stand = pose === "idle" || (pose === undefined && this.canStandTalk() && Math.random() < 0.5);
    this.cancel({ restore: false });
    const id = ++this.runId;
    this.busy = true;
    this.applyTalkPose(stand ? "idle" : "sit");
    await this.playDialogueLines(d, id);
    if (id === this.runId) this.busy = false;
  }

  showBubble(who: Who, text: string, ms: number) {
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
      this.bubbleEls[w]?.removeClass("pet-bubble-show");
      this.pairBubbleEls[w]?.removeClass("pet-bubble-show");
      const t = this.bubbleTimers[w];
      if (t) window.clearTimeout(t);
      this.bubbleTimers[w] = null;
    });
  }

  scheduleNext() {
    const mn = Math.max(3, Math.min(this.settings.intervalMin, this.settings.intervalMax));
    const mx = Math.max(mn, this.settings.intervalMax);
    this.nextAt = Date.now() + (mn + Math.random() * (mx - mn)) * 1000;
  }

  private tick() {
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

  enableDrag(el: HTMLDivElement) {
    let startX = 0, startY = 0, originX = 0, originY = 0, moved = false;

    const onMove = (e: MouseEvent) => {
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

    this.registerDomEvent(el, "mousedown", (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.cancel();
      this.dragging = true;
      moved = false;
      startX = e.clientX; startY = e.clientY;
      originX = el.offsetLeft; originY = el.offsetTop;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  async loadScripts() {
    const dText = (await this.readNote(this.settings.dialogueNote)) ?? this.settings.dialogueScript;
    const aText = (await this.readNote(this.settings.actionNote)) ?? this.settings.actionScript;
    this.dialogues = this.parseDialogues(dText);
    this.actions = this.parseActions(aText);
  }

  async readNote(path: string): Promise<string | null> {
    const p = path.trim();
    if (!p) return null;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(p));
    if (f instanceof TFile) return this.app.vault.cachedRead(f);
    return null;
  }

  resolveWho(s: string): Who | null {
    const k = s.trim();
    if (/^a$/i.test(k) || k === this.settings.a.name) return "A";
    if (/^b$/i.test(k) || k === this.settings.b.name) return "B";
    return null;
  }

  resolveTarget(s: string): Target | null {
    const k = s.trim().toLowerCase();
    if (k === "both" || k === "all" || k === "都" || k === "两人" || k === "俩") return "both";
    return this.resolveWho(s);
  }

  parseDialogues(text: string): Dialogue[] {
    const out: Dialogue[] = [];
    for (const block of text.split(/\n\s*\n/)) {
      const lines: DialogueLine[] = [];
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

  parseActions(text: string): Action[] {
    const out: Action[] = [];
    let cur: Action | null = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line === "---") continue;
      if (line.startsWith("#")) {
        cur = { name: line.replace(/^#+\s*/, "") || "未命名", steps: [] };
        out.push(cur);
        continue;
      }
      if (!cur) { cur = { name: "未命名", steps: [] }; out.push(cur); }
      const step = this.parseStep(line);
      if (step) cur.steps.push(step);
    }
    return out.filter((a) => a.steps.length);
  }

  parseStep(line: string): Step | null {
    const parts = line.split(/\s+/);
    const head = parts[0].toLowerCase();
    const num = (s: string | undefined, d: number) => {
      const n = parseFloat(s ?? "");
      return isNaN(n) ? d : n;
    };
    switch (head) {
      case "wait": return { kind: "wait", ms: num(parts[1], 1000) };
      case "walk": return { kind: "move", dx: num(parts[1], 200), dy: 0, ms: num(parts[2], 3000) };
      case "move": return { kind: "move", dx: num(parts[1], 0), dy: num(parts[2], 0), ms: num(parts[3], 3000) };
      case "wander": return { kind: "wander", ms: num(parts[1], 4000) };
      case "pair": return { kind: "pair", name: (parts[1] ?? "idle").toLowerCase() };
      case "chat": {
        const p = (parts[1] ?? "sit").toLowerCase();
        return { kind: "chat", pose: p === "idle" || p === "stand" ? "idle" : "sit" };
      }
      case "video": {
        const rest = parts.slice(1);
        let walkAt: number | undefined;
        let walkMs: number | undefined;
        if (rest.length >= 3 && !isNaN(Number(rest[rest.length - 1])) && !isNaN(Number(rest[rest.length - 2]))) {
          walkMs = Number(rest.pop()) * 1000;
          walkAt = Number(rest.pop()) * 1000;
        }
        const path = rest.join(" ").trim();
        return path ? { kind: "video", path, walkAt, walkMs } : null;
      }
      case "face": {
        const d = (parts[1] ?? "reset").toLowerCase();
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
    if (ANIM_MS[verb] !== undefined) return { kind: "anim", target, name: verb };
    return null;
  }

  async loadSettings() {
    const raw: any = (await this.loadData()) ?? {};
    const { pets, animate, ...rest } = raw;

    const migrateChar = (who: Who, base: Character, src: any): Character => {
      const c: any = { ...base, ...(src ?? {}) };
      if (!src?.states || !String(src.states).trim()) {
        c.states = base.states;
        if (typeof src?.size === "number" && src.size <= 120) c.size = base.size;
      }
      if (typeof c.states === "string" && !/\bsit\s*:/.test(c.states)) {
        c.states = (who === "B"
          ? "sit: assets/B-sit.png\nsit-talk: assets/B-sit-talk.png 2 4\n"
          : "sit: assets/A-sit.png\nsit-talk: assets/A-sit-talk.png 2 4\n") + c.states;
      }
      delete c.imagePath;
      return c as Character;
    };

    const s: PetSettings = {
      ...DEFAULT_SETTINGS,
      ...rest,
      a: migrateChar("A", DEFAULT_SETTINGS.a, rest.a),
      b: migrateChar("B", DEFAULT_SETTINGS.b, rest.b),
    };
    if (animate !== undefined && rest.idleAnimate === undefined) s.idleAnimate = !!animate;
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
      s.actionScript = `# 牵手到处逛逛\nvideo assets/pair-stroll.mp4\n\n${script.trim()}\n`;
      actionsMigrated = true;
    }
    if (typeof s.actionScript === "string" && !s.actionScript.includes("# 站着聊天")) {
      s.actionScript = `${s.actionScript.trim()}\n\n# 站着聊天\nchat idle\n`;
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
}

class PetSettingTab extends PluginSettingTab {
  plugin: PetPlugin;

  constructor(app: App, plugin: PetPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  wideTextArea(containerEl: HTMLElement, name: string, desc: string, get: () => string, set: (v: string) => Promise<void>) {
    const st = new Setting(containerEl).setName(name).setDesc(desc)
      .addTextArea((t) => t.setValue(get()).onChange(set));
    st.settingEl.addClass("pet-setting-wide");
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const apply = () => this.plugin.applySettings();
    const applyScripts = () => this.plugin.applyScripts();
    containerEl.empty();

    new Setting(containerEl).setName("CP").setHeading();
    new Setting(containerEl).setName("CP 名").addText((t) =>
      t.setValue(s.coupleName).onChange(async (v) => { s.coupleName = v; await apply(); })
    );
    new Setting(containerEl).setName("显示 CP 名").addToggle((tg) =>
      tg.setValue(s.showCoupleName).onChange(async (v) => { s.showCoupleName = v; await apply(); })
    );
    new Setting(containerEl).setName("显示各自名字").addToggle((tg) =>
      tg.setValue(s.showNames).onChange(async (v) => { s.showNames = v; await apply(); })
    );
    new Setting(containerEl).setName("两人间距").setDesc("像素，可为负数").addSlider((sl) =>
      sl.setLimits(-40, 80, 2).setValue(s.gap).setDynamicTooltip()
        .onChange(async (v) => { s.gap = v; await apply(); })
    );
    new Setting(containerEl).setName("中间符号").setDesc("单人模式下显示在两人之间，留空不显示").addText((t) =>
      t.setValue(s.linkSymbol).onChange(async (v) => { s.linkSymbol = v; await apply(); })
    );
    new Setting(containerEl).setName("待机呼吸动画").addToggle((tg) =>
      tg.setValue(s.idleAnimate).onChange(async (v) => { s.idleAnimate = v; await apply(); })
    );
    new Setting(containerEl).setName("重置位置").addButton((b) =>
      b.setButtonText("回到左上角").onClick(async () => { s.x = 40; s.y = 120; await apply(); })
    );

    this.charSection(containerEl, "A", s.a);
    this.charSection(containerEl, "B", s.b);

    new Setting(containerEl).setName("双人图（牵手 / 拥抱等）").setHeading();
    new Setting(containerEl).setName("双人相对大小").setDesc("相对两人站立身高的倍数，1 表示和单人站着一样高").addSlider((sl) =>
      sl.setLimits(0.5, 1.5, 0.05).setValue(s.pairSize > 3 ? 1 : s.pairSize).setDynamicTooltip()
        .onChange(async (v) => { s.pairSize = v; await apply(); })
    );
    this.wideTextArea(containerEl, "双人状态表",
      "每行「状态名: 路径 [帧数] [帧率]」。idle 必填，walk 用于移动时。动作脚本里用 pair idle / pair walk / pair off。",
      () => s.pairStates, async (v) => { s.pairStates = v; await apply(); });

    new Setting(containerEl).setName("自动互动").setHeading();
    new Setting(containerEl).setName("开启").addToggle((tg) =>
      tg.setValue(s.autoPlay).onChange(async (v) => { s.autoPlay = v; await apply(); })
    );
    new Setting(containerEl).setName("最短间隔").setDesc("秒").addSlider((sl) =>
      sl.setLimits(3, 300, 1).setValue(s.intervalMin).setDynamicTooltip()
        .onChange(async (v) => { s.intervalMin = v; await apply(); })
    );
    new Setting(containerEl).setName("最长间隔").setDesc("秒").addSlider((sl) =>
      sl.setLimits(3, 600, 1).setValue(s.intervalMax).setDynamicTooltip()
        .onChange(async (v) => { s.intervalMax = v; await apply(); })
    );
    new Setting(containerEl).setName("对话概率").setDesc("自动触发时选对话的概率(%)").addSlider((sl) =>
      sl.setLimits(0, 100, 5).setValue(s.dialogueChance).setDynamicTooltip()
        .onChange(async (v) => { s.dialogueChance = v; await apply(); })
    );

    new Setting(containerEl).setName("对话").setHeading();
    new Setting(containerEl).setName("从笔记读取").setDesc("库内笔记路径，留空则用下面的文本框").addText((t) =>
      t.setPlaceholder("橹穆/对话.md").setValue(s.dialogueNote)
        .onChange(async (v) => { s.dialogueNote = v; await applyScripts(); })
    );
    this.wideTextArea(containerEl, "对话脚本",
      "每行「A: 内容」或「B: 内容」（也可写人名），空行分隔不同对话。点击和小自动互动会随机抽一段，一半坐着说、一半站着说。",
      () => s.dialogueScript, async (v) => { s.dialogueScript = v; await applyScripts(); });

    new Setting(containerEl).setName("动作").setHeading();
    new Setting(containerEl).setName("从笔记读取").setDesc("库内笔记路径，留空则用下面的文本框").addText((t) =>
      t.setPlaceholder("橹穆/动作.md").setValue(s.actionNote)
        .onChange(async (v) => { s.actionNote = v; await applyScripts(); })
    );
    this.wideTextArea(containerEl, "动作脚本",
      "「# 名称」定义动作。video 路径 播放视频。chat idle 站着随机说一段对话；chat sit 坐着说。",
      () => s.actionScript, async (v) => { s.actionScript = v; await applyScripts(); });
  }

  charSection(containerEl: HTMLElement, who: Who, c: Character) {
    const apply = () => this.plugin.applySettings();
    new Setting(containerEl).setName(`角色 ${who}：${c.name}`).setHeading();
    new Setting(containerEl).setName("名字").addText((t) =>
      t.setValue(c.name).onChange(async (v) => { c.name = v; await apply(); })
    );
    new Setting(containerEl).setName("高度").setDesc("人物身高（像素）。坐下、走路、说话都按去透明后的实际轮廓对齐到这个高度。").addSlider((sl) =>
      sl.setLimits(48, 320, 4).setValue(c.size).setDynamicTooltip()
        .onChange(async (v) => { c.size = v; await apply(); })
    );
    new Setting(containerEl).setName("镜像翻转").addToggle((tg) =>
      tg.setValue(c.flip).onChange(async (v) => { c.flip = v; await apply(); })
    );
    this.wideTextArea(containerEl, "状态表",
      "每行「状态名: 路径 [帧数] [帧率]」。例：idle: assets/A-idle.png ／ walk: assets/A-walk.png 6 8",
      () => c.states, async (v) => { c.states = v; await apply(); });
  }
}