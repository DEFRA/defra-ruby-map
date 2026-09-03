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
global.proj4 = require(path.join(__dirname, "..", "..", "node_modules", "proj4"));
require(path.join(JS_DIR, "grid_reference_converter.js"));
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

// Helpers for the full-config tests below: a container with the gem's data-*
// attributes, a defra bundle stub that captures everything it is given, and a
// recording map instance.
function fakeInstance() {
  return {
    handlers: {},
    on(evt, cb) { (this.handlers[evt] = this.handlers[evt] || []).push(cb); },
    emit(evt, payload) { (this.handlers[evt] || []).forEach((cb) => cb(payload)); }
  };
}

function fakeDefra(instance, captured) {
  return {
    InteractiveMap: function (id, opts) {
      captured.mountedId = id;
      captured.options = opts;
      return instance;
    },
    maplibreProvider() { return {}; },
    interactPlugin() { return { enable() { captured.interactEnabled = true; } }; },
    searchPlugin(cfg) { captured.searchConfig = cfg; return {}; },
    scaleBarPlugin(cfg) { captured.scaleBarConfig = cfg; return {}; },
    mapStylesPlugin(cfg) { captured.mapStylesConfig = cfg; return {}; }
  };
}

test("a fully-configured container gets OS styles, search dataset, and proxied requests", () => {
  const captured = {};
  const instance = fakeInstance();
  global.location = { origin: "https://host.example" };
  global.document = { createElement() { return {}; } };
  global.defra = fakeDefra(instance, captured);
  const button = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const observed = [];
  global.MutationObserver = class {
    constructor(cb) { this.cb = cb; }
    observe(target, opts) { observed.push({ target: target, opts: opts }); }
  };
  const container = {
    id: "map",
    dataset: {
      proxyUrl: "/proxy/",
      imagesUrl: "/assets/1.0/images/",
      center: "-2,53",
      zoom: "10"
    },
    classList: { remove() {} },
    querySelectorAll() { return [button]; },
    appendChild() {}
  };

  let result;
  try {
    result = global.DefraMap.init(container, {});
  } finally {
    delete global.defra;
    delete global.location;
    delete global.document;
    delete global.MutationObserver;
  }

  assert.equal(result, instance);
  const options = captured.options;
  assert.deepEqual(options.center, [-2, 53]);
  assert.equal(options.zoom, 10);
  // OS styles built from the proxy + images URLs; first style is the default
  assert.equal(options.mapStyle.id, "outdoor");
  assert.equal(options.mapStyle.url, "/assets/1.0/os-styles/OS_VTS_3857_Outdoor.json");
  assert.equal(captured.mapStylesConfig.mapStyles.length, 3);
  assert.equal(options.plugins.length, 4); // interact, search, scale bar, map styles
  // Search plugin gets the OS Places dataset when a proxy is configured
  assert.equal(captured.searchConfig.customDatasets[0].urlTemplate, "/proxy/geocode-proxy?query={query}");
  // The "Search" label override targets the manifest button, not the form control
  const searchButton = captured.searchConfig.manifest.buttons.find((b) => b.id === "search");
  assert.equal(searchButton.desktop.showLabel, true);
  assert.equal(captured.searchConfig.manifest.controls, undefined);

  // transformRequest: OS sprite URLs reroute to the vendored copies
  const sprite = options.transformRequest(
    "https://raw.githubusercontent.com/OrdnanceSurvey/OS-Vector-Tile-API-Stylesheets/v4/OS_VTS_3857/resources/sprites/sprite@2x.json"
  );
  assert.equal(sprite.url, "https://host.example/assets/1.0/os-styles/sprites/sprite@2x.json");
  // api.os.uk requests are proxied, the key stripped, and srs pinned
  const tile = options.transformRequest("https://api.os.uk/maps/vector/v1/vts/tile/1/2/3.pbf?key=secret");
  assert.equal(tile.url, "https://host.example/proxy/os-tiles-proxy/maps/vector/v1/vts/tile/1/2/3.pbf?srs=3857");
  // anything else is left alone
  assert.equal(options.transformRequest("https://example.com/x.png"), undefined);

  // map:ready enables interaction and forces button types (as does the observer)
  instance.emit("map:ready", {});
  assert.equal(captured.interactEnabled, true);
  assert.equal(button.attrs.type, "button");
  assert.equal(observed.length, 1);
});

test("a valid data-initial-grid-reference recentres the map at grid-ref zoom", () => {
  const captured = {};
  global.location = { origin: "https://host.example" };
  global.document = { createElement() { return {}; } };
  global.defra = fakeDefra(fakeInstance(), captured);
  const container = {
    id: "map",
    dataset: { initialGridReference: "TQ 30100 80500" },
    classList: { remove() {} },
    querySelectorAll() { return []; },
    appendChild() {}
  };

  try {
    global.DefraMap.init(container, {});
  } finally {
    delete global.defra;
    delete global.location;
    delete global.document;
  }

  assert.equal(captured.options.zoom, 15);
  const expected = global.DefraGridRef.gridRefToCoords("TQ 30100 80500");
  assert.deepEqual(captured.options.center, expected);
});

test("gridRefFieldId wires the sync against the field, falling back to the -error ID", () => {
  const captured = {};
  const instance = fakeInstance();
  const field = {
    value: "",
    parentNode: { appendChild() {} },
    dispatchEvent() {},
    addEventListener() {}
  };
  global.location = { origin: "https://host.example" };
  global.document = {
    createElement() { return { setAttribute() {}, style: {} }; },
    getElementById(id) { return id === "grid-ref-error" ? field : null; }
  };
  global.defra = fakeDefra(instance, captured);
  const container = {
    id: "map",
    dataset: {},
    classList: { remove() {} },
    querySelectorAll() { return []; },
    appendChild() {}
  };

  try {
    global.DefraMap.init(container, { gridRefFieldId: "grid-ref" });
  } finally {
    delete global.defra;
    delete global.location;
    delete global.document;
  }

  // The real DefraGridRefSync.wire ran against the fallback field: the map
  // instance now has the sync's event handlers registered.
  assert.ok(instance.handlers["interact:markerchange"]);
  assert.ok(instance.handlers["search:match"]);
  assert.ok(instance.handlers["map:firstidle"]);
});

test("DefraMap.init returns null and reports when the map constructor throws", () => {
  const consoleMessages = [];
  const originalError = console.error;
  console.error = function (msg) { consoleMessages.push(String(msg)); };
  global.location = { origin: "https://host.example" };
  global.document = { createElement() { return {}; } };
  global.defra = {
    InteractiveMap: function () { throw new Error("boom"); },
    maplibreProvider() { return {}; },
    interactPlugin() { return {}; },
    searchPlugin() { return {}; }
  };
  const container = {
    id: "map",
    dataset: {},
    classList: { remove() {} },
    querySelectorAll() { return []; },
    appendChild() {}
  };
  const errors = [];
  let result;
  try {
    result = global.DefraMap.init(container, { onError(e) { errors.push(e); } });
  } finally {
    console.error = originalError;
    delete global.defra;
    delete global.location;
    delete global.document;
  }

  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.ok(consoleMessages.some((m) => m.includes("map initialisation failed")));
});
