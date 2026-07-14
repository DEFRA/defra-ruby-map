// DefraMap — Generic interactive map initializer
// Finds containers with data-module="defra-interactive-map", initializes the map,
// and optionally wires bidirectional sync with a grid reference field.
//
// Dependencies: defra.InteractiveMap, defra.maplibreProvider, defra.interactPlugin,
//   defra.searchPlugin, defra.mapStylesPlugin, defra.scaleBarPlugin,
//   DefraGridRef, DefraGridRefSync (all loaded per-page via script tags)

(function () {
  "use strict";

  var DEFAULT_CENTER = [-1.5, 52.5];
  var DEFAULT_ZOOM = 6;
  var GRID_REF_ZOOM = 15;

  var HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) { return HTML_ENTITIES[c]; });
  }

  // Maps OS Places API results to the search plugin's suggestion shape. The
  // plugin renders `marked` via dangerouslySetInnerHTML, so the address text
  // is HTML-escaped before the matched query is wrapped in <mark> — otherwise
  // HTML in an OS address would execute (stored XSS).
  function parseOsPlacesResults(data, query) {
    if (!data || !data.results) { return []; }
    var safeQuery = escapeHtml(query || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var matcher = safeQuery ? new RegExp("(" + safeQuery + ")", "gi") : null;
    return data.results.map(function (item) {
      var record = item.DPA || item.LPI;
      if (!record) { return null; }
      var text = record.ADDRESS || "";
      var safeText = escapeHtml(text);
      var lng = record.LNG || 0;
      var lat = record.LAT || 0;
      return {
        id: String(record.UPRN),
        text: text,
        marked: matcher ? safeText.replace(matcher, "<mark>$1</mark>") : safeText,
        point: [lng, lat],
        bounds: [lng - 0.005, lat - 0.005, lng + 0.005, lat + 0.005]
      };
    }).filter(Boolean);
  }

  // The vendored OS styles reference their sprite sheet by absolute URL (MapLibre
  // only fetches sprites for absolute URLs); this reroutes it to the local copy.
  var OS_SPRITE_URL_PREFIX = /^https:\/\/raw\.githubusercontent\.com\/OrdnanceSurvey\/OS-Vector-Tile-API-Stylesheets\/[^/]+\/OS_VTS_3857\/resources\/sprites\//;

  // Routes api.os.uk tile/glyph requests through the server-side proxy (key
  // never reaches browser) and OS sprite requests to the vendored copies.
  function makeTransformRequest(proxyUrl, stylesUrl) {
    var origin = window.location.origin;
    return function (url) {
      if (stylesUrl && OS_SPRITE_URL_PREFIX.test(url)) {
        return { url: origin + stylesUrl + "/sprites/" + url.replace(OS_SPRITE_URL_PREFIX, "") };
      }
      if (!proxyUrl || url.indexOf("https://api.os.uk/") !== 0) { return; }
      var u = new URL(url);
      u.searchParams.delete("key");
      if (u.pathname.indexOf("/maps/vector/v1/vts") === 0 && !u.searchParams.has("srs")) {
        u.searchParams.set("srs", "3857");
      }
      return { url: origin + proxyUrl + "/os-tiles-proxy" + u.pathname + u.search };
    };
  }

  function reportError(options, message, error) {
    if (typeof console !== "undefined" && console.error) { console.error("defra-ruby-map: " + message, error); }
    if (options && typeof options.onError === "function") { options.onError(error); }
  }

  function initMap(container, options) {
    options = options || {};
    if (typeof defra === "undefined" || typeof defra.InteractiveMap !== "function") {
      reportError(options, "interactive map bundle not loaded (defra.InteractiveMap missing)");
      return null;
    }
    var proxyUrl = (container.getAttribute("data-proxy-url") || "").replace(/\/$/, "");
    var center = (container.getAttribute("data-center") || "").split(",").map(Number);
    if (center.length !== 2 || isNaN(center[0])) { center = DEFAULT_CENTER; }
    var zoom = parseInt(container.getAttribute("data-zoom") || DEFAULT_ZOOM, 10);

    var initialGridRef = container.getAttribute("data-initial-grid-reference");
    if (initialGridRef && typeof DefraGridRef !== "undefined" && DefraGridRef.isValidGridRef(initialGridRef)) {
      var coords = DefraGridRef.gridRefToCoords(initialGridRef);
      if (coords) {
        center = coords;
        zoom = GRID_REF_ZOOM;
      }
    }

    // Configure search plugin — use proxy if available, otherwise no search
    // Manifest override shows the "Search" label next to the magnifying glass.
    var searchConfig = {
      showMarker: true,
      manifest: {
        controls: [{
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
        urlTemplate: proxyUrl + "/geocode-proxy?query={query}",
        parseResults: parseOsPlacesResults
      }];
    }

    var copyright = "Contains OS data © Crown copyright and database rights " + new Date().getFullYear();
    var imagesUrl = (container.getAttribute("data-images-url") || "").replace(/\/$/, "");
    // Style JSONs are served from the same versioned asset root as the images
    var stylesUrl = imagesUrl ? imagesUrl.replace(/\/images$/, "") + "/os-styles" : "";
    var interact = defra.interactPlugin({ interactionModes: ["placeMarker"] });
    var plugins = [
      interact,
      defra.searchPlugin(searchConfig)
    ];
    if (typeof defra.scaleBarPlugin === "function") {
      plugins.push(defra.scaleBarPlugin({ units: "metric" }));
    }

    // OS styles need both the tile proxy (for the API key) and the vendored
    // style JSONs; without either, the map falls back to OpenFreeMap below.
    var osMapStyles = null;
    if (proxyUrl && stylesUrl) {
      osMapStyles = [
        {
          id: "outdoor",
          label: "Outdoor",
          thumbnail: imagesUrl + "/outdoor-map-thumb.jpg",
          url: stylesUrl + "/OS_VTS_3857_Outdoor.json",
          attribution: copyright,
          logo: imagesUrl + "/os-logo.svg",
          logoAltText: "Ordnance Survey",
          backgroundColor: "#f5f5f0"
        },
        {
          id: "dark",
          label: "Dark",
          thumbnail: imagesUrl + "/dark-map-thumb.jpg",
          url: stylesUrl + "/OS_VTS_3857_Dark.json",
          mapColorScheme: "dark",
          appColorScheme: "dark",
          attribution: copyright,
          logo: imagesUrl + "/os-logo-white.svg",
          logoAltText: "Ordnance Survey"
        },
        {
          id: "black-and-white",
          label: "Black/White",
          thumbnail: imagesUrl + "/black-and-white-map-thumb.jpg",
          url: stylesUrl + "/OS_VTS_3857_Black_and_White.json",
          attribution: copyright,
          logo: imagesUrl + "/os-logo.svg",
          logoAltText: "Ordnance Survey"
        }
      ];
    }

    if (typeof defra.mapStylesPlugin === "function" && osMapStyles) {
      plugins.push(defra.mapStylesPlugin({ mapStyles: osMapStyles }));
    }

    // Mount on a dedicated child element: InteractiveMap JSON-parses every
    // data-* attribute on its mount element, so it must not see the gem's
    // plain-string attributes on the container.
    const mapRoot = document.createElement("div");
    mapRoot.id = container.id + "-map";
    container.appendChild(mapRoot);

    var interactiveMap;
    try {
      interactiveMap = new defra.InteractiveMap(mapRoot.id, {
        behaviour: "inline",
        mapProvider: defra.maplibreProvider(),
        plugins: plugins,
        transformRequest: makeTransformRequest(proxyUrl, stylesUrl),
        mapStyle: osMapStyles ? osMapStyles[0] : {
          url: "https://tiles.openfreemap.org/styles/liberty",
          attribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
          backgroundColor: "#f5f5f0"
        },
        center: center,
        zoom: zoom,
        minZoom: 6,
        maxZoom: 19,
        maxBounds: [[-8.5, 49], [2, 61.5]],
        containerHeight: "400px",
        mapLabel: options.mapLabel || "Interactive map",
        enableZoomControls: true
      });
    } catch (e) {
      reportError(options, "map initialisation failed", e);
      return null;
    }

    container.classList.remove("govuk-!-display-none");

    // Plugin buttons render without a type attribute, which makes them submit
    // buttons inside a parent form: pressing Enter in a field could activate one
    // instead of submitting. Force type="button" at render time and as controls
    // appear, not just on click (a click is too late for keyboard submission).
    function fixButtonTypes() {
      var buttons = container.querySelectorAll("button:not([type])");
      for (var i = 0; i < buttons.length; i++) { buttons[i].setAttribute("type", "button"); }
    }

    interactiveMap.on("map:ready", function () {
      if (typeof interact.enable === "function") { interact.enable(); }
      fixButtonTypes();
    });

    if (typeof MutationObserver === "function") {
      new MutationObserver(fixButtonTypes).observe(container, { childList: true, subtree: true });
    }

    if (options.gridRefFieldId && typeof DefraGridRef !== "undefined") {
      // GOV.UK form builder appends "-error" to the field ID when validation fails
      var field = document.getElementById(options.gridRefFieldId)
        || document.getElementById(options.gridRefFieldId + "-error");
      if (field) { DefraGridRefSync.wire(interactiveMap, field, proxyUrl, GRID_REF_ZOOM); }
    }

    return interactiveMap;
  }

  window.DefraMap = {
    init: initMap,
    _internal: { escapeHtml: escapeHtml, parseOsPlacesResults: parseOsPlacesResults }
  };
})();
