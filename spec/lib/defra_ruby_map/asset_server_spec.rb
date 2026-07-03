# frozen_string_literal: true

require "rails_helper"
require "rack/mock"

RSpec.describe DefraRubyMap::AssetServer do
  # Downstream app records whether the request fell through to it.
  let(:downstream) { ->(_env) { [418, { "Content-Type" => "text/plain" }, ["fell-through"]] } }
  let(:middleware) { described_class.new(downstream) }
  let(:version) { DefraRubyMap::VERSION }

  def get(path, method: "GET")
    Rack::MockRequest.new(middleware).request(method, path)
  end

  def cache_control(response)
    response.headers["cache-control"] || response.headers["Cache-Control"]
  end

  describe "serving vendored assets" do
    it "serves a plugin entrypoint JS with immutable caching" do
      res = get("/defra-ruby-map/#{version}/search-plugin/index.js")

      expect(res.status).to eq(200)
      expect(res.headers["Content-Type"]).to include("javascript")
      expect(cache_control(res)).to eq("public, max-age=31536000, immutable")
      expect(res.body).not_to be_empty
    end

    it "serves the dynamically-loaded im-* chunk (would break under fingerprinting)" do
      res = get("/defra-ruby-map/#{version}/search-plugin/im-search-plugin.js")

      expect(res.status).to eq(200)
      expect(res.headers["Content-Type"]).to include("javascript")
    end

    it "serves proj4" do
      expect(get("/defra-ruby-map/#{version}/proj4js/proj4.js").status).to eq(200)
    end

    it "maps css/<name>.css to the vendored stylesheet" do
      res = get("/defra-ruby-map/#{version}/css/search-plugin.css")

      expect(res.status).to eq(200)
      expect(res.headers["Content-Type"]).to include("css")
      expect(cache_control(res)).to eq("public, max-age=31536000, immutable")
    end

    it "maps images/<name> to the images/defra-ruby-map directory" do
      res = get("/defra-ruby-map/#{version}/images/os-logo.svg")

      expect(res.status).to eq(200)
      expect(res.headers["Content-Type"]).to include("svg")
    end

    it "serves nested os-styles assets including sprites" do
      expect(get("/defra-ruby-map/#{version}/os-styles/OS_VTS_3857_Outdoor.json").status).to eq(200)
      expect(get("/defra-ruby-map/#{version}/os-styles/sprites/sprite.png").status).to eq(200)
    end

    it "serves the style JSON with a JSON content type" do
      res = get("/defra-ruby-map/#{version}/os-styles/OS_VTS_3857_Outdoor.json")
      expect(res.headers["Content-Type"]).to include("json")
    end

    it "supports HEAD requests" do
      res = get("/defra-ruby-map/#{version}/search-plugin/index.js", method: "HEAD")
      expect(res.status).to eq(200)
      expect(res.body).to be_empty
    end
  end

  describe "pass-through (does not intercept)" do
    it "passes the proxy endpoints through (no version segment)" do
      res = get("/defra-ruby-map/geocode-proxy")
      expect(res.status).to eq(418)
      expect(res.body).to eq("fell-through")
    end

    it "passes os-tiles-proxy through" do
      expect(get("/defra-ruby-map/os-tiles-proxy/maps/vector/v1/vts").status).to eq(418)
    end

    it "passes a different (stale) version through" do
      expect(get("/defra-ruby-map/0.0.1/search-plugin/index.js").status).to eq(418)
    end

    it "passes unrelated paths through" do
      expect(get("/health").status).to eq(418)
    end

    it "passes non-GET/HEAD methods through" do
      expect(get("/defra-ruby-map/#{version}/search-plugin/index.js", method: "POST").status).to eq(418)
    end
  end

  describe "safety" do
    it "does not escape the vendor root via path traversal" do
      res = get("/defra-ruby-map/#{version}/../../../../../etc/passwd")
      expect(res.status).not_to eq(200)
      expect(res.body).not_to include("root:")
    end

    it "does not escape via an encoded traversal" do
      res = get("/defra-ruby-map/#{version}/search-plugin/..%2f..%2f..%2fetc%2fpasswd")
      expect(res.status).not_to eq(200)
      expect(res.body).not_to include("root:")
    end

    it "404s an unknown asset under the version prefix" do
      expect(get("/defra-ruby-map/#{version}/nope/missing.js").status).to eq(404)
    end
  end
end
