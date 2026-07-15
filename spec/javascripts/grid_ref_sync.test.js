// Tests for grid_ref_sync.js's DefraGridRefSync.wire — the map <-> field sync
// wiring. grid_ref_sync.js is a browser IIFE; give it a window, a minimal
// document (for the aria-live region), and load the real grid reference
// converter for conversions.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

function makeEl() {
  return {
    attrs: {}, style: {}, _text: "",
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild() {},
    set textContent(v) { this._text = v; },
    get textContent() { return this._text; }
  };
}

global.window = global;
global.document = { createElement: makeEl, body: { appendChild() {} } };
global.proj4 = require(path.join(__dirname, "..", "..", "node_modules", "proj4"));
require(path.join(__dirname, "..", "..", "app", "assets", "javascripts", "defra-ruby-map", "grid_reference_converter.js"));
require(path.join(__dirname, "..", "..", "app", "assets", "javascripts", "defra-ruby-map", "grid_ref_sync.js"));

const GridRef = global.DefraGridRef;
const wireGridRefSync = global.DefraGridRefSync.wire;

// A stub InteractiveMap event emitter that records marker removals/additions.
function fakeMap() {
  return {
    handlers: {},
    removed: [],
    added: [],
    on(evt, cb) { (this.handlers[evt] = this.handlers[evt] || []).push(cb); },
    emit(evt, payload) { (this.handlers[evt] || []).forEach((cb) => cb(payload)); },
    removeMarker(id) { this.removed.push(id); },
    addMarker(id, coords) { this.added.push({ id: id, coords: coords }); }
  };
}

function fakeField() {
  return {
    value: "",
    events: [],
    parentNode: { appendChild() {} },
    dispatchEvent(e) { this.events.push(e.type); },
    addEventListener() {}
  };
}

const TQ = "TQ 30100 80500";
const TQ_POINT = GridRef.gridRefToCoords(TQ); // [lng, lat] for the search payload

test("search:match sets the field to the result's grid reference (bug: field not updated)", () => {
  const map = fakeMap();
  const field = fakeField();
  wireGridRefSync(map, field, null);

  map.emit("search:match", { point: TQ_POINT });

  assert.equal(field.value, TQ);
  assert.ok(field.events.includes("change"), "a change event is dispatched for host JS");
});

test("search:match clears the map-click and typed markers but keeps the search marker (bug: double marker)", () => {
  const map = fakeMap();
  wireGridRefSync(map, fakeField(), null);

  map.emit("search:match", { point: TQ_POINT });

  assert.ok(map.removed.includes("grid-ref-pin"), "clears the typed grid-ref marker");
  assert.ok(map.removed.includes("location"), "clears the map-click marker");
  assert.ok(!map.removed.includes("search"), "keeps the search plugin's own marker");
});

test("search:match ignores a payload with no point", () => {
  const map = fakeMap();
  const field = fakeField();
  wireGridRefSync(map, field, null);

  map.emit("search:match", {});
  map.emit("search:match", null);

  assert.equal(field.value, "");
  assert.equal(map.removed.length, 0);
});

test("map click (interact:markerchange) without a proxy sets the field and clears stale markers", () => {
  const map = fakeMap();
  const field = fakeField();
  wireGridRefSync(map, field, null); // no proxyUrl => direct grid-ref, no fetch

  map.emit("interact:markerchange", { coords: TQ_POINT });

  assert.equal(field.value, TQ);
  assert.ok(field.events.includes("change"));
  assert.ok(map.removed.includes("grid-ref-pin"));
  assert.ok(map.removed.includes("search"));
});

test("map:firstidle pins the field's pre-filled grid reference (bug: no marker on load)", () => {
  const map = fakeMap();
  const field = fakeField();
  field.value = TQ;
  wireGridRefSync(map, field, null);

  map.emit("map:firstidle");

  assert.equal(map.added.length, 1);
  assert.equal(map.added[0].id, "grid-ref-pin");
  assert.deepEqual(map.added[0].coords, TQ_POINT);
});

