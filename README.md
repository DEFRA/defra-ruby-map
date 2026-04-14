# DefraRubyMap

Rails engine gem providing the [DEFRA Interactive Map](https://defra.github.io/interactive-map/) component for GOV.UK services, with OS grid reference conversion, bidirectional sync, and server-side proxy for OS API calls.

## Contents

- [@defra/interactive-map](https://github.com/DEFRA/interactive-map) (UMD build with MapLibre provider, interact and search plugins)
- [proj4js](https://github.com/proj4js/proj4js) (WGS84/OSGB36 coordinate conversion)
- OS Grid Reference converter (ported from [os_map_ref](https://github.com/DEFRA/os-map-ref) gem)
- Generic map initializer with bidirectional grid reference sync
- Server-side proxy for OS Places API (search and nearest address lookup)

## Installation

Add to your Gemfile:

```ruby
gem "defra_ruby_map"
```

## Configuration

Configure the OS API key in an initializer:

```ruby
# config/initializers/defra_ruby_map.rb
DefraRubyMap.configure do |config|
  config.os_api_key = ENV.fetch("OS_MAP_API_KEY", nil)
end
```

Mount the engine routes (either in your app or in a consuming engine):

```ruby
# config/routes.rb
mount DefraRubyMap::Engine, at: "/defra-ruby-map"
```

## Usage

Add a map container to your view:

```erb
<div id="my-map"
     class="govuk-!-display-none"
     data-module="defra-interactive-map"
     data-initial-grid-reference="<%= @form.grid_reference %>"
     data-proxy-url="/defra-ruby-map"
     data-center="-1.5,52.5"
     data-zoom="6">
</div>
```

Load the assets (inside a feature toggle or conditional block):

```erb
<%= stylesheet_link_tag "defra-interactive-map/interactive-map", media: "all" %>
<%= stylesheet_link_tag "defra-interactive-map/interact-plugin", media: "all" %>
<%= stylesheet_link_tag "defra-interactive-map/search-plugin", media: "all" %>
<%= javascript_include_tag "proj4js/proj4" %>
<%= javascript_include_tag "defra-interactive-map/index" %>
<%= javascript_include_tag "maplibre-provider/index" %>
<%= javascript_include_tag "interact-plugin/index" %>
<%= javascript_include_tag "search-plugin/index" %>
<%= javascript_include_tag "defra-ruby-map/grid_reference_converter" %>
<%= javascript_include_tag "defra-ruby-map/map_init" %>
```

Initialize the map from your application JS:

```javascript
DefraMap.init(document.getElementById("my-map"), {
  mapLabel: "Select waste activity location",
  gridRefFieldId: "my-grid-reference-field"  // optional, enables bidirectional sync
});
```

## JavaScript API

### DefraMap.init(container, options)

Initializes the interactive map on the given container element.

| Option | Type | Description |
|--------|------|-------------|
| `mapLabel` | string | Accessible label for the map (default: "Interactive map") |
| `gridRefFieldId` | string | ID of a grid reference input field for bidirectional sync (optional) |

The container reads configuration from `data-` attributes:
- `data-proxy-url` — base URL for the gem's proxy endpoints (e.g., `/defra-ruby-map`)
- `data-initial-grid-reference` — pre-populate the map from this grid reference
- `data-center` — default center as `lng,lat` (default: `-1.5,52.5`)
- `data-zoom` — default zoom level (default: `6`)

### Proxy Endpoints

The gem provides two server-side proxy endpoints that add the OS API key to requests:

| Endpoint | Purpose |
|----------|---------|
| `GET /geocode-proxy?query=Bristol` | Search for addresses via OS Places API |
| `GET /nearest-proxy?easting=530070&northing=180358` | Nearest address lookup for a clicked location |

The OS API key is never exposed to the browser.

### DefraGridRef

Grid reference conversion utilities:

```javascript
DefraGridRef.coordsToGridRef(lng, lat)   // => "ST 58132 72695" or null
DefraGridRef.gridRefToCoords("ST 58132 72695")  // => [lng, lat] or null
DefraGridRef.isValidGridRef("ST 58132 72695")   // => true
DefraGridRef.eastingNorthingToGridRef(358132, 172695)  // => "ST 58132 72695" or null
DefraGridRef.coordsToEastingNorthing(lng, lat)  // => [easting, northing] or null
```

## Updating vendored assets

Third-party JS/CSS is managed via npm:

```bash
npm install          # first time
npm update           # update @defra/interactive-map and proj4
npm run vendor       # copy UMD files to vendor/assets/
```

The `vendor/assets/` files are committed to git so the gem works without npm at install time. The `app/assets/` files (grid reference converter, map initializer) are our own code and are not affected by `npm run vendor`.

## CSP Requirements

Host applications must allowlist these domains if a strict Content Security Policy is enforced:

| Directive | Domain | Reason |
|-----------|--------|--------|
| `connect-src` | `https://tiles.openfreemap.org` | Map tile data |
| `img-src` | `data:` `blob:` `https://tiles.openfreemap.org` | Tile images, MapLibre internals |
| `script-src` | `blob:` | MapLibre web workers |

Note: OS API calls (`api.os.uk`) go through the server-side proxy, so no CSP entry is needed for them.

## License

The Open Government Licence (OGL) Version 3.
