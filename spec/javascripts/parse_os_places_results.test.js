// Tests for map_init.js's OS Places result parsing. map_init.js is a browser
// IIFE that attaches to window.DefraMap; give it a window and no `defra`
// global so init is never called.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

global.window = global;
require(path.join(__dirname, "..", "..", "app", "assets", "javascripts", "defra-ruby-map", "map_init.js"));

const { parseOsPlacesResults } = global.DefraMap._internal;

function results(address) {
  return { results: [{ DPA: { ADDRESS: address, UPRN: 123, LNG: -1, LAT: 51 } }] };
}

// The search plugin renders `marked` as text (only bare <mark> tags become
// elements), so the address must be passed through unescaped
test("parseOsPlacesResults does not HTML-escape the address", () => {
  const parsed = parseOsPlacesResults(results("SMITH & SONS, O'BRIEN HOUSE"), "house");
  assert.equal(parsed[0].marked, "SMITH & SONS, O'BRIEN <mark>HOUSE</mark>");
});

test("parseOsPlacesResults still highlights a plain query match", () => {
  const parsed = parseOsPlacesResults(results("10 DOWNING STREET"), "downing");
  assert.equal(parsed[0].marked, "10 <mark>DOWNING</mark> STREET");
  assert.equal(parsed[0].text, "10 DOWNING STREET"); // raw text preserved for selection
});

test("parseOsPlacesResults handles a regex-special query without throwing", () => {
  const parsed = parseOsPlacesResults(results("FLAT 1 (REAR)"), "1 (rear)");
  assert.equal(parsed.length, 1);
  assert.ok(parsed[0].marked.includes("<mark>1 (REAR)</mark>"));
});

test("parseOsPlacesResults tolerates empty query and missing records", () => {
  assert.deepEqual(parseOsPlacesResults(null, "x"), []);
  assert.deepEqual(parseOsPlacesResults({ results: [] }, "x"), []);
  const parsed = parseOsPlacesResults(results("SOME PLACE"), "");
  assert.equal(parsed[0].marked, "SOME PLACE"); // no <mark> when query empty
  assert.deepEqual(parseOsPlacesResults({ results: [{}] }, "x"), []); // no DPA/LPI
});

test("parseOsPlacesResults maps coordinates and bounds", () => {
  const parsed = parseOsPlacesResults(
    { results: [{ DPA: { ADDRESS: "X", UPRN: 9, LNG: -1.5, LAT: 52.5 } }] }, "x");
  assert.deepEqual(parsed[0].point, [-1.5, 52.5]);
  assert.equal(parsed[0].id, "9");
  assert.equal(parsed[0].bounds.length, 4);
});
