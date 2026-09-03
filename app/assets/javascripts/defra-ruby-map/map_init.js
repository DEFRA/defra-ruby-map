// DefraMap — Generic interactive map initializer
// Finds containers with data-module="defra-interactive-map", initializes the map,
// and optionally wires bidirectional sync with a grid reference field.
//
// Dependencies: defra.InteractiveMap, defra.maplibreProvider, defra.interactPlugin,
//   defra.searchPlugin, defra.mapStylesPlugin, defra.scaleBarPlugin,
//   DefraGridRef, DefraGridRefSync (all loaded per-page via script tags)

(function () {
  "use strict";

  // Roughly central England; used when the container specifies no centre
  const DEFAULT_CENTER_LNG = -1.5;
  const DEFAULT_CENTER_LAT = 52.5;
  const DEFAULT_CENTER = [DEFAULT_CENTER_LNG, DEFAULT_CENTER_LAT];
  const DEFAULT_ZOOM = 6;
  const GRID_REF_ZOOM = 15;
  // Panning limits covering the UK including Shetland and Northern Ireland
  const UK_WEST_LNG = -8.5;
  const UK_SOUTH_LAT = 49;
  const UK_EAST_LNG = 2;
  const UK_NORTH_LAT = 61.5;
  const UK_MAX_BOUNDS = [[UK_WEST_LNG, UK_SOUTH_LAT], [UK_EAST_LNG, UK_NORTH_LAT]];
  // Half-width, in degrees, of the bounding box built around a search suggestion
  const SUGGESTION_BOUNDS_PADDING = 0.005;
  const OS_LOGO_ALT = "Ordnance Survey";
  const OPENFREEMAP_STYLE = {
    url: "https://tiles.openfreemap.org/styles/liberty",
    attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
    backgroundColor: "#f5f5f0"
  };

  const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) { return HTML_ENTITIES[c]; });
  }

  // Maps OS Places API results to the search plugin's suggestion shape. The
  // plugin renders `marked` via dangerouslySetInnerHTML, so the address text
  // is HTML-escaped before the matched query is wrapped in <mark> — otherwise
  // HTML in an OS address would execute (stored XSS).
  function parseOsPlacesResults(data, query) {
    if (!data?.results) { return []; }
    const safeQuery = escapeHtml(query || "").replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const matcher = safeQuery ? new RegExp(`(${safeQuery})`, "gi") : null;
    return data.results.map(function (item) {
      const record = item.DPA || item.LPI;
      if (!record) { return null; }
      const text = record.ADDRESS || "";
      const safeText = escapeHtml(text);
      const lng = record.LNG || 0;
      const lat = record.LAT || 0;
      return {
        id: String(record.UPRN),
        text: text,
        marked: matcher ? safeText.replace(matcher, "<mark>$1</mark>") : safeText,
        point: [lng, lat],
        bounds: [
          lng - SUGGESTION_BOUNDS_PADDING,
          lat - SUGGESTION_BOUNDS_PADDING,
          lng + SUGGESTION_BOUNDS_PADDING,
          lat + SUGGESTION_BOUNDS_PADDING
        ]
      };
    }).filter(Boolean);
  }

  // The vendored OS styles reference their sprite sheet by absolute URL (MapLibre
  // only fetches sprites for absolute URLs); this reroutes it to the local copy.
  const OS_SPRITE_URL_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/OrdnanceSurvey\/OS-Vector-Tile-API-Stylesheets\/[^/]+\/OS_VTS_3857\/resources\/sprites\//;

  // Routes api.os.uk tile/glyph requests through the server-side proxy (key
  // never reaches browser) and OS sprite requests to the vendored copies.
  function makeTransformRequest(proxyUrl, stylesUrl) {
    const origin = window.location.origin;
    return function (url) {
      if (stylesUrl && OS_SPRITE_URL_PREFIX.test(url)) {
        return { url: `${origin}${stylesUrl}/sprites/${url.replace(OS_SPRITE_URL_PREFIX, "")}` };
      }
      if (!proxyUrl || !url.startsWith("https://api.os.uk/")) { return undefined; }
      const u = new URL(url);
      u.searchParams.delete("key");
      if (u.pathname.startsWith("/maps/vector/v1/vts") && !u.searchParams.has("srs")) {
        u.searchParams.set("srs", "3857");
      }
      return { url: `${origin}${proxyUrl}/os-tiles-proxy${u.pathname}${u.search}` };
    };
  }

  function reportError(options, message, error) {
    if (typeof console !== "undefined" && console.error) { console.error("defra-ruby-map: " + message, error); }
    if (options && typeof options.onError === "function") { options.onError(error); }
  }

  // A valid data-initial-grid-reference recentres the map on that point
  function applyInitialGridRef(container, config) {
    const initialGridRef = container.dataset.initialGridReference;
    if (!initialGridRef || !window.DefraGridRef?.isValidGridRef(initialGridRef)) { return; }
    const coords = window.DefraGridRef.gridRefToCoords(initialGridRef);
    if (coords) {
      config.center = coords;
      config.zoom = GRID_REF_ZOOM;
    }
  }

  function readContainerConfig(container) {
    const config = {
      proxyUrl: (container.dataset.proxyUrl || "").replace(/\/$/, ""),
      imagesUrl: (container.dataset.imagesUrl || "").replace(/\/$/, ""),
      center: (container.dataset.center || "").split(",").map(Number),
      zoom: Number.parseInt(container.dataset.zoom || DEFAULT_ZOOM, 10)
    };
    if (config.center.length !== 2 || Number.isNaN(config.center[0])) { config.center = DEFAULT_CENTER; }
    // Style JSONs are served from the same versioned asset root as the images
    config.stylesUrl = config.imagesUrl ? `${config.imagesUrl.replace(/\/images$/, "")}/os-styles` : "";
    applyInitialGridRef(container, config);
    return config;
  }

  // Search plugin config — use proxy if available, otherwise no search.
  // Manifest override shows the "Search" label next to the magnifying glass.
  function buildSearchConfig(proxyUrl) {
    const searchConfig = {
      showMarker: true,
      manifest: {
        buttons: [{
          id: "search",
          mobile: { slot: "top-right", showLabel: true },
          tablet: { slot: "top-left", showLabel: true },
          desktop: { slot: "top-left", showLabel: true }
        }]
      }
    };
    if (proxyUrl) {
      searchConfig.customDatasets = [{
        name: "os-places",
        urlTemplate: `${proxyUrl}/geocode-proxy?query={query}`,
        parseResults: parseOsPlacesResults
      }];
    }
    return searchConfig;
  }

  // OS styles need both the tile proxy (for the API key) and the vendored
  // style JSONs; without either, the map falls back to OpenFreeMap.
  function buildOsMapStyles(config) {
    if (!config.proxyUrl || !config.stylesUrl) { return null; }
    const imagesUrl = config.imagesUrl;
    const stylesUrl = config.stylesUrl;
    const copyright = `Contains OS data © Crown copyright and database rights ${new Date().getFullYear()}`;
    return [
      {
        id: "outdoor",
        label: "Outdoor",
        thumbnail: `${imagesUrl}/outdoor-map-thumb.jpg`,
        url: `${stylesUrl}/OS_VTS_3857_Outdoor.json`,
        attribution: copyright,
        logo: `${imagesUrl}/os-logo.svg`,
        logoAltText: OS_LOGO_ALT,
        backgroundColor: "#f5f5f0"
      },
      {
        id: "dark",
        label: "Dark",
        thumbnail: `${imagesUrl}/dark-map-thumb.jpg`,
        url: `${stylesUrl}/OS_VTS_3857_Dark.json`,
        mapColorScheme: "dark",
        appColorScheme: "dark",
        attribution: copyright,
        logo: `${imagesUrl}/os-logo-white.svg`,
        logoAltText: OS_LOGO_ALT
      },
      {
        id: "black-and-white",
        label: "Black/White",
        thumbnail: `${imagesUrl}/black-and-white-map-thumb.jpg`,
        url: `${stylesUrl}/OS_VTS_3857_Black_and_White.json`,
        attribution: copyright,
        logo: `${imagesUrl}/os-logo.svg`,
        logoAltText: OS_LOGO_ALT
      }
    ];
  }

  function buildMapOptions(config, osMapStyles, plugins, options) {
    return {
      behaviour: "inline",
      mapProvider: window.defra.maplibreProvider(),
      plugins: plugins,
      transformRequest: makeTransformRequest(config.proxyUrl, config.stylesUrl),
      mapStyle: osMapStyles ? osMapStyles[0] : OPENFREEMAP_STYLE,
      center: config.center,
      zoom: config.zoom,
      minZoom: DEFAULT_ZOOM,
      maxZoom: 19,
      maxBounds: UK_MAX_BOUNDS,
      containerHeight: "400px",
      mapLabel: options.mapLabel || "Interactive map",
      enableZoomControls: true
    };
  }

  // Plugin buttons render without a type attribute, which makes them submit
  // buttons inside a parent form: pressing Enter in a field could activate one
  // instead of submitting. Force type="button" at render time and as controls
  // appear, not just on click (a click is too late for keyboard submission).
  function wireButtonTypeFix(container, interactiveMap, interact) {
    function fixButtonTypes() {
      const buttons = container.querySelectorAll("button:not([type])");
      for (const button of buttons) { button.setAttribute("type", "button"); }
    }

    interactiveMap.on("map:ready", function () {
      if (typeof interact.enable === "function") { interact.enable(); }
      fixButtonTypes();
    });

    if (typeof MutationObserver === "function") {
      new MutationObserver(fixButtonTypes).observe(container, { childList: true, subtree: true });
    }
  }

  function wireGridRefField(interactiveMap, options, proxyUrl) {
    if (!options.gridRefFieldId || !window.DefraGridRef) { return; }
    // GOV.UK form builder appends "-error" to the field ID when validation fails
    const field = document.getElementById(options.gridRefFieldId)
      || document.getElementById(`${options.gridRefFieldId}-error`);
    if (field) { window.DefraGridRefSync.wire(interactiveMap, field, proxyUrl, GRID_REF_ZOOM); }
  }

  function initMap(container, options) {
    options = options || {};
    if (typeof defra === "undefined" || typeof defra.InteractiveMap !== "function") {
      reportError(options, "interactive map bundle not loaded (defra.InteractiveMap missing)");
      return null;
    }

    const config = readContainerConfig(container);
    const osMapStyles = buildOsMapStyles(config);
    const interact = defra.interactPlugin({ interactionModes: ["placeMarker"] });
    const plugins = [interact, defra.searchPlugin(buildSearchConfig(config.proxyUrl))];
    if (typeof defra.scaleBarPlugin === "function") {
      plugins.push(defra.scaleBarPlugin({ units: "metric" }));
    }
    if (typeof defra.mapStylesPlugin === "function" && osMapStyles) {
      plugins.push(defra.mapStylesPlugin({ mapStyles: osMapStyles }));
    }

    // Mount on a dedicated child element: InteractiveMap JSON-parses every
    // data-* attribute on its mount element, so it must not see the gem's
    // plain-string attributes on the container.
    const mapRoot = document.createElement("div");
    mapRoot.id = `${container.id}-map`;
    container.appendChild(mapRoot);

    let interactiveMap;
    try {
      interactiveMap = new defra.InteractiveMap(mapRoot.id, buildMapOptions(config, osMapStyles, plugins, options));
    } catch (e) {
      reportError(options, "map initialisation failed", e);
      return null;
    }

    container.classList.remove("govuk-!-display-none");
    wireButtonTypeFix(container, interactiveMap, interact);
    wireGridRefField(interactiveMap, options, config.proxyUrl);

    return interactiveMap;
  }

  window.DefraMap = {
    init: initMap,
    _internal: { escapeHtml: escapeHtml, parseOsPlacesResults: parseOsPlacesResults }
  };
})();
