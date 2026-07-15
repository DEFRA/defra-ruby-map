# DefraRubyMap

[![Quality gate status](https://sonarcloud.io/api/project_badges/measure?project=DEFRA_defra-ruby-map&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=DEFRA_defra-ruby-map)

Rails engine gem providing the [DEFRA Interactive Map](https://defra.github.io/interactive-map/) component for GOV.UK services, with OS grid reference conversion, bidirectional field sync, and a server-side proxy that keeps the OS API key out of the browser.

## Contents

- [@defra/interactive-map](https://github.com/DEFRA/interactive-map) — UMD build with the MapLibre provider and the interact, search, map-styles and scale-bar plugins
- [proj4js](https://github.com/proj4js/proj4js) — WGS84/OSGB36 coordinate conversion
- OS grid reference converter, ported from the [os_map_ref](https://github.com/DEFRA/os-map-ref) gem
- Ordnance Survey Vector Tile stylesheets (Outdoor / Dark / Black & White), vendored and pinned
- A generic map initializer with bidirectional grid reference sync
- A server-side proxy for the OS Places and OS Vector Tile APIs

## Installation

Add to your Gemfile:

```ruby
gem "defra_ruby_map"
```

## Configuration

Configure the OS Data Hub API key in an initializer. A single key is used for all three OS endpoints:

- `https://api.os.uk/maps/vector/v1` — vector tiles, glyphs and TileJSON
- `https://api.os.uk/search/places/v1/find` — address search
- `https://api.os.uk/search/places/v1/nearest` — nearest-address lookup

```ruby
# config/initializers/defra_ruby_map.rb
DefraRubyMap.configure do |config|
  config.os_maps_api_key = ENV.fetch("OS_MAPS_API_KEY", nil)
end
```

Mount the engine to expose the proxy endpoints. Mounting at `/defra-ruby-map` keeps the proxy URLs aligned with the asset URLs (see [How assets are served](#how-assets-are-served)):

```ruby
# config/routes.rb
mount DefraRubyMap::Engine => "/defra-ruby-map"
```

No asset precompilation or copy step is required — the engine serves its vendored assets automatically (see below).

## Usage

Add a map container to your view. `map_init.js` reads its configuration from `data-` attributes:

```erb
<div id="my-map"
     class="govuk-!-display-none"
     data-module="defra-interactive-map"
     data-proxy-url="/defra-ruby-map"
     data-images-url="<%= defra_map_asset_path("images") %>"
     data-initial-grid-reference="<%= @form.grid_reference %>"
     data-center="-1.5,52.5"
     data-zoom="6">
</div>
```

Load the assets. Reference the **vendored bundles, CSS and images** with the `defra_map_asset_path` helper (they are served by the engine, not the asset pipeline), and the **first-party JS** (`grid_reference_converter`, `grid_ref_sync`, `map_init`) with `javascript_include_tag` (these go through Sprockets and are precompiled; load `map_init` last):

```erb
<link rel="stylesheet" href="<%= defra_map_asset_path("css/interactive-map.css") %>" media="all" />
<link rel="stylesheet" href="<%= defra_map_asset_path("css/search-plugin.css") %>" media="all" />
<link rel="stylesheet" href="<%= defra_map_asset_path("css/map-styles-plugin.css") %>" media="all" />
<link rel="stylesheet" href="<%= defra_map_asset_path("css/scale-bar-plugin.css") %>" media="all" />

<script src="<%= defra_map_asset_path("proj4js/proj4.js") %>"></script>
<script src="<%= defra_map_asset_path("defra-interactive-map/index.js") %>"></script>
<script src="<%= defra_map_asset_path("maplibre-provider/index.js") %>"></script>
<script src="<%= defra_map_asset_path("interact-plugin/index.js") %>"></script>
<script src="<%= defra_map_asset_path("search-plugin/index.js") %>"></script>
<script src="<%= defra_map_asset_path("map-styles-plugin/index.js") %>"></script>
<script src="<%= defra_map_asset_path("scale-bar-plugin/index.js") %>"></script>

<%= javascript_include_tag "defra-ruby-map/grid_reference_converter" %>
<%= javascript_include_tag "defra-ruby-map/grid_ref_sync" %>
<%= javascript_include_tag "defra-ruby-map/map_init" %>
```

> Do not load the vendored bundles with `javascript_include_tag`/`stylesheet_link_tag` — they are not on the Sprockets precompile list and would raise `AssetNotPrecompiled` in production.

Initialize the map from your application JS:

```javascript
DefraMap.init(document.getElementById("my-map"), {
  mapLabel: "Select waste activity location",
  gridRefFieldId: "my-grid-reference-field"  // optional, enables bidirectional sync
});
```

## How assets are served

The engine mounts a Rack middleware (`DefraRubyMap::AssetServer`) that serves the vendored JS, CSS and images straight from the gem at `/defra-ruby-map/<gem-version>/…`, with `Cache-Control: public, max-age=31536000, immutable`. Nothing is copied into the host app's `public/` directory, so the mechanism is safe on read-only filesystems and during rolling deploys, and each running process serves the assets for its own gem version.

`defra_map_asset_path("search-plugin/index.js")` returns `/defra-ruby-map/<gem-version>/search-plugin/index.js`. The version segment makes each release's URLs unique, so the immutable caching is safe.

## JavaScript API

### `DefraMap.init(container, options)`

Initializes the interactive map on the given container element and returns the map instance (or `null` if the bundles failed to load).

| Option | Type | Description |
|--------|------|-------------|
| `mapLabel` | string | Accessible label for the map (default: `"Interactive map"`) |
| `gridRefFieldId` | string | ID of a grid reference input field for bidirectional sync (optional) |
| `onError` | function | Called with the error if initialization fails, e.g. for monitoring (optional) |

The container reads further configuration from `data-` attributes:

| Attribute | Description |
|-----------|-------------|
| `data-proxy-url` | Base URL of the engine's proxy endpoints (e.g. `/defra-ruby-map`). Required for address search, OS tiles and the default OS basemap. |
| `data-images-url` | Base URL of the vendored images (use `defra_map_asset_path("images")`). Also used to locate the vendored OS style JSONs. |
| `data-initial-grid-reference` | Pre-centre the map on this grid reference |
| `data-center` | Default centre as `lng,lat` (default: `-1.5,52.5`) |
| `data-zoom` | Default zoom level (default: `6`) |

When `data-proxy-url` and `data-images-url` are both present, the map defaults to the proxied OS Outdoor basemap; otherwise it falls back to an OpenStreetMap style.

### Proxy endpoints

The engine provides three server-side proxy endpoints (relative to the mount point) that inject the OS API key. The key is never exposed to the browser.

| Endpoint | Purpose |
|----------|---------|
| `GET geocode-proxy?query=Bristol` | Address search via the OS Places API |
| `GET nearest-proxy?easting=530070&northing=180358` | Nearest-address lookup for a clicked location |
| `GET os-tiles-proxy/*path` | OS Vector Tile API (tiles, glyphs, TileJSON), restricted to `maps/vector/v1/vts` paths |

### `DefraGridRef`

Grid reference conversion utilities (WGS84 ↔ OSGB36 ↔ OS grid reference). Grid references must be two letters plus ten digits:

```javascript
DefraGridRef.coordsToGridRef(lng, lat)                  // => "ST 58132 72695" or null
DefraGridRef.gridRefToCoords("ST 58132 72695")          // => [lng, lat] or null
DefraGridRef.isValidGridRef("ST 58132 72695")           // => true
DefraGridRef.eastingNorthingToGridRef(358132, 172695)   // => "ST 58132 72695" or null
DefraGridRef.gridRefToEastingNorthing("ST 58132 72695") // => [easting, northing] or null
DefraGridRef.coordsToEastingNorthing(lng, lat)          // => [easting, northing] or null
```

## Content Security Policy

With the default OS basemap, all map data — tiles, glyphs, TileJSON, style JSONs, sprites and address search — is served same-origin (via the engine's proxy or the asset middleware), so no external hosts need allowlisting. MapLibre GL itself needs:

| Directive | Value | Reason |
|-----------|-------|--------|
| `script-src` / `worker-src` | `blob:` | MapLibre GL web workers |
| `img-src` | `data:` `blob:` | MapLibre marker/canvas internals |

If you disable the proxy and fall back to the OpenStreetMap basemap, also allowlist `https://tiles.openfreemap.org` under `connect-src`.

## Rate limiting

The proxy endpoints are unauthenticated by design — they serve a public page — and each request spends the OS API quota. 

Apply **per-IP rate limiting** at the host or WAF/CDN layer. A ready-to-tune [Rack::Attack](https://github.com/rack/rack-attack) config:

```ruby
# config/initializers/rack_attack.rb
class Rack::Attack
  # Address search / reverse lookup — user-driven, low volume.
  throttle("defra_ruby_map/places", limit: 60, period: 1.minute) do |req|
    req.ip if req.path.end_with?("/geocode-proxy", "/nearest-proxy")
  end

  # Vector tiles — many requests per map view, but cacheable; throttle generously.
  throttle("defra_ruby_map/tiles", limit: 600, period: 1.minute) do |req|
    req.ip if req.path.include?("/os-tiles-proxy/")
  end
end
```

## Updating vendored assets

Third-party JS/CSS and the pinned OS stylesheets are managed via npm:

```bash
npm install          # first time
npm update           # update @defra/interactive-map and proj4
npm run vendor       # copy the UMD bundles, CSS, images and pinned OS styles into vendor/assets/
```

The `vendor/assets/` files are committed to git so the gem works without npm at install time. CI re-runs `npm run vendor` and fails if the committed output drifts from the locked package versions. The `app/assets/` files are first-party code and are not touched by `npm run vendor`.

## Testing

```bash
bundle exec rspec                              # Ruby: engine, proxy and asset middleware
npm test                                       # JS: converter, search parsing and map/field sync
npm run test:coverage                          # JS tests plus lcov coverage report for SonarCloud
bundle exec rubocop                            # lint
```

## License

Licensed under the [Open Government Licence v3.0](LICENSE) (`OGL-UK-3.0`).
