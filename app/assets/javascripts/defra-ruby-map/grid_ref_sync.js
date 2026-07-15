// DefraGridRefSync — bidirectional sync between a DefraMap instance and a
// grid reference input field. Depends on DefraGridRef (loaded per-page via
// its own script tag) for coordinate conversions. Include this file before
// map_init.js.

(function () {
  "use strict";

  // Visually-hidden aria-live region so a screen-reader user hears when the map
  // updates the grid reference field. Inline styles avoid depending on host CSS.
  function createLiveRegion() {
    var region = document.createElement("div");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;" +
      "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
    return region;
  }

  // gridRefZoom: zoom level for flying to a typed grid reference (the caller,
  // map_init.js, owns the constant).
  function wireGridRefSync(interactiveMap, field, proxyUrl, gridRefZoom) {
    var mapInstance = null;
    var pendingController = null;
    var GRIDREF_MARKER_ID = "grid-ref-pin";
    var SEARCH_MARKER_ID = "search";
    var INTERACT_MARKER_ID = "location";

    var liveRegion = createLiveRegion();
    (field.parentNode || document.body).appendChild(liveRegion);

    // Writes a map-derived value into the field, tells host JS (validation,
    // character count) via a "change" event, and announces it to assistive tech.
    // A "change" event — not "input" — avoids re-triggering the field→map handler.
    function setField(value) {
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      liveRegion.textContent = "Grid reference updated to " + value;
    }

    // Map → field: nearest address lookup via proxy
    interactiveMap.on("interact:markerchange", function (event) {
      if (!event || !event.coords) { return; }
      interactiveMap.removeMarker(GRIDREF_MARKER_ID);
      interactiveMap.removeMarker(SEARCH_MARKER_ID);
      var lng = event.coords[0];
      var lat = event.coords[1];

      var en = DefraGridRef.coordsToEastingNorthing(lng, lat);
      if (!en) { return; }
      var rawGridRef = DefraGridRef.eastingNorthingToGridRef(en[0], en[1]);
      if (!rawGridRef) { return; }

      if (proxyUrl) {
        if (pendingController) { pendingController.abort(); }
        pendingController = new AbortController();
        var controller = pendingController;
        var timeoutId = setTimeout(function () {
          if (controller.signal.aborted) { return; }
          controller.abort();
          setField(rawGridRef);
        }, 2000);

        fetch(proxyUrl + "/nearest-proxy?easting=" + Math.round(en[0]) + "&northing=" + Math.round(en[1]), { signal: controller.signal })
          .then(function (response) { return response.json(); })
          .then(function (data) {
            clearTimeout(timeoutId);
            // Only clear the shared controller if it is still ours; a newer
            // request may have replaced it, and nulling it would break the
            // abort chain and let this stale response overwrite the field.
            if (pendingController === controller) { pendingController = null; }
            if (controller.signal.aborted) { return; }
            if (data && data.results && data.results.length > 0) {
              var result = data.results[0].DPA || data.results[0].LPI;
              if (result && result.X_COORDINATE && result.Y_COORDINATE) {
                var nearestGridRef = DefraGridRef.eastingNorthingToGridRef(result.X_COORDINATE, result.Y_COORDINATE);
                setField(nearestGridRef || rawGridRef);
                return;
              }
            }
            setField(rawGridRef);
          })
          .catch(function () {
            clearTimeout(timeoutId);
            if (pendingController === controller) { pendingController = null; }
            if (!controller.signal.aborted) { setField(rawGridRef); }
          });
      } else {
        setField(rawGridRef);
      }
    });

    // Search result selected: the plugin places its own "search" marker, so
    // clear the map-click / typed markers and set the field to its location.
    interactiveMap.on("search:match", function (event) {
      if (!event || !event.point) { return; }
      interactiveMap.removeMarker(GRIDREF_MARKER_ID);
      interactiveMap.removeMarker(INTERACT_MARKER_ID);
      var gridRef = DefraGridRef.coordsToGridRef(event.point[0], event.point[1]);
      if (gridRef) { setField(gridRef); }
    });

    // Capture underlying MapLibre instance for flyTo
    interactiveMap.on("map:ready", function (event) {
      if (event && event.map) { mapInstance = event.map; }
    });

    // Pin the field's pre-filled grid reference. "map:firstidle" is the
    // earliest event at which markers project correctly — any sooner and the
    // pin lands at pixel (0,0).
    interactiveMap.on("map:firstidle", function () {
      const value = field.value;
      if (!DefraGridRef.isValidGridRef(value)) { return; }
      const coords = DefraGridRef.gridRefToCoords(value);
      if (coords) { interactiveMap.addMarker(GRIDREF_MARKER_ID, coords); }
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
      mapInstance.flyTo({ center: coords, zoom: gridRefZoom });
    });
  }

  window.DefraGridRefSync = {
    wire: wireGridRefSync
  };
})();
