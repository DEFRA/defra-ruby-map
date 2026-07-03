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

    # Register app/assets for Sprockets
    initializer :append_defra_ruby_map_assets do |app|
      app.config.assets.paths << root.join("app", "assets", "javascripts")
    end

    # Precompile only our own JS files (grid_reference_converter, map_init).
    initializer :precompile_defra_ruby_map_assets do |app|
      js_root = root.join("app", "assets", "javascripts")

      Dir[js_root.join("**", "*.js")].each do |file|
        app.config.assets.precompile << Pathname.new(file).relative_path_from(js_root).to_s
      end
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
