// DefraGridRefSync — bidirectional sync between a DefraMap instance and a
// grid reference input field. Depends on DefraGridRef (loaded per-page via
// its own script tag) for coordinate conversions. Include this file before
// map_init.js.

(function () {
  "use strict";

  const GRIDREF_MARKER_ID = "grid-ref-pin";
  const SEARCH_MARKER_ID = "search";
  const INTERACT_MARKER_ID = "location";
  const PROXY_TIMEOUT_MS = 2000;

  // Visually-hidden aria-live region so a screen-reader user hears when the map
  // updates the grid reference field. Inline styles avoid depending on host CSS.
  function createLiveRegion() {
    const region = document.createElement("div");
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    region.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;" +
      "overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;";
    return region;
  }

  // Extracts the nearest address's grid reference from a proxy response, or
  // null when the response has no usable result.
  function nearestGridRefFrom(data) {
    const first = data?.results?.[0];
    const record = first ? first.DPA || first.LPI : null;
    if (!record?.X_COORDINATE || !record?.Y_COORDINATE) { return null; }
    return window.DefraGridRef.eastingNorthingToGridRef(record.X_COORDINATE, record.Y_COORDINATE);
  }

  // Nearest address lookup via the proxy, falling back to the raw grid
  // reference on timeout, error, or an empty result. `state.pendingController`
  // is shared with the caller so a newer lookup aborts an in-flight one.
  function lookupNearestGridRef(proxyUrl, en, rawGridRef, state, setField) {
    if (state.pendingController) { state.pendingController.abort(); }
    const controller = new AbortController();
    state.pendingController = controller;
    const timeoutId = setTimeout(function () {
      if (controller.signal.aborted) { return; }
      controller.abort();
      setField(rawGridRef);
    }, PROXY_TIMEOUT_MS);

    fetch(`${proxyUrl}/nearest-proxy?easting=${Math.round(en[0])}&northing=${Math.round(en[1])}`, { signal: controller.signal })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        clearTimeout(timeoutId);
        // Only clear the shared controller if it is still ours; a newer
        // request may have replaced it, and nulling it would break the
        // abort chain and let this stale response overwrite the field.
        if (state.pendingController === controller) { state.pendingController = null; }
        if (controller.signal.aborted) { return; }
        setField(nearestGridRefFrom(data) || rawGridRef);
      })
      .catch(function () {
        clearTimeout(timeoutId);
        if (state.pendingController === controller) { state.pendingController = null; }
        if (!controller.signal.aborted) { setField(rawGridRef); }
      });
  }

  // gridRefZoom: zoom level for flying to a typed grid reference (the caller,
  // map_init.js, owns the constant).
  function wireGridRefSync(interactiveMap, field, proxyUrl, gridRefZoom) {
    let mapInstance = null;
    const state = { pendingController: null };

    const liveRegion = createLiveRegion();
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
      if (!event?.coords) { return; }
      interactiveMap.removeMarker(GRIDREF_MARKER_ID);
      interactiveMap.removeMarker(SEARCH_MARKER_ID);

      const en = window.DefraGridRef.coordsToEastingNorthing(event.coords[0], event.coords[1]);
      if (!en) { return; }
      const rawGridRef = window.DefraGridRef.eastingNorthingToGridRef(en[0], en[1]);
      if (!rawGridRef) { return; }

      if (proxyUrl) {
        lookupNearestGridRef(proxyUrl, en, rawGridRef, state, setField);
      } else {
        setField(rawGridRef);
      }
    });

    // Search result selected: the plugin places its own "search" marker, so
    // clear the map-click / typed markers and set the field to its location.
    interactiveMap.on("search:match", function (event) {
      if (!event?.point) { return; }
      interactiveMap.removeMarker(GRIDREF_MARKER_ID);
      interactiveMap.removeMarker(INTERACT_MARKER_ID);
      const gridRef = window.DefraGridRef.coordsToGridRef(event.point[0], event.point[1]);
      if (gridRef) { setField(gridRef); }
    });

    // Capture underlying MapLibre instance for flyTo
    interactiveMap.on("map:ready", function (event) {
      if (event?.map) { mapInstance = event.map; }
    });

    // Pin the field's pre-filled grid reference. "map:firstidle" is the
    // earliest event at which markers project correctly — any sooner and the
    // pin lands at pixel (0,0).
    interactiveMap.on("map:firstidle", function () {
      const value = field.value;
      if (!window.DefraGridRef.isValidGridRef(value)) { return; }
      const coords = window.DefraGridRef.gridRefToCoords(value);
      if (coords) { interactiveMap.addMarker(GRIDREF_MARKER_ID, coords); }
    });

    field.addEventListener("input", function () {
      if (!mapInstance) { return; }
      const value = field.value;
      if (!window.DefraGridRef.isValidGridRef(value)) { return; }
      const coords = window.DefraGridRef.gridRefToCoords(value);
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
