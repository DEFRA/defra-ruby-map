// Golden-fixture tests for grid_reference_converter.js.
// Run with: node --test "spec/javascripts/**/*.test.js"
// Conversion fixtures match the DEFRA os_map_ref gem, which this file is a port of.

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// The converter is a browser IIFE attaching to window; give it one.
global.window = global;
global.proj4 = require(path.join(__dirname, "..", "..", "node_modules", "proj4"));
require(path.join(__dirname, "..", "..", "app", "assets", "javascripts", "defra-ruby-map", "grid_reference_converter.js"));

const GridRef = global.DefraGridRef;

test("eastingNorthingToGridRef matches os_map_ref golden fixtures", () => {
  assert.equal(GridRef.eastingNorthingToGridRef(358901, 171053), "ST 58901 71053");
  assert.equal(GridRef.eastingNorthingToGridRef(358901, 1171053), "HT 58901 71053"); // 7-digit northing branch
  assert.equal(GridRef.eastingNorthingToGridRef(1, 1), "SV 00001 00001");
  assert.equal(GridRef.eastingNorthingToGridRef(999999, 1299999), "JP 99999 99999"); // top-right square
  assert.equal(GridRef.eastingNorthingToGridRef(530100, 180500), "TQ 30100 80500");
});

test("eastingNorthingToGridRef returns null outside the national grid", () => {
  assert.equal(GridRef.eastingNorthingToGridRef(-1, 0), null);
  assert.equal(GridRef.eastingNorthingToGridRef(0, -1), null);
  assert.equal(GridRef.eastingNorthingToGridRef(1000000, 0), null);
  assert.equal(GridRef.eastingNorthingToGridRef(0, 1300000), null);
});

test("eastingNorthingToGridRef returns null for non-finite input instead of a garbage string", () => {
  // Was: NaN sailed through the range guard and produced 'SV 00NaN 00NaN'.
  assert.equal(GridRef.eastingNorthingToGridRef(NaN, 100000), null);
  assert.equal(GridRef.eastingNorthingToGridRef(100000, NaN), null);
  assert.equal(GridRef.eastingNorthingToGridRef(undefined, undefined), null);
  assert.equal(GridRef.eastingNorthingToGridRef("foo", "bar"), null);
  assert.equal(GridRef.eastingNorthingToGridRef(Infinity, 100000), null);
});

test("gridRefToEastingNorthing parses 3-token and 12-char forms", () => {
  assert.deepEqual(GridRef.gridRefToEastingNorthing("ST 58901 71053"), [358901, 171053]);
  assert.deepEqual(GridRef.gridRefToEastingNorthing("ST5890171053"), [358901, 171053]);
  assert.deepEqual(GridRef.gridRefToEastingNorthing("HT 58901 71053"), [358901, 1171053]);
  assert.deepEqual(GridRef.gridRefToEastingNorthing("tq 30100 80500"), [530100, 180500]); // case-insensitive
});

test("gridRefToEastingNorthing returns null for unknown prefixes and empty input", () => {
  assert.equal(GridRef.gridRefToEastingNorthing("ZZ 12345 12345"), null);
  assert.equal(GridRef.gridRefToEastingNorthing(""), null);
  assert.equal(GridRef.gridRefToEastingNorthing(null), null);
  assert.equal(GridRef.gridRefToEastingNorthing(12345), null); // non-string
});

test("gridRefToEastingNorthing parses 2-token forms that isValidGridRef accepts", () => {
  // The server-side validator and isValidGridRef both accept these; parsing must agree.
  assert.deepEqual(GridRef.gridRefToEastingNorthing("TQ 3010080500"), [530100, 180500]);
  assert.deepEqual(GridRef.gridRefToEastingNorthing("TQ30100 80500"), [530100, 180500]);
  assert.deepEqual(GridRef.gridRefToEastingNorthing("  TQ  30100  80500  "), [530100, 180500]);
});

test("gridRefToEastingNorthing rejects short (sub-10-digit) refs instead of returning wrong coordinates", () => {
  // Was: 'TQ 301 805' parsed to [500301, 100805] (~85 km off). Must be null.
  assert.equal(GridRef.gridRefToEastingNorthing("TQ 301 805"), null);
  assert.equal(GridRef.gridRefToEastingNorthing("ST 589 710"), null);
  assert.equal(GridRef.gridRefToEastingNorthing("TQ 301 80500"), null); // mixed lengths
  assert.equal(GridRef.gridRefToEastingNorthing("TQ abc def"), null); // non-digit
});

test("gridRefToCoords returns null (not wrong coordinates) for short refs", () => {
  assert.equal(GridRef.gridRefToCoords("TQ 301 805"), null);
});

test("isValidGridRef accepts exactly two letters + ten digits with a real square", () => {
  assert.equal(GridRef.isValidGridRef("ST 58901 71053"), true);
  assert.equal(GridRef.isValidGridRef("ST5890171053"), true);
  assert.equal(GridRef.isValidGridRef("st 58901 71053"), true);
  assert.equal(GridRef.isValidGridRef("ZZ 12345 67890"), false); // no such square
  assert.equal(GridRef.isValidGridRef("ST 589 710"), false); // 6-figure refs not accepted
  assert.equal(GridRef.isValidGridRef(""), false);
  assert.equal(GridRef.isValidGridRef(null), false);
  assert.equal(GridRef.isValidGridRef(12345), false);
});

test("grid ref -> WGS84 -> grid ref round-trips exactly", () => {
  const coords = GridRef.gridRefToCoords("ST 58901 71053");
  assert.ok(Array.isArray(coords) && coords.length === 2);
  assert.equal(GridRef.coordsToGridRef(coords[0], coords[1]), "ST 58901 71053");
});

test("OSGB36 datum places ST 58901 71053 in Bristol", () => {
  const [lng, lat] = GridRef.gridRefToCoords("ST 58901 71053");
  assert.ok(lng > -2.7 && lng < -2.5, `lng ${lng} outside Bristol range`);
  assert.ok(lat > 51.3 && lat < 51.5, `lat ${lat} outside Bristol range`);
});

test("coordsToEastingNorthing inverts proj4 within rounding tolerance", () => {
  const coords = GridRef.gridRefToCoords("TQ 30100 80500");
  const en = GridRef.coordsToEastingNorthing(coords[0], coords[1]);
  assert.ok(Math.abs(en[0] - 530100) < 0.01, `easting ${en[0]}`);
  assert.ok(Math.abs(en[1] - 180500) < 0.01, `northing ${en[1]}`);
});
