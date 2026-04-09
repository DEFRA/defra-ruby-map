// DefraMap — Generic interactive map initializer
// Finds containers with data-module="defra-interactive-map", initializes the map,
// and optionally wires bidirectional sync with a grid reference field.
//
// Dependencies: defra.InteractiveMap, defra.maplibreProvider, defra.interactPlugin,
//   defra.searchPlugin, proj4, DefraGridRef (all loaded per-page via script tags)

(function () {
  "use strict";

  var DEFAULT_CENTER = [-1.5, 52.5];
  var DEFAULT_ZOOM = 6;

  // Nominatim custom dataset for the search plugin
  var nominatimDataset = {
    name: "nominatim",
    urlTemplate: "https://nominatim.openstreetmap.org/search?q={query}&format=json&countrycodes=gb&limit=5",
    parseResults: function (data, query) {
      if (!Array.isArray(data)) { return []; }
      return data.map(function (item) {
        var text = String(item.display_name || "");
        var escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        var marked = text.replace(new RegExp("(" + escaped + ")", "i"), "<mark>$1</mark>");
        return {
          id: String(item.place_id),
          text: text,
          marked: marked,
          point: [parseFloat(item.lon), parseFloat(item.lat)],
          bounds: item.boundingbox ? [
            parseFloat(item.boundingbox[2]),
            parseFloat(item.boundingbox[0]),
            parseFloat(item.boundingbox[3]),
            parseFloat(item.boundingbox[1])
          ] : null
        };
      });
    }
  };

  function initMap(container, options) {
    if (typeof defra === "undefined" || typeof defra.InteractiveMap !== "function") { return null; }

    options = options || {};
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
          defra.searchPlugin({ showMarker: false, customDatasets: [nominatimDataset] })
        ]
      });
    } catch (e) {
      return null;
    }

    container.classList.remove("govuk-!-display-none");

    container.addEventListener("click", function (e) {
      var button = e.target.closest("button");
      if (button && !button.getAttribute("type")) {
        button.setAttribute("type", "button");
      }
    }, true);

    if (options.gridRefFieldId && typeof DefraGridRef !== "undefined") {
      var field = document.getElementById(options.gridRefFieldId);
      if (field) { wireGridRefSync(interactiveMap, field); }
    }

    return interactiveMap;
  }

  function wireGridRefSync(interactiveMap, field) {
    var programmaticUpdate = false;
    var debounceTimer = null;
    var mapInstance = null;

    interactiveMap.on("interact:markerchange", function (event) {
      if (!event || !event.coords) { return; }
      var gridRef = DefraGridRef.coordsToGridRef(event.coords[0], event.coords[1]);
      if (!gridRef) { return; }
      programmaticUpdate = true;
      field.value = gridRef;
      if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    });

    interactiveMap.on("map:ready", function (event) {
      if (event && event.map) { mapInstance = event.map; }
    });

    field.addEventListener("input", function () {
      if (debounceTimer) { clearTimeout(debounceTimer); }
      debounceTimer = setTimeout(function () {
        if (programmaticUpdate) { programmaticUpdate = false; return; }
        if (!mapInstance) { return; }
        var value = field.value;
        if (!DefraGridRef.isValidGridRef(value)) { return; }
        var coords = DefraGridRef.gridRefToCoords(value);
        if (!coords) { return; }
        mapInstance.flyTo({ center: coords, zoom: 15 });
      }, 300);
    });
  }

  window.DefraMap = { init: initMap };
})();
