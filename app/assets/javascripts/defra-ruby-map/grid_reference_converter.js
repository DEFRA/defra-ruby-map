// Grid Reference Converter
// Converts between WGS84 (lng/lat), OSGB36 (easting/northing), and OS grid references.
// Ported from the os_map_ref Ruby gem (https://github.com/DEFRA/os-map-ref).
//
// Dependencies: proj4 (loaded globally as window.proj4)

(function () {
  "use strict";

  // OSGB36 / British National Grid projection (EPSG:27700)
  const OSGB36 = "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 " +
    "+x_0=400000 +y_0=-100000 +ellps=airy " +
    "+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs +type=crs";

  // Grid of 100km squares as arranged over the UK.
  // Origin (0,0) is bottom-left corner (SV). Rows go south-to-north.
  // Matches the os_map_ref gem grid (reversed).
  const GRID = [
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

  // The caps mirror GRID's extent: 10 x 13 hundred-km squares.
  const MAX_EASTING = 1000000;
  const MAX_NORTHING = 1300000;

  // A grid reference is a two-letter square prefix plus five digits per axis.
  const PREFIX_LENGTH = 2;
  const COORD_DIGITS = 5;
  const EASTING_END = PREFIX_LENGTH + COORD_DIGITS;
  const NORTHING_END = EASTING_END + COORD_DIGITS;

  // Build reverse lookup: prefix -> [rowIndex, colIndex]
  const PREFIX_LOOKUP = {};
  for (let row = 0; row < GRID.length; row++) {
    for (let col = 0; col < GRID[row].length; col++) {
      PREFIX_LOOKUP[GRID[row][col]] = [row, col];
    }
  }

  function padCoord(value) {
    return String(value % 100000).padStart(COORD_DIGITS, "0");
  }

  function eastingNorthingToGridRef(easting, northing) {
    easting = Math.round(easting);
    northing = Math.round(northing);

    if (!Number.isFinite(easting) || !Number.isFinite(northing)) { return null; }
    if (easting < 0 || northing < 0 || easting >= MAX_EASTING || northing >= MAX_NORTHING) {
      return null;
    }

    const gridEasting = Math.floor(easting / 100000);
    const gridNorthing = Math.floor(northing / 100000);

    const prefix = GRID[gridNorthing][gridEasting];

    return `${prefix} ${padCoord(easting)} ${padCoord(northing)}`;
  }

  function gridRefToEastingNorthing(gridRef) {
    if (!gridRef || typeof gridRef !== "string") { return null; }

    // Normalise to two letters + ten digits, accepting exactly what
    // isValidGridRef accepts regardless of whitespace grouping. Refs with
    // fewer digits are rejected rather than mis-scaled to a wrong location.
    const cleaned = gridRef.replace(/\s+/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{10}$/.test(cleaned)) { return null; }

    const coords = PREFIX_LOOKUP[cleaned.substring(0, PREFIX_LENGTH)];
    if (!coords) { return null; }

    const easting = coords[1] * 100000 + Number.parseInt(cleaned.substring(PREFIX_LENGTH, EASTING_END), 10);
    const northing = coords[0] * 100000 + Number.parseInt(cleaned.substring(EASTING_END, NORTHING_END), 10);

    return [easting, northing];
  }

  function coordsToEastingNorthing(lng, lat) {
    if (typeof proj4 === "undefined") { return null; }
    return proj4("EPSG:4326", OSGB36, [lng, lat]);
  }

  function coordsToGridRef(lng, lat) {
    const en = coordsToEastingNorthing(lng, lat);
    if (!en) { return null; }
    return eastingNorthingToGridRef(en[0], en[1]);
  }

  function gridRefToCoords(gridRef) {
    if (typeof proj4 === "undefined") { return null; }
    const en = gridRefToEastingNorthing(gridRef);
    if (!en) { return null; }
    return proj4(OSGB36, "EPSG:4326", en);
  }

  function isValidGridRef(str) {
    if (!str || typeof str !== "string") { return false; }
    const cleaned = str.replace(/\s+/g, "").toUpperCase();
    return /^[A-Z]{2}\d{10}$/.test(cleaned) && !!PREFIX_LOOKUP[cleaned.substring(0, PREFIX_LENGTH)];
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
