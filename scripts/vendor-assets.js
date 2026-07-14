#!/usr/bin/env node

// Copies UMD builds from node_modules into vendor/assets/ for the Rails gem.
// Run: npm run vendor

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const JS_DEST = path.join(ROOT, "vendor", "assets", "javascripts");
const CSS_DEST = path.join(ROOT, "vendor", "assets", "stylesheets");
const IM_ROOT = path.join(ROOT, "node_modules", "@defra", "interactive-map");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFiles(srcDir, destDir, filter) {
  if (!fs.existsSync(srcDir)) {
    console.warn("  SKIP (not found):", srcDir);
    return;
  }
  ensureDir(destDir);
  const files = fs.readdirSync(srcDir).filter(f => filter ? filter.test(f) : true);
  files.forEach(f => {
    fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
    console.log("  " + path.relative(ROOT, path.join(destDir, f)));
  });
}

function copyCss(srcPath, destName) {
  if (!fs.existsSync(srcPath)) {
    console.warn("  SKIP CSS (not found):", srcPath);
    return;
  }
  ensureDir(path.join(CSS_DEST, "defra-interactive-map"));
  fs.copyFileSync(srcPath, path.join(CSS_DEST, "defra-interactive-map", destName));
  console.log("  vendor/assets/stylesheets/defra-interactive-map/" + destName);
}

console.log("Vendoring assets from node_modules...\n");

// Core interactive map
console.log("defra-interactive-map (UMD):");
copyFiles(
  path.join(IM_ROOT, "dist", "umd"),
  path.join(JS_DEST, "defra-interactive-map"),
  /\.js(\.LICENSE\.txt)?$/
);

console.log("\ndefra-interactive-map (CSS):");
copyCss(path.join(IM_ROOT, "dist", "css", "index.css"), "interactive-map.css");

// MapLibre provider
console.log("\nmaplibre-provider:");
copyFiles(
  path.join(IM_ROOT, "providers", "maplibre", "dist", "umd"),
  path.join(JS_DEST, "maplibre-provider"),
  /\.js(\.LICENSE\.txt)?$/
);

// Interact plugin (no separate CSS since v0.0.30)
console.log("\ninteract-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "interact", "dist", "umd"),
  path.join(JS_DEST, "interact-plugin"),
  /\.js(\.LICENSE\.txt)?$/
);

// Search plugin
console.log("\nsearch-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "search", "dist", "umd"),
  path.join(JS_DEST, "search-plugin"),
  /\.js(\.LICENSE\.txt)?$/
);
copyCss(path.join(IM_ROOT, "plugins", "search", "dist", "css", "index.css"), "search-plugin.css");

// Map styles plugin (moved to plugins/beta/ in v0.0.30)
console.log("\nmap-styles-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "beta", "map-styles", "dist", "umd"),
  path.join(JS_DEST, "map-styles-plugin"),
  /\.js(\.LICENSE\.txt)?$/
);
copyCss(path.join(IM_ROOT, "plugins", "beta", "map-styles", "dist", "css", "index.css"), "map-styles-plugin.css");

// Scale bar plugin (moved to plugins/beta/ in v0.0.30)
console.log("\nscale-bar-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "beta", "scale-bar", "dist", "umd"),
  path.join(JS_DEST, "scale-bar-plugin"),
  /\.js(\.LICENSE\.txt)?$/
);
copyCss(path.join(IM_ROOT, "plugins", "beta", "scale-bar", "dist", "css", "index.css"), "scale-bar-plugin.css");

// Map images and OS logos
console.log("\nmap images:");
const IMG_DEST = path.join(ROOT, "vendor", "assets", "images", "defra-ruby-map");
ensureDir(IMG_DEST);
const MAP_IMAGES = [
  "outdoor-map-thumb.jpg", "dark-map-thumb.jpg", "black-and-white-map-thumb.jpg",
  "os-logo.svg", "os-logo-white.svg"
];
MAP_IMAGES.forEach(function (f) {
  const src = path.join(IM_ROOT, "assets", "images", f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(IMG_DEST, f));
    console.log("  " + path.relative(ROOT, path.join(IMG_DEST, f)));
  } else {
    console.warn("  SKIP (not found):", f);
  }
});

