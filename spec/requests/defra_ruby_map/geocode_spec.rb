# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Geocode proxy", type: :request do
  let(:api_key) { "test-os-key" }

  before { DefraRubyMap.configuration.os_maps_api_key = api_key }

  describe "GET /map/geocode-proxy" do
    it "proxies the query to the OS Places find endpoint with the configured key" do
      stub = stub_request(:get, "https://api.os.uk/search/places/v1/find")
             .with(query: { "query" => "10 Downing Street", "output_srs" => "EPSG:4326",
                            "maxresults" => "5", "key" => api_key })
             .to_return(status: 200, body: '{"results":[]}', headers: { "Content-Type" => "application/json" })

      get "/map/geocode-proxy", params: { query: "10 Downing Street" }

      expect(response).to have_http_status(:ok)
      expect(response.body).to eq('{"results":[]}')
      expect(stub).to have_been_requested.once
    end

    it "passes upstream error statuses through" do
      stub_request(:get, "https://api.os.uk/search/places/v1/find")
        .with(query: hash_including("key" => api_key))
        .to_return(status: 401, body: '{"error":"invalid key"}')

      get "/map/geocode-proxy", params: { query: "x" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 400 without calling upstream when query is missing" do
      get "/map/geocode-proxy"

      expect(response).to have_http_status(:bad_request)
      expect(WebMock).not_to have_requested(:get, %r{api\.os\.uk})
    end

    it "returns 503 without calling upstream when the API key is not configured" do
      DefraRubyMap.configuration.os_maps_api_key = nil

      get "/map/geocode-proxy", params: { query: "x" }

      expect(response).to have_http_status(:service_unavailable)
      expect(WebMock).not_to have_requested(:get, %r{api\.os\.uk})
    end

    it "returns 502 with a generic body and logs when the upstream connection fails" do
      stub_request(:get, "https://api.os.uk/search/places/v1/find")
        .with(query: hash_including("key" => api_key))
        .to_raise(SocketError.new("getaddrinfo: nodename nor servname provided"))

      expect(Rails.logger).to receive(:error).with(a_string_including("geocode upstream error", "SocketError"))

      get "/map/geocode-proxy", params: { query: "x" }

      expect(response).to have_http_status(:bad_gateway)
      expect(JSON.parse(response.body)["error"]).to eq("upstream service unavailable")
      expect(response.body).not_to include("getaddrinfo")
      expect(response.body).not_to include(api_key)
    end
  end
end
