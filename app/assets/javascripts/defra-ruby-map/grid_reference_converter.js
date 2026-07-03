// Grid Reference Converter
// Converts between WGS84 (lng/lat), OSGB36 (easting/northing), and OS grid references.
// Ported from the os_map_ref Ruby gem (https://github.com/DEFRA/os-map-ref).
//
// Dependencies: proj4 (loaded globally as window.proj4)

(function () {
  "use strict";

  // OSGB36 / British National Grid projection (EPSG:27700)
  var OSGB36 = "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 " +
    "+x_0=400000 +y_0=-100000 +ellps=airy " +
    "+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs +type=crs";

  // Grid of 100km squares as arranged over the UK.
  // Origin (0,0) is bottom-left corner (SV). Rows go south-to-north.
  // Matches the os_map_ref gem grid (reversed).
  var GRID = [
    ["SV", "SW", "SX", "SY", "SZ", "TV", "TW", "TX", "TY", "TZ"],
    ["SQ", "SR", "SS", "ST", "SU", "TQ", "TR", "TS", "TT", "TU"],
    ["SL", "SM", "SN", "SO", "SP", "TL", "TM", "TN", "TO", "TP"],
    ["SF", "SG", "SH", "SJ", "SK", "TF", "TG", "TH", "TJ", "TK"],
    ["SA", "SB", "SC", "SD", "SE", "TA", "TB", "TC", "TD", "TE"],
    ["NV", "NW", "NX", "NY", "NZ", "OV", "OW", "OX", "OY", "OZ"],
    ["NQ", "NR", "NS", "NT", "NU", "OQ", "OR", "OS", "OT", "OU"],
    ["NL", "NM", "NN", "NO", "NP", "OL", "OM", "ON", "OO", "OP"],
    ["NF", "NG", "NH", "NJ", "NK", "OF", "OG", "OH", "OJ", "OK"],
    ["NA", "NB", "NC", "ND", "NE", "OA", "OB", "OC", "OD", "OE"],
    ["HV", "HW", "HX", "HY", "HZ", "JV", "JW", "JX", "JY", "JZ"],
    ["HQ", "HR", "HS", "HT", "HU", "JQ", "JR", "JS", "JT", "JU"],
    ["HL", "HM", "HN", "HO", "HP", "JL", "JM", "JN", "JO", "JP"]
  ];

  // Build reverse lookup: prefix -> [rowIndex, colIndex]
  var PREFIX_LOOKUP = {};
  var row, col;
  for (row = 0; row < GRID.length; row++) {
    for (col = 0; col < GRID[row].length; col++) {
      PREFIX_LOOKUP[GRID[row][col]] = [row, col];
    }
  }

  function eastingNorthingToGridRef(easting, northing) {
    easting = Math.round(easting);
    northing = Math.round(northing);

    if (!isFinite(easting) || !isFinite(northing)) { return null; }
    if (easting < 0 || northing < 0 || easting >= 1000000 || northing >= 1300000) {
      return null;
    }

    var gridEasting = Math.floor(easting / 100000);
    var gridNorthing = Math.floor(northing / 100000);

    if (gridNorthing >= GRID.length || gridEasting >= GRID[0].length) {
      return null;
    }

    var prefix = GRID[gridNorthing][gridEasting];
    if (!prefix) { return null; }

    return prefix + " " +
      String(easting % 100000).padStart(5, "0") + " " +
      String(northing % 100000).padStart(5, "0");
  }

  function gridRefToEastingNorthing(gridRef) {
    if (!gridRef || typeof gridRef !== "string") { return null; }

    // Normalise to two letters + ten digits, accepting exactly what
    // isValidGridRef accepts regardless of whitespace grouping. Refs with
    // fewer digits are rejected rather than mis-scaled to a wrong location.
    var cleaned = gridRef.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{10}$/.test(cleaned)) { return null; }

    var coords = PREFIX_LOOKUP[cleaned.substring(0, 2)];
    if (!coords) { return null; }

    var easting = coords[1] * 100000 + parseInt(cleaned.substring(2, 7), 10);
    var northing = coords[0] * 100000 + parseInt(cleaned.substring(7, 12), 10);

    return [easting, northing];
  }

  function coordsToEastingNorthing(lng, lat) {
    if (typeof proj4 === "undefined") { return null; }
    return proj4("EPSG:4326", OSGB36, [lng, lat]);
  }

  function coordsToGridRef(lng, lat) {
    var en = coordsToEastingNorthing(lng, lat);
    if (!en) { return null; }
    return eastingNorthingToGridRef(en[0], en[1]);
  }

  function gridRefToCoords(gridRef) {
    if (typeof proj4 === "undefined") { return null; }
    var en = gridRefToEastingNorthing(gridRef);
    if (!en) { return null; }
    return proj4(OSGB36, "EPSG:4326", en);
  }

  function isValidGridRef(str) {
    if (!str || typeof str !== "string") { return false; }
    var cleaned = str.replace(/\s+/g, "").toUpperCase();
    return /^[A-Z]{2}\d{10}$/.test(cleaned) && !!PREFIX_LOOKUP[cleaned.substring(0, 2)];
  }

  window.DefraGridRef = {
    coordsToGridRef: coordsToGridRef,
    gridRefToCoords: gridRefToCoords,
    isValidGridRef: isValidGridRef,
    eastingNorthingToGridRef: eastingNorthingToGridRef,
    gridRefToEastingNorthing: gridRefToEastingNorthing,
    coordsToEastingNorthing: coordsToEastingNorthing
  };
})();
