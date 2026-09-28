import { App, Plugin, PluginSettingTab, Setting, normalizePath } from "obsidian";

type Shape = "round" | "square" | "blob";

interface PetConfig {
  name: string;
  size: number;        // 像素
  imagePath: string;   // 库内图片路径，填了优先用图片
  emoji: string;       // 没图片时用 emoji 当脸
  bodyColor: string;
  eyeColor: string;
  shape: Shape;
  x: number;
  y: number;
}

interface PetSettings {
  animate: boolean;
  pets: PetConfig[];
}

const BASE_PET: PetConfig = {
  name: "宠物",
  size: 140,
  imagePath: "",
  emoji: "",
  bodyColor: "#f4b860",
  eyeColor: "#222222",
  shape: "round",
  x: 40,
  y: 120,
};

const DEFAULT_SETTINGS: PetSettings = {
  animate: true,
  pets: [
    { ...BASE_PET, name: "帽子", imagePath: "assets/pet-cap.png", x: 40, y: 120 },
    { ...BASE_PET, name: "银发", imagePath: "assets/pet-silver.png", x: 200, y: 120 },
  ],
};

const PHRASES = ["今天也要加油写笔记！", "嗯？", "该喝水了", "记得休息眼睛", "你在想什么？"];

export default class PetPlugin extends Plugin {
  settings: PetSettings;
  petEls: HTMLDivElement[] = [];

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new PetSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.renderPets());

    this.addCommand({
      id: "toggle-pet",
      name: "显示 / 隐藏宠物",
      callback: () => {
        if (this.petEls.length) this.destroyPets();
        else this.renderPets();
      },
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

  createPet(p: PetConfig, index: number): HTMLDivElement {
    const el = document.body.createDiv({ cls: "pet-container" });
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.width = `${p.size}px`;
    if (this.settings.animate) el.addClass("pet-animate");

    const body = el.createDiv({ cls: `pet-body pet-shape-${p.shape}` });
    body.style.width = `${p.size}px`;
    body.style.height = `${p.size}px`;

    if (p.imagePath.trim()) {
      const url = this.app.vault.adapter.getResourcePath(normalizePath(p.imagePath.trim()));
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
    let bubbleTimer: number | null = null;

    this.enableDrag(el, index);

    this.registerDomEvent(el, "click", () => {
      if (el.hasClass("pet-dragging")) return;
      body.addClass("pet-happy");
      window.setTimeout(() => body.removeClass("pet-happy"), 600);
      bubble.setText(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      bubble.addClass("pet-bubble-show");
      if (bubbleTimer) window.clearTimeout(bubbleTimer);
      bubbleTimer = window.setTimeout(() => bubble.removeClass("pet-bubble-show"), 2000);
    });

    return el;
  }

  // ---------- 拖动 ----------
  enableDrag(el: HTMLDivElement, index: number) {
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

    this.registerDomEvent(el, "mousedown", (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      moved = false;
      startX = e.clientX; startY = e.clientY;
      originX = el.offsetLeft; originY = el.offsetTop;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  // ---------- 设置 ----------
  async loadSettings() {
    const data = (await this.loadData()) ?? {};
    // 兼容旧版单宠物格式：没有 pets 数组就用默认的两只
    this.settings = {
      animate: data.animate ?? DEFAULT_SETTINGS.animate,
      pets: Array.isArray(data.pets) && data.pets.length
        ? data.pets.map((p: Partial<PetConfig>) => ({ ...BASE_PET, ...p }))
        : DEFAULT_SETTINGS.pets.map((p) => ({ ...p })),
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async applySettings() {
    await this.saveSettings();
    this.renderPets();
  }
}

class PetSettingTab extends PluginSettingTab {
  plugin: PetPlugin;

  constructor(app: App, plugin: PetPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();
    containerEl.createEl("h2", { text: "桌面宠物" });

    new Setting(containerEl).setName("待机动画").addToggle((tg) =>
      tg.setValue(s.animate).onChange(async (v) => { s.animate = v; await this.plugin.applySettings(); })
    );

    new Setting(containerEl).setName("添加一只宠物").addButton((b) =>
      b.setButtonText("＋ 添加").setCta().onClick(async () => {
        s.pets.push({ ...BASE_PET, name: `宠物${s.pets.length + 1}`, x: 40 + 160 * s.pets.length });
        await this.plugin.applySettings();
        this.display();
      })
    );

    s.pets.forEach((p, i) => this.renderPetSection(containerEl, p, i));
  }

  renderPetSection(containerEl: HTMLElement, p: PetConfig, i: number) {
    const s = this.plugin.settings;
    const apply = () => this.plugin.applySettings();

    new Setting(containerEl)
      .setName(`宠物 ${i + 1}：${p.name}`)
      .setHeading()
      .addButton((b) =>
        b.setButtonText("删除").setWarning().onClick(async () => {
          s.pets.splice(i, 1);
          await apply();
          this.display();
        })
      );

    new Setting(containerEl).setName("名字").addText((t) =>
      t.setValue(p.name).onChange(async (v) => { p.name = v; await apply(); })
    );

    new Setting(containerEl).setName("大小").setDesc("像素").addSlider((sl) =>
      sl.setLimits(48, 320, 8).setValue(p.size).setDynamicTooltip()
        .onChange(async (v) => { p.size = v; await apply(); })
    );

    new Setting(containerEl)
      .setName("图片")
      .setDesc("库内路径，例如 assets/pet-cap.png。留空则用下面的颜色 / emoji。")
      .addText((t) =>
        t.setPlaceholder("assets/pet.png").setValue(p.imagePath)
          .onChange(async (v) => { p.imagePath = v; await apply(); })
      );

    new Setting(containerEl).setName("表情 Emoji").addText((t) =>
      t.setValue(p.emoji).onChange(async (v) => { p.emoji = v; await apply(); })
    );

    new Setting(containerEl).setName("形状").addDropdown((d) =>
      d.addOptions({ round: "圆形", square: "方形", blob: "果冻" })
        .setValue(p.shape)
        .onChange(async (v) => { p.shape = v as Shape; await apply(); })
    );

    new Setting(containerEl).setName("身体颜色").addColorPicker((c) =>
      c.setValue(p.bodyColor).onChange(async (v) => { p.bodyColor = v; await apply(); })
    );

    new Setting(containerEl).setName("眼睛颜色").addColorPicker((c) =>
      c.setValue(p.eyeColor).onChange(async (v) => { p.eyeColor = v; await apply(); })
    );

    new Setting(containerEl).setName("重置位置").addButton((b) =>
      b.setButtonText("回到左上角").onClick(async () => {
        p.x = 40 + 160 * i; p.y = 120;
        await apply();
      })
    );
  }
}