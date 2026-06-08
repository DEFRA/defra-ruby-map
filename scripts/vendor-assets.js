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
  /\.js$/
);

console.log("\ndefra-interactive-map (CSS):");
copyCss(path.join(IM_ROOT, "dist", "css", "index.css"), "interactive-map.css");

// MapLibre provider
console.log("\nmaplibre-provider:");
copyFiles(
  path.join(IM_ROOT, "providers", "maplibre", "dist", "umd"),
  path.join(JS_DEST, "maplibre-provider"),
  /\.js$/
);

// Interact plugin (no separate CSS since v0.0.30)
console.log("\ninteract-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "interact", "dist", "umd"),
  path.join(JS_DEST, "interact-plugin"),
  /\.js$/
);

// Search plugin
console.log("\nsearch-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "search", "dist", "umd"),
  path.join(JS_DEST, "search-plugin"),
  /\.js$/
);
copyCss(path.join(IM_ROOT, "plugins", "search", "dist", "css", "index.css"), "search-plugin.css");

// Map styles plugin (moved to plugins/beta/ in v0.0.30)
console.log("\nmap-styles-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "beta", "map-styles", "dist", "umd"),
  path.join(JS_DEST, "map-styles-plugin"),
  /\.js$/
);
copyCss(path.join(IM_ROOT, "plugins", "beta", "map-styles", "dist", "css", "index.css"), "map-styles-plugin.css");

// Scale bar plugin (moved to plugins/beta/ in v0.0.30)
console.log("\nscale-bar-plugin:");
copyFiles(
  path.join(IM_ROOT, "plugins", "beta", "scale-bar", "dist", "umd"),
  path.join(JS_DEST, "scale-bar-plugin"),
  /\.js$/
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

console.log("\nDone.");