test("map:firstidle does not pin when the field is empty or invalid", () => {
  const map = fakeMap();
  const field = fakeField();
  wireGridRefSync(map, field, null);

  map.emit("map:firstidle");
  field.value = "not a grid ref";
  map.emit("map:firstidle");

  assert.equal(map.added.length, 0);
});

test("wireGridRefSync adds a visually-hidden aria-live status region", () => {
  const map = fakeMap();
  const appended = [];
  const field = fakeField();
  field.parentNode = { appendChild(el) { appended.push(el); } };

  wireGridRefSync(map, field, null);

  assert.equal(appended.length, 1);
  assert.equal(appended[0].attrs.role, "status");
  assert.equal(appended[0].attrs["aria-live"], "polite");
});

// --- proxy lookup path -------------------------------------------------
// The markerchange handler with a proxyUrl fetches the nearest address and
// prefers its grid reference, falling back to the raw (clicked) one.

const RAW = TQ; // grid ref of the clicked point itself
const NEAREST = "TQ 30200 80600"; // grid ref the proxy's nearest address maps to

function settle() { return new Promise((resolve) => setTimeout(resolve, 0)); }

test("proxy lookup sets the field to the nearest address's grid reference", async () => {
  const map = fakeMap();
  const field = fakeField();
  global.fetch = () => Promise.resolve({
    json: () => Promise.resolve({ results: [{ DPA: { X_COORDINATE: 530200, Y_COORDINATE: 180600 } }] })
  });
  try {
    wireGridRefSync(map, field, "/proxy");
    // Emit twice: the first request is aborted and its stale response must
    // not overwrite the field (covers the shared-controller guard).
    map.emit("interact:markerchange", { coords: TQ_POINT });
    map.emit("interact:markerchange", { coords: TQ_POINT });
    await settle();
    await settle();
  } finally {
    delete global.fetch;
  }

  assert.equal(field.value, NEAREST);
});

test("proxy lookup falls back to the raw grid reference on an empty result", async () => {
  const map = fakeMap();
  const field = fakeField();
  global.fetch = () => Promise.resolve({ json: () => Promise.resolve({ results: [] }) });
  try {
    wireGridRefSync(map, field, "/proxy");
    map.emit("interact:markerchange", { coords: TQ_POINT });
    await settle();
    await settle();
  } finally {
    delete global.fetch;
  }

  assert.equal(field.value, RAW);
});

test("proxy lookup falls back to the raw grid reference when the fetch fails", async () => {
  const map = fakeMap();
  const field = fakeField();
  global.fetch = () => Promise.reject(new Error("network down"));
  try {
    wireGridRefSync(map, field, "/proxy");
    map.emit("interact:markerchange", { coords: TQ_POINT });
    await settle();
    await settle();
  } finally {
    delete global.fetch;
  }

  assert.equal(field.value, RAW);
});

test("proxy lookup falls back to the raw grid reference on timeout", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const map = fakeMap();
  const field = fakeField();
  global.fetch = () => new Promise(() => {}); // never resolves
  try {
    wireGridRefSync(map, field, "/proxy");
    map.emit("interact:markerchange", { coords: TQ_POINT });
    t.mock.timers.tick(2000);
  } finally {
    delete global.fetch;
  }

  assert.equal(field.value, RAW);
});

// --- typed grid reference path ------------------------------------------

test("typing a valid grid ref repins the marker and flies the map", () => {
  const map = fakeMap();
  const field = fakeField();
  let inputHandler;
  field.addEventListener = (evt, cb) => { inputHandler = cb; };
  const flown = [];
  wireGridRefSync(map, field, null, 15);

  field.value = TQ;
  inputHandler(); // before map:ready there is no map instance: no-op
  assert.equal(map.added.length, 0);

  map.emit("map:ready", { map: { flyTo(opts) { flown.push(opts); } } });
  field.value = "not a grid ref";
  inputHandler(); // invalid value: no-op
  assert.equal(map.added.length, 0);

  field.value = TQ;
  inputHandler();
  assert.equal(map.added.length, 1);
  assert.equal(map.added[0].id, "grid-ref-pin");
  assert.ok(map.removed.includes("search"));
  assert.ok(map.removed.includes("location"));
  assert.deepEqual(flown, [{ center: TQ_POINT, zoom: 15 }]);
});
