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

    # Copy third-party UMD bundles and CSS to public/defra-ruby-map/<version>/
    # Served as static files without Sprockets fingerprinting.
    initializer :copy_defra_ruby_map_public_assets, after: :load_config_initializers do
      public_dest = Rails.public_path.join("defra-ruby-map", DefraRubyMap::VERSION)
      version_marker = public_dest.join(".installed")

      next if version_marker.exist?

      FileUtils.rm_rf(Rails.public_path.join("defra-ruby-map"))
      FileUtils.mkdir_p(public_dest)

      # Copy JS directories (preserving structure for dynamic chunks)
      vendor_js = root.join("vendor", "assets", "javascripts")
      Dir[vendor_js.join("*")].each do |dir|
        next unless File.directory?(dir)

        FileUtils.cp_r(dir, public_dest.join(File.basename(dir)))
      end

      # Copy CSS
      FileUtils.mkdir_p(public_dest.join("css"))
      vendor_css = root.join("vendor", "assets", "stylesheets")
      Dir[vendor_css.join("**", "*.css")].each do |file|
        FileUtils.cp(file, public_dest.join("css", File.basename(file)))
      end

      # Copy images
      FileUtils.mkdir_p(public_dest.join("images"))
      vendor_images = root.join("vendor", "assets", "images", "defra-ruby-map")
      Dir[vendor_images.join("*")].each do |file|
        FileUtils.cp(file, public_dest.join("images", File.basename(file)))
      end

      FileUtils.touch(version_marker)
    end
  end
end
