# frozen_string_literal: true

module DefraRubyMap
  class Engine < ::Rails::Engine
    isolate_namespace DefraRubyMap

    # Include the map helper in all views
    initializer :defra_ruby_map_helpers do
      ActiveSupport.on_load(:action_view) do
        require "defra_ruby_map/map_helper"
        include DefraRubyMap::MapHelper
      end
    end

    # sprockets-rails already appends this engine's app/assets/javascripts to
    # the host's asset paths, so we only need to mark our own JS for precompile.
    initializer :precompile_defra_ruby_map_assets do |app|
      app.config.assets.precompile += %w[
        defra-ruby-map/grid_reference_converter.js
        defra-ruby-map/grid_ref_sync.js
        defra-ruby-map/map_init.js
      ]
    end

    # Serve the vendored bundles/CSS/images straight from the gem at
    # /defra-ruby-map/<version>/... via a Rack middleware — no copy into the
    # host app's public directory. Inserted before ActionDispatch::Static when
    # static file serving is enabled so our versioned assets take precedence
    # over any stale public/defra-ruby-map left by a previous gem version.
    initializer :defra_ruby_map_asset_server do |app|
      require "defra_ruby_map/asset_server"

      if app.config.public_file_server.enabled
        app.middleware.insert_before(ActionDispatch::Static, DefraRubyMap::AssetServer)
      else
        app.middleware.use(DefraRubyMap::AssetServer)
      end
    end
  end
end
