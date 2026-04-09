# DefraRubyMap

Rails engine gem providing the [DEFRA Interactive Map](https://defra.github.io/interactive-map/) component for GOV.UK services, with OS grid reference conversion and bidirectional sync.

## Contents

- [@defra/interactive-map](https://github.com/DEFRA/interactive-map) (UMD build with MapLibre provider, interact and search plugins)
- [proj4js](https://github.com/proj4js/proj4js) (WGS84/OSGB36 coordinate conversion)
- OS Grid Reference converter (ported from [os_map_ref](https://github.com/DEFRA/os-map-ref) gem)
- Generic map initializer with bidirectional grid reference sync

## Installation

Add to your Gemfile:

```ruby
gem "defra_ruby_map"
```

## Usage

Add a map container to your view:

```erb
<div id="my-map"
     class="govuk-!-display-none"
     data-module="defra-interactive-map"
     data-initial-grid-reference="<%= @form.grid_reference %>"
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
- `data-initial-grid-reference` — pre-populate the map from this grid reference
- `data-center` — default center as `lng,lat` (default: `-1.5,52.5`)
- `data-zoom` — default zoom level (default: `6`)

### DefraGridRef

Grid reference conversion utilities:

```javascript
DefraGridRef.coordsToGridRef(lng, lat)   // => "ST 58132 72695" or null
DefraGridRef.gridRefToCoords("ST 58132 72695")  // => [lng, lat] or null
DefraGridRef.isValidGridRef("ST 58132 72695")   // => true
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
| `connect-src` | `https://nominatim.openstreetmap.org` | Location search |
| `img-src` | `data:` `blob:` `https://tiles.openfreemap.org` | Tile images, MapLibre internals |
| `script-src` | `blob:` | MapLibre web workers |

## License

The Open Government Licence (OGL) Version 3.
