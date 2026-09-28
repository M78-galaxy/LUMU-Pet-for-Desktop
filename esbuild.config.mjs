import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const prod = process.argv[2] === "production";

// 改成你要调试的库的插件目录
const VAULT_PLUGIN_DIR = join(
  homedir(),
  "Desktop/Obsidian/Research/.obsidian/plugins/obsidian-pet"
);

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd(() => {
      mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
      for (const f of ["main.js", "manifest.json", "styles.css"]) {
        copyFileSync(f, join(VAULT_PLUGIN_DIR, f));
      }
      console.log("[copy] -> vault");
    });
  },
};

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtins],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  plugins: [copyToVault],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}