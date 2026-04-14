// DefraMap — Generic interactive map initializer
// Finds containers with data-module="defra-interactive-map", initializes the map,
// and optionally wires bidirectional sync with a grid reference field.
//
// Dependencies: defra.InteractiveMap, defra.maplibreProvider, defra.interactPlugin,
//   defra.searchPlugin, DefraGridRef (all loaded per-page via script tags)

(function () {
  "use strict";

  var DEFAULT_CENTER = [-1.5, 52.5];
  var DEFAULT_ZOOM = 6;

  function initMap(container, options) {
    if (typeof defra === "undefined" || typeof defra.InteractiveMap !== "function") { return null; }

    options = options || {};
    var proxyUrl = container.getAttribute("data-proxy-url") || "";
    var center = (container.getAttribute("data-center") || "").split(",").map(Number);
    if (center.length !== 2 || isNaN(center[0])) { center = DEFAULT_CENTER; }
    var zoom = parseInt(container.getAttribute("data-zoom") || DEFAULT_ZOOM, 10);

    var initialGridRef = container.getAttribute("data-initial-grid-reference");
    if (initialGridRef && typeof DefraGridRef !== "undefined" && DefraGridRef.isValidGridRef(initialGridRef)) {
      var coords = DefraGridRef.gridRefToCoords(initialGridRef);
      if (coords) {
        center = coords;
        zoom = 15;
      }
    }

    // Configure search plugin — use proxy if available, otherwise no search
    var searchConfig = { showMarker: false };
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

    var interactiveMap;
    try {
      interactiveMap = new defra.InteractiveMap(container.id, {
        behaviour: "inline",
        mapProvider: defra.maplibreProvider(),
        mapStyle: {
          url: "https://tiles.openfreemap.org/styles/liberty",
          attribution: "OpenFreeMap &copy; OpenMapTiles Data from OpenStreetMap"
        },
        center: center,
        zoom: zoom,
        containerHeight: "400px",
        mapLabel: options.mapLabel || "Interactive map",
        enableZoomControls: true,
        plugins: [
          defra.interactPlugin({ interactionModes: ["placeMarker"], closeOnAction: false }),
          defra.searchPlugin(searchConfig)
        ]
      });
    } catch (e) {
      return null;
    }

    container.classList.remove("govuk-!-display-none");

    // Prevent map buttons from submitting a parent form
    container.addEventListener("click", function (e) {
      var button = e.target.closest("button");
      if (button && !button.getAttribute("type")) {
        button.setAttribute("type", "button");
      }
    }, true);

    if (options.gridRefFieldId && typeof DefraGridRef !== "undefined") {
      var field = document.getElementById(options.gridRefFieldId);
      if (field) { wireGridRefSync(interactiveMap, field, proxyUrl); }
    }

    return interactiveMap;
  }

  function wireGridRefSync(interactiveMap, field, proxyUrl) {
    var mapInstance = null;

    // Map → field: nearest address lookup via proxy
    interactiveMap.on("interact:markerchange", function (event) {
      if (!event || !event.coords) { return; }
      var lng = event.coords[0];
      var lat = event.coords[1];

      // Immediately show raw grid reference (optimistic UX)
      var rawGridRef = DefraGridRef.coordsToGridRef(lng, lat);
      if (!rawGridRef) { return; }
      field.value = rawGridRef;

      // If proxy available, look up nearest registered address
      if (proxyUrl) {
        // Convert to easting/northing for the nearest endpoint
        var en = DefraGridRef.coordsToEastingNorthing(lng, lat);
        if (!en) { return; }

        var controller = new AbortController();
        var timeoutId = setTimeout(function () { controller.abort(); }, 2000);

        fetch(proxyUrl + "/nearest-proxy?easting=" + Math.round(en[0]) + "&northing=" + Math.round(en[1]), { signal: controller.signal })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            clearTimeout(timeoutId);
            if (data && data.results && data.results.length > 0) {
              var result = data.results[0].DPA || data.results[0].LPI;
              if (result && result.X_COORDINATE && result.Y_COORDINATE) {
                var nearestGridRef = DefraGridRef.eastingNorthingToGridRef(result.X_COORDINATE, result.Y_COORDINATE);
                if (nearestGridRef) {
                  field.value = nearestGridRef;
                }
              }
            }
          })
          .catch(function () {
            clearTimeout(timeoutId);
            // Keep raw grid reference on failure
          });
      }
    });

    // Capture underlying MapLibre instance for flyTo
    interactiveMap.on("map:ready", function (event) {
      if (event && event.map) { mapInstance = event.map; }
    });

    // Field → map: listen on 'change' event (fires on blur/enter)
    field.addEventListener("change", function () {
      if (!mapInstance) { return; }
      var value = field.value;
      if (!DefraGridRef.isValidGridRef(value)) { return; }
      var coords = DefraGridRef.gridRefToCoords(value);
      if (!coords) { return; }
      mapInstance.flyTo({ center: coords, zoom: 15 });
    });
  }

  window.DefraMap = { init: initMap };
})();
