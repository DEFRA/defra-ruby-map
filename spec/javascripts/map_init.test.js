// Smoke test for map_init.js's wiring after the grid_ref_sync extraction: the
// source files load in script-tag order under a stubbed window, each exposes
// its global, and DefraMap.init fails soft (with the bundle-specific message)
// when the map bundle is absent.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const JS_DIR = path.join(__dirname, "..", "..", "app", "assets", "javascripts", "defra-ruby-map");

global.window = global;
require(path.join(JS_DIR, "grid_ref_sync.js"));
require(path.join(JS_DIR, "map_init.js"));

test("each source file exposes its global after loading in order", () => {
  assert.equal(typeof global.DefraGridRefSync.wire, "function");
  assert.equal(typeof global.DefraMap.init, "function");
  assert.equal(typeof global.DefraMap._internal.parseOsPlacesResults, "function");
});

test("DefraMap.init returns null and reports the bundle guard when the map bundle is missing", () => {
  const consoleMessages = [];
  const originalError = console.error;
  console.error = function (msg) { consoleMessages.push(String(msg)); };
  const errors = [];
  let result;
  try {
    result = global.DefraMap.init({}, { onError(e) { errors.push(e); } });
  } finally {
    console.error = originalError;
  }

  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.ok(
    consoleMessages.some((m) => m.includes("interactive map bundle not loaded")),
    "expected the bundle-guard message, got: " + consoleMessages.join("; ")
  );
});

test("DefraMap.init returns the map instance mounted on a dedicated child element", () => {
  const instance = { on() {} };
  let mountedId;
  global.location = { origin: "https://host.example" };
  global.document = { createElement() { return {}; } };
  global.defra = {
    InteractiveMap: function (id) { mountedId = id; return instance; },
    maplibreProvider() { return {}; },
    interactPlugin() { return {}; },
    searchPlugin() { return {}; }
  };
  const appended = [];
  const container = {
    id: "map",
    dataset: {},
    classList: { remove() {} },
    querySelectorAll() { return []; },
    appendChild(el) { appended.push(el); }
  };
  const errors = [];
  let result;
  try {
    result = global.DefraMap.init(container, { onError(e) { errors.push(e); } });
  } finally {
    delete global.defra;
    delete global.location;
    delete global.document;
  }

  assert.equal(result, instance);
  assert.equal(errors.length, 0);
  // The map must NOT mount on the container itself: InteractiveMap JSON-parses
  // every data-* attribute of its mount element as config, and the container
  // carries the gem's plain-string attributes (data-proxy-url etc.).
  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, "map-map");
  assert.equal(mountedId, "map-map");
});
