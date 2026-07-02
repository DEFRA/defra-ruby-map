// DefraMap — Generic interactive map initializer
// Finds containers with data-module="defra-interactive-map", initializes the map,
// and optionally wires bidirectional sync with a grid reference field.
//
// Dependencies: defra.InteractiveMap, defra.maplibreProvider, defra.interactPlugin,
//   defra.searchPlugin, defra.mapStylesPlugin, defra.scaleBarPlugin,
//   DefraGridRef (all loaded per-page via script tags)

(function () {
  "use strict";

  var DEFAULT_CENTER = [-1.5, 52.5];
  var DEFAULT_ZOOM = 6;
  var GRID_REF_ZOOM = 15;

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

  function initMap(container, options) {
    if (typeof defra === "undefined" || typeof defra.InteractiveMap !== "function") { return null; }

    options = options || {};
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
        parseResults: function (data, query) {
          if (!data || !data.results) { return []; }
          return data.results.map(function (item) {
            var record = item.DPA || item.LPI;
            if (!record) { return null; }
            var text = record.ADDRESS || "";
            var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            var marked = text.replace(new RegExp("(" + escaped + ")", "gi"), "<mark>$1</mark>");
            var lng = record.LNG || 0;
            var lat = record.LAT || 0;
            return {
              id: String(record.UPRN),
              text: text,
              marked: marked,
              point: [lng, lat],
              bounds: [lng - 0.005, lat - 0.005, lng + 0.005, lat + 0.005]
            };
          }).filter(Boolean);
        }
      }];
    }

    var copyright = "Contains OS data \u00a9 Crown copyright and database rights " + new Date().getFullYear();
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

    var interactiveMap;
    try {
      interactiveMap = new defra.InteractiveMap(container.id, {
        behaviour: "inline",
        mapProvider: defra.maplibreProvider(),
        plugins: plugins,
        transformRequest: makeTransformRequest(proxyUrl, stylesUrl),
        mapStyle: osMapStyles ? osMapStyles[0] : {
          url: "https://tiles.openfreemap.org/styles/liberty",
          attribution: "OpenFreeMap \u00a9 OpenMapTiles Data from OpenStreetMap",
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
      return null;
    }

    container.classList.remove("govuk-!-display-none");

    interactiveMap.on("map:ready", function () {
      if (typeof interact.enable === "function") { interact.enable(); }
    });

    // Prevent map buttons from submitting a parent form
    container.addEventListener("click", function (e) {
      var button = e.target.closest("button");
      if (button && !button.getAttribute("type")) {
        button.setAttribute("type", "button");
      }
    }, true);

    if (options.gridRefFieldId && typeof DefraGridRef !== "undefined") {
      // GOV.UK form builder appends "-error" to the field ID when validation fails
      var field = document.getElementById(options.gridRefFieldId)
        || document.getElementById(options.gridRefFieldId + "-error");
      if (field) { wireGridRefSync(interactiveMap, field, proxyUrl); }
    }

    return interactiveMap;
  }

  function wireGridRefSync(interactiveMap, field, proxyUrl) {
    var mapInstance = null;
    var pendingController = null;
    var GRIDREF_MARKER_ID = "grid-ref-pin";
    var SEARCH_MARKER_ID = "search";
    var INTERACT_MARKER_ID = "location";

    // Map → field: nearest address lookup via proxy
    interactiveMap.on("interact:markerchange", function (event) {
      if (!event || !event.coords) { return; }
      interactiveMap.removeMarker(GRIDREF_MARKER_ID);
      interactiveMap.removeMarker(SEARCH_MARKER_ID);
      var lng = event.coords[0];
      var lat = event.coords[1];

      var rawGridRef = DefraGridRef.coordsToGridRef(lng, lat);
      if (!rawGridRef) { return; }

      if (proxyUrl) {
        var en = DefraGridRef.coordsToEastingNorthing(lng, lat);
        if (!en) { field.value = rawGridRef; return; }

        if (pendingController) { pendingController.abort(); }
        pendingController = new AbortController();
        var controller = pendingController;
        var timeoutId = setTimeout(function () {
          if (controller.signal.aborted) { return; }
          controller.abort();
          field.value = rawGridRef;
        }, 2000);

        fetch(proxyUrl + "/nearest-proxy?easting=" + Math.round(en[0]) + "&northing=" + Math.round(en[1]), { signal: controller.signal })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            clearTimeout(timeoutId);
            pendingController = null;
            if (data && data.results && data.results.length > 0) {
              var result = data.results[0].DPA || data.results[0].LPI;
              if (result && result.X_COORDINATE && result.Y_COORDINATE) {
                var nearestGridRef = DefraGridRef.eastingNorthingToGridRef(result.X_COORDINATE, result.Y_COORDINATE);
                field.value = nearestGridRef || rawGridRef;
                return;
              }
            }
            field.value = rawGridRef;
          })
          .catch(function () {
            clearTimeout(timeoutId);
            pendingController = null;
            if (!controller.signal.aborted) { field.value = rawGridRef; }
          });
      } else {
        field.value = rawGridRef;
      }
    });

    // Capture underlying MapLibre instance for flyTo
    interactiveMap.on("map:ready", function (event) {
      if (event && event.map) { mapInstance = event.map; }
    });

    field.addEventListener("input", function () {
      if (!mapInstance) { return; }
      var value = field.value;
      if (!DefraGridRef.isValidGridRef(value)) { return; }
      var coords = DefraGridRef.gridRefToCoords(value);
      if (!coords) { return; }
      interactiveMap.removeMarker(GRIDREF_MARKER_ID);
      interactiveMap.removeMarker(SEARCH_MARKER_ID);
      interactiveMap.removeMarker(INTERACT_MARKER_ID);
      interactiveMap.addMarker(GRIDREF_MARKER_ID, coords);
      mapInstance.flyTo({ center: coords, zoom: GRID_REF_ZOOM });
    });
  }

  window.DefraMap = { init: initMap };
})();
