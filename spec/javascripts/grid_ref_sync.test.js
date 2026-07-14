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

// A stub InteractiveMap event emitter that records marker removals.
function fakeMap() {
  return {
    handlers: {},
    removed: [],
    on(evt, cb) { (this.handlers[evt] = this.handlers[evt] || []).push(cb); },
    emit(evt, payload) { (this.handlers[evt] || []).forEach((cb) => cb(payload)); },
    removeMarker(id) { this.removed.push(id); }
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
