# frozen_string_literal: true

require "rails_helper"

RSpec.describe "OS tiles proxy", type: :request do
  let(:api_key) { "test-os-key" }

  before { DefraRubyMap.configuration.os_maps_api_key = api_key }

  describe "GET /map/os-tiles-proxy/*os_path" do
    context "with an allowed path" do
      it "proxies the VTS root to api.os.uk with the configured key" do
        stub = stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
               .with(query: { "srs" => "3857", "key" => api_key })
               .to_return(status: 200, body: '{"ok":true}', headers: { "Content-Type" => "application/json" })

        get "/map/os-tiles-proxy/maps/vector/v1/vts", params: { srs: "3857" }

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq('{"ok":true}')
        expect(response.media_type).to eq("application/json")
        expect(stub).to have_been_requested.once
      end

      it "proxies nested VTS resource paths" do
        stub = stub_request(:get, "https://api.os.uk/maps/vector/v1/vts/resources/styles")
               .with(query: { "key" => api_key })
               .to_return(status: 200, body: "{}", headers: { "Content-Type" => "application/json" })

        get "/map/os-tiles-proxy/maps/vector/v1/vts/resources/styles"

        expect(response).to have_http_status(:ok)
        expect(stub).to have_been_requested.once
      end

      it "keeps the file extension on tile paths (format: false routing)" do
        stub = stub_request(:get, "https://api.os.uk/maps/vector/v1/vts/tile/10/511/340.pbf")
               .with(query: { "key" => api_key })
               .to_return(status: 200, body: "tile-bytes", headers: { "Content-Type" => "application/x-protobuf" })

        get "/map/os-tiles-proxy/maps/vector/v1/vts/tile/10/511/340.pbf"

        expect(response).to have_http_status(:ok)
        expect(response.media_type).to eq("application/x-protobuf")
        expect(stub).to have_been_requested.once
      end

      it "overrides a client-supplied key with the configured key" do
        stub = stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
               .with(query: { "key" => api_key })
               .to_return(status: 200, body: "{}")

        get "/map/os-tiles-proxy/maps/vector/v1/vts", params: { key: "attacker-key" }

        expect(stub).to have_been_requested.once
        expect(WebMock).not_to have_requested(:get, /api\.os\.uk/).with(query: hash_including("key" => "attacker-key"))
      end

      it "returns 204 with no body when upstream returns 204" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts/tile/22/0/0.pbf")
          .with(query: { "key" => api_key })
          .to_return(status: 204)

        get "/map/os-tiles-proxy/maps/vector/v1/vts/tile/22/0/0.pbf"

        expect(response).to have_http_status(:no_content)
        expect(response.body).to be_empty
      end

      it "passes upstream error statuses through without marking them cacheable" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
          .with(query: { "key" => api_key })
          .to_return(status: 429, body: "quota exceeded")

        get "/map/os-tiles-proxy/maps/vector/v1/vts"

        expect(response).to have_http_status(:too_many_requests)
        expect(response.headers["Cache-Control"].to_s).not_to include("public")
      end

      it "forwards upstream cache headers on success" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
          .with(query: { "key" => api_key })
          .to_return(status: 200, body: "{}",
                     headers: { "Cache-Control" => "public, max-age=3600", "ETag" => '"abc123"' })

        get "/map/os-tiles-proxy/maps/vector/v1/vts"

        expect(response.headers["Cache-Control"]).to include("public").and include("max-age=3600")
        expect(response.headers["ETag"]).to eq('"abc123"')
      end

      it "sets a default public Cache-Control when upstream sends none" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
          .with(query: { "key" => api_key })
          .to_return(status: 200, body: "{}")

        get "/map/os-tiles-proxy/maps/vector/v1/vts"

        expect(response.headers["Cache-Control"]).to include("public").and include("max-age=86400")
      end

      it "strips the API key from the VTS root tiles URLs" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
          .with(query: { "srs" => "3857", "key" => api_key })
          .to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
            tiles: ["https://api.os.uk/maps/vector/v1/vts/tile/{z}/{y}/{x}.pbf?srs=3857&key=#{api_key}"]
          }.to_json)

        get "/map/os-tiles-proxy/maps/vector/v1/vts", params: { srs: "3857" }

        expect(response).to have_http_status(:ok)
        expect(response.body).not_to include(api_key)
        expect(response.parsed_body["tiles"])
          .to eq(["https://api.os.uk/maps/vector/v1/vts/tile/{z}/{y}/{x}.pbf?srs=3857"])
      end

      it "strips the API key from style sprite, glyphs and source URLs" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts/resources/styles")
          .with(query: { "key" => api_key })
          .to_return(status: 200, headers: { "Content-Type" => "application/json" }, body: {
            sprite: "https://api.os.uk/maps/vector/v1/vts/resources/sprites/sprite?key=#{api_key}",
            glyphs: "https://api.os.uk/maps/vector/v1/vts/resources/fonts/{fontstack}/{range}.pbf?key=#{api_key}",
            sources: { esritto: { type: "vector", url: "https://api.os.uk/maps/vector/v1/vts?key=#{api_key}&srs=3857" } }
          }.to_json)

        get "/map/os-tiles-proxy/maps/vector/v1/vts/resources/styles"

        body = response.parsed_body
        expect(response.body).not_to include(api_key)
        expect(body["sprite"]).to eq("https://api.os.uk/maps/vector/v1/vts/resources/sprites/sprite")
        expect(body["glyphs"]).to eq("https://api.os.uk/maps/vector/v1/vts/resources/fonts/{fontstack}/{range}.pbf")
        expect(body.dig("sources", "esritto", "url")).to eq("https://api.os.uk/maps/vector/v1/vts?srs=3857")
      end

      it "never relays the API key even outside a key= query param" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
          .with(query: { "key" => api_key })
          .to_return(status: 200, body: %({"note":"key\\u003d#{api_key}"}))

        get "/map/os-tiles-proxy/maps/vector/v1/vts"

        expect(response.body).not_to include(api_key)
      end

      it "returns 502 with a generic body when upstream times out" do
        stub_request(:get, "https://api.os.uk/maps/vector/v1/vts")
          .with(query: { "key" => api_key })
          .to_timeout

        get "/map/os-tiles-proxy/maps/vector/v1/vts"

        expect(response).to have_http_status(:bad_gateway)
        expect(response.parsed_body["error"]).to eq("upstream tile service unavailable")
        expect(response.body).not_to include(api_key)
      end
    end

    context "with a disallowed path" do
      {
        "a different OS API" => "search/places/v1/find",
        "a prefix bypass" => "maps/vector/v1/vtsx/tile/1/1/1.pbf",
        "a parent-dir traversal" => "maps/vector/v1/vts/../../../search/places/v1/find",
        "an encoded traversal" => "maps/vector/v1/vts/%2e%2e/%2e%2e/%2e%2e/search/places/v1/find",
        "a current-dir segment" => "maps/vector/v1/vts/./tile"
      }.each do |label, path|
        it "rejects #{label} without calling upstream" do
          get "/map/os-tiles-proxy/#{path}"

          expect(response.status).to be_between(400, 404)
          expect(WebMock).not_to have_requested(:get, /api\.os\.uk/)
        end
      end
    end

    context "when the API key is not configured" do
      it "returns 503 without calling upstream" do
        DefraRubyMap.configuration.os_maps_api_key = nil

        get "/map/os-tiles-proxy/maps/vector/v1/vts"

        expect(response).to have_http_status(:service_unavailable)
        expect(WebMock).not_to have_requested(:get, /api\.os\.uk/)
      end
    end
  end
end
