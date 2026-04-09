# frozen_string_literal: true

module DefraRubyMap
  class Engine < ::Rails::Engine
    isolate_namespace DefraRubyMap

    initializer :append_defra_ruby_map_assets do |app|
      app.config.assets.paths << root.join("app", "assets", "javascripts")
      app.config.assets.paths << root.join("vendor", "assets", "javascripts")
      app.config.assets.paths << root.join("vendor", "assets", "stylesheets")
    end

    initializer :precompile_defra_ruby_map_assets do |app|
      # Precompile all JS and CSS provided by this gem.
      # Uses Dir glob so updating vendored files doesn't require editing this list.
      js_roots = [
        root.join("app", "assets", "javascripts"),
        root.join("vendor", "assets", "javascripts")
      ]
      css_root = root.join("vendor", "assets", "stylesheets")

      js_roots.each do |js_root|
        Dir[js_root.join("**", "*.js")].each do |file|
          app.config.assets.precompile << Pathname.new(file).relative_path_from(js_root).to_s
        end
      end

      Dir[css_root.join("**", "*.css")].each do |file|
        app.config.assets.precompile << Pathname.new(file).relative_path_from(css_root).to_s
      end
    end
  end
end
