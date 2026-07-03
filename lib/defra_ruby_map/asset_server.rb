# frozen_string_literal: true

require "rack"
require "pathname"
require "active_support/core_ext/enumerable"
require "defra_ruby_map/version"

module DefraRubyMap
  # Rack middleware that serves the gem's vendored JS/CSS/image assets straight
  # from disk at /defra-ruby-map/<version>/..., so nothing is ever copied into
  # the host app's public directory. The version-pinned URL makes the responses
  # safely immutable. Requests that don't match this prefix — including the
  # proxy endpoints mounted at /defra-ruby-map/<action> — pass straight through.
  #
  # URL -> disk mapping (preserves the historical public-copy layout so consuming
  # apps need no change):
  #   /defra-ruby-map/<v>/css/<name>.css -> vendor/assets/stylesheets/**/<name>.css
  #   /defra-ruby-map/<v>/images/<name>  -> vendor/assets/images/defra-ruby-map/<name>
  #   /defra-ruby-map/<v>/<rest>         -> vendor/assets/javascripts/<rest>
  class AssetServer
    VENDOR_ROOT = File.expand_path("../../vendor/assets", __dir__)
    CACHE_CONTROL = "public, max-age=31536000, immutable"
    CACHE_HEADER = Rack.release.to_f >= 3.0 ? "cache-control" : "Cache-Control"

    def initialize(app)
      @app = app
      @prefix = "/defra-ruby-map/#{DefraRubyMap::VERSION}/"
      @files = Rack::Files.new(VENDOR_ROOT)
      @css_index = build_css_index
    end

    def call(env)
      return @app.call(env) unless servable?(env)

      subpath = env["PATH_INFO"][@prefix.length..]
      rel = relative_path(subpath)
      return @app.call(env) if rel.nil?

      status, headers, body = @files.call(env.merge("PATH_INFO" => "/#{rel}", "SCRIPT_NAME" => ""))
      headers[CACHE_HEADER] = CACHE_CONTROL if status == 200
      [status, headers, body]
    end

    private

    def servable?(env)
      %w[GET HEAD].include?(env["REQUEST_METHOD"]) && env["PATH_INFO"].to_s.start_with?(@prefix)
    end

    # Returns the path relative to VENDOR_ROOT (which Rack::Files then resolves
    # and traversal-checks), or nil to fall through to the app.
    def relative_path(subpath)
      return nil if subpath.empty? || subpath.split("/").include?("..")

      if subpath.start_with?("css/")
        file = @css_index[File.basename(Rack::Utils.unescape(subpath))]
        file && Pathname.new(file).relative_path_from(Pathname.new(VENDOR_ROOT)).to_s
      elsif subpath.start_with?("images/")
        "images/defra-ruby-map/#{subpath.delete_prefix('images/')}"
      else
        "javascripts/#{subpath}"
      end
    end

    def build_css_index
      Dir[File.join(VENDOR_ROOT, "stylesheets", "**", "*.css")].index_by { |file| File.basename(file) }
    end
  end
end