// proj4js
console.log("\nproj4js:");
copyFiles(
  path.join(ROOT, "node_modules", "proj4", "dist"),
  path.join(JS_DEST, "proj4js"),
  /^proj4\.js$/
);
copyFiles(
  path.join(ROOT, "node_modules", "proj4"),
  path.join(JS_DEST, "proj4js"),
  /^LICENSE\.md$/
);

// OS Vector Tile API stylesheets, pinned to a commit so upstream changes to
// the main branch cannot alter production styling. Served to browsers at
// /defra-ruby-map/<version>/os-styles/ straight from the gem by the
// AssetServer middleware (like everything under vendor/assets/javascripts).
const OS_STYLES_COMMIT = "618729210e8bbe3f75e7d2c4db3076c093d9f316"; // 2025-11-24
const OS_STYLES_BASE =
  `https://raw.githubusercontent.com/OrdnanceSurvey/OS-Vector-Tile-API-Stylesheets/${OS_STYLES_COMMIT}/`;
const OS_STYLES = ["OS_VTS_3857_Outdoor.json", "OS_VTS_3857_Dark.json", "OS_VTS_3857_Black_and_White.json"];

// Sprite sheets referenced by the styles (MapLibre fetches <base>.json/.png
// and the @2x variants). map_init.js rewrites sprite requests to the local
// copies; the pinned raw.githubusercontent URL remains only as a fallback.
const OS_SPRITE_BASES = ["sprite", "dark", "greyscale"];
const OS_SPRITE_EXTS = [".json", ".png", "@2x.json", "@2x.png"];
const OS_SPRITES_PATH = "OS_VTS_3857/resources/sprites/";
// The sprite field inside the stylesheets is hardcoded to the main branch,
// regardless of which commit we download from.
const OS_SPRITES_BASE_URL =
  "https://raw.githubusercontent.com/OrdnanceSurvey/OS-Vector-Tile-API-Stylesheets/main/" + OS_SPRITES_PATH;

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function vendorOsStyles() {
  console.log("\nOS VTS stylesheets (pinned to " + OS_STYLES_COMMIT.slice(0, 7) + "):");
  const dest = path.join(JS_DEST, "os-styles");
  ensureDir(dest);
  for (const file of OS_STYLES) {
    let body = (await download(OS_STYLES_BASE + file)).toString("utf8");
    // Pin the sprite URL to the downloaded commit (the stylesheets hardcode
    // the main branch). MapLibre only fetches sprites for an absolute URL, so
    // this stays absolute; map_init.js's transformRequest reroutes it to the
    // co-located vendored copy, keeping the request first-party. The pinned
    // commit is defence-in-depth if that rerouting is ever bypassed.
    body = body.replace(OS_SPRITES_BASE_URL, OS_STYLES_BASE + OS_SPRITES_PATH);
    JSON.parse(body); // fail fast on a non-JSON (e.g. error page) response
    fs.writeFileSync(path.join(dest, file), body);
    console.log("  " + path.relative(ROOT, path.join(dest, file)));
  }

  const spritesDir = path.join(dest, "sprites");
  ensureDir(spritesDir);
  for (const base of OS_SPRITE_BASES) {
    for (const ext of OS_SPRITE_EXTS) {
      const file = base + ext;
      fs.writeFileSync(path.join(spritesDir, file), await download(OS_STYLES_BASE + OS_SPRITES_PATH + file));
      console.log("  " + path.relative(ROOT, path.join(spritesDir, file)));
    }
  }
}

vendorOsStyles()
  .then(() => console.log("\nDone."))
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
