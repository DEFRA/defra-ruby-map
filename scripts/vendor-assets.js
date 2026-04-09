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

console.log("Vendoring assets from node_modules...\n");

// Core interactive map
console.log("defra-interactive-map (UMD):");
copyFiles(
  path.join(IM_ROOT, "dist", "umd"),
  path.join(JS_DEST, "defra-interactive-map"),
  /\.js$/
);

console.log("\ndefra-interactive-map (CSS):");
ensureDir(path.join(CSS_DEST, "defra-interactive-map"));
fs.copyFileSync(
  path.join(IM_ROOT, "dist", "css", "index.css"),
  path.join(CSS_DEST, "defra-interactive-map", "interactive-map.css")
);
console.log("  vendor/assets/stylesheets/defra-interactive-map/interactive-map.css");

// MapLibre provider
console.log("\nmaplibre-provider:");
copyFiles(
  path.join(IM_ROOT, "providers", "maplibre", "dist", "umd"),
  path.join(JS_DEST, "maplibre-provider"),
  /\.js$/
);

// Interact plugin
console.log("\ninteract-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "interact", "dist", "umd"),
  path.join(JS_DEST, "interact-plugin"),
  /\.js$/
);
fs.copyFileSync(
  path.join(IM_ROOT, "plugins", "interact", "dist", "css", "index.css"),
  path.join(CSS_DEST, "defra-interactive-map", "interact-plugin.css")
);
console.log("  vendor/assets/stylesheets/defra-interactive-map/interact-plugin.css");

// Search plugin
console.log("\nsearch-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "search", "dist", "umd"),
  path.join(JS_DEST, "search-plugin"),
  /\.js$/
);
fs.copyFileSync(
  path.join(IM_ROOT, "plugins", "search", "dist", "css", "index.css"),
  path.join(CSS_DEST, "defra-interactive-map", "search-plugin.css")
);
console.log("  vendor/assets/stylesheets/defra-interactive-map/search-plugin.css");

// proj4js
console.log("\nproj4js:");
copyFiles(
  path.join(ROOT, "node_modules", "proj4", "dist"),
  path.join(JS_DEST, "proj4js"),
  /^proj4\.js$/
);

console.log("\nDone.");
