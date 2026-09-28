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
var BASE_PET = {
  name: "\u5BA0\u7269",
  size: 140,
  imagePath: "",
  emoji: "",
  bodyColor: "#f4b860",
  eyeColor: "#222222",
  shape: "round",
  x: 40,
  y: 120
};
var DEFAULT_SETTINGS = {
  animate: true,
  pets: [
    { ...BASE_PET, name: "\u5E3D\u5B50", imagePath: "assets/pet-cap.png", x: 40, y: 120 },
    { ...BASE_PET, name: "\u94F6\u53D1", imagePath: "assets/pet-silver.png", x: 200, y: 120 }
  ]
};
var PHRASES = ["\u4ECA\u5929\u4E5F\u8981\u52A0\u6CB9\u5199\u7B14\u8BB0\uFF01", "\u55EF\uFF1F", "\u8BE5\u559D\u6C34\u4E86", "\u8BB0\u5F97\u4F11\u606F\u773C\u775B", "\u4F60\u5728\u60F3\u4EC0\u4E48\uFF1F"];
var PetPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.petEls = [];
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new PetSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.renderPets());
    this.addCommand({
      id: "toggle-pet",
      name: "\u663E\u793A / \u9690\u85CF\u5BA0\u7269",
      callback: () => {
        if (this.petEls.length) this.destroyPets();
        else this.renderPets();
      }
    });
  }
  onunload() {
    this.destroyPets();
  }
  // ---------- 渲染 ----------
  renderPets() {
    this.destroyPets();
    this.settings.pets.forEach((p, i) => this.petEls.push(this.createPet(p, i)));
  }
  destroyPets() {
    this.petEls.forEach((el) => el.remove());
    this.petEls = [];
  }
  createPet(p, index) {
    const el = document.body.createDiv({ cls: "pet-container" });
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.width = `${p.size}px`;
    if (this.settings.animate) el.addClass("pet-animate");
    const body = el.createDiv({ cls: `pet-body pet-shape-${p.shape}` });
    body.style.width = `${p.size}px`;
    body.style.height = `${p.size}px`;
    if (p.imagePath.trim()) {
      const url = this.app.vault.adapter.getResourcePath((0, import_obsidian.normalizePath)(p.imagePath.trim()));
      body.addClass("pet-has-image");
      const img = body.createEl("img", { cls: "pet-image" });
      img.src = url;
      img.draggable = false;
    } else if (p.emoji.trim()) {
      body.style.backgroundColor = p.bodyColor;
      const face = body.createDiv({ cls: "pet-emoji", text: p.emoji.trim() });
      face.style.fontSize = `${p.size * 0.55}px`;
    } else {
      body.style.backgroundColor = p.bodyColor;
      const eyes = body.createDiv({ cls: "pet-eyes" });
      for (let i = 0; i < 2; i++) {
        const eye = eyes.createDiv({ cls: "pet-eye" });
        eye.style.backgroundColor = p.eyeColor;
        eye.style.width = eye.style.height = `${p.size * 0.12}px`;
      }
      body.createDiv({ cls: "pet-mouth" }).style.borderColor = p.eyeColor;
    }
    el.createDiv({ cls: "pet-name", text: p.name });
    const bubble = el.createDiv({ cls: "pet-bubble" });
    let bubbleTimer = null;
    this.enableDrag(el, index);
    this.registerDomEvent(el, "click", () => {
      if (el.hasClass("pet-dragging")) return;
      body.addClass("pet-happy");
      window.setTimeout(() => body.removeClass("pet-happy"), 600);
      bubble.setText(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      bubble.addClass("pet-bubble-show");
      if (bubbleTimer) window.clearTimeout(bubbleTimer);
      bubbleTimer = window.setTimeout(() => bubble.removeClass("pet-bubble-show"), 2e3);
    });
    return el;
  }
  // ---------- 拖动 ----------
  enableDrag(el, index) {
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
      if (moved) {
        const p = this.settings.pets[index];
        if (p) {
          p.x = parseInt(el.style.left);
          p.y = parseInt(el.style.top);
          await this.saveSettings();
        }
        window.setTimeout(() => el.removeClass("pet-dragging"), 0);
      }
    };
    this.registerDomEvent(el, "mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originX = el.offsetLeft;
      originY = el.offsetTop;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  // ---------- 设置 ----------
  async loadSettings() {
    var _a, _b;
    const data = (_a = await this.loadData()) != null ? _a : {};
    this.settings = {
      animate: (_b = data.animate) != null ? _b : DEFAULT_SETTINGS.animate,
      pets: Array.isArray(data.pets) && data.pets.length ? data.pets.map((p) => ({ ...BASE_PET, ...p })) : DEFAULT_SETTINGS.pets.map((p) => ({ ...p }))
    };
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async applySettings() {
    await this.saveSettings();
    this.renderPets();
  }
};
var PetSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    containerEl.createEl("h2", { text: "\u684C\u9762\u5BA0\u7269" });
    new import_obsidian.Setting(containerEl).setName("\u5F85\u673A\u52A8\u753B").addToggle(
      (tg) => tg.setValue(s.animate).onChange(async (v) => {
        s.animate = v;
        await this.plugin.applySettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6DFB\u52A0\u4E00\u53EA\u5BA0\u7269").addButton(
      (b) => b.setButtonText("\uFF0B \u6DFB\u52A0").setCta().onClick(async () => {
        s.pets.push({ ...BASE_PET, name: `\u5BA0\u7269${s.pets.length + 1}`, x: 40 + 160 * s.pets.length });
        await this.plugin.applySettings();
        this.display();
      })
    );
    s.pets.forEach((p, i) => this.renderPetSection(containerEl, p, i));
  }
  renderPetSection(containerEl, p, i) {
    const s = this.plugin.settings;
    const apply = () => this.plugin.applySettings();
    new import_obsidian.Setting(containerEl).setName(`\u5BA0\u7269 ${i + 1}\uFF1A${p.name}`).setHeading().addButton(
      (b) => b.setButtonText("\u5220\u9664").setWarning().onClick(async () => {
        s.pets.splice(i, 1);
        await apply();
        this.display();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u540D\u5B57").addText(
      (t) => t.setValue(p.name).onChange(async (v) => {
        p.name = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5927\u5C0F").setDesc("\u50CF\u7D20").addSlider(
      (sl) => sl.setLimits(48, 320, 8).setValue(p.size).setDynamicTooltip().onChange(async (v) => {
        p.size = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u56FE\u7247").setDesc("\u5E93\u5185\u8DEF\u5F84\uFF0C\u4F8B\u5982 assets/pet-cap.png\u3002\u7559\u7A7A\u5219\u7528\u4E0B\u9762\u7684\u989C\u8272 / emoji\u3002").addText(
      (t) => t.setPlaceholder("assets/pet.png").setValue(p.imagePath).onChange(async (v) => {
        p.imagePath = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u8868\u60C5 Emoji").addText(
      (t) => t.setValue(p.emoji).onChange(async (v) => {
        p.emoji = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5F62\u72B6").addDropdown(
      (d) => d.addOptions({ round: "\u5706\u5F62", square: "\u65B9\u5F62", blob: "\u679C\u51BB" }).setValue(p.shape).onChange(async (v) => {
        p.shape = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u8EAB\u4F53\u989C\u8272").addColorPicker(
      (c) => c.setValue(p.bodyColor).onChange(async (v) => {
        p.bodyColor = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u773C\u775B\u989C\u8272").addColorPicker(
      (c) => c.setValue(p.eyeColor).onChange(async (v) => {
        p.eyeColor = v;
        await apply();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u91CD\u7F6E\u4F4D\u7F6E").addButton(
      (b) => b.setButtonText("\u56DE\u5230\u5DE6\u4E0A\u89D2").onClick(async () => {
        p.x = 40 + 160 * i;
        p.y = 120;
        await apply();
      })
    );
  }
};
