# frozen_string_literal: true

require "rails_helper"

RSpec.describe "Nearest address proxy", type: :request do
  let(:api_key) { "test-os-key" }

  before { DefraRubyMap.configuration.os_maps_api_key = api_key }

  describe "GET /map/nearest-proxy" do
    it "proxies easting/northing as a point to the OS Places nearest endpoint" do
      stub = stub_request(:get, "https://api.os.uk/search/places/v1/nearest")
             .with(query: { "point" => "358901,171053", "key" => api_key })
             .to_return(status: 200, body: '{"results":[]}', headers: { "Content-Type" => "application/json" })

      get "/map/nearest-proxy", params: { easting: "358901", northing: "171053" }

      expect(response).to have_http_status(:ok)
      expect(response.body).to eq('{"results":[]}')
      expect(stub).to have_been_requested.once
    end

    %w[easting northing].each do |param|
      it "returns 400 without calling upstream when #{param} is missing" do
        get "/map/nearest-proxy", params: { easting: "358901", northing: "171053" }.except(param.to_sym)

        expect(response).to have_http_status(:bad_request)
        expect(WebMock).not_to have_requested(:get, %r{api\.os\.uk})
      end
    end

    it "returns 503 without calling upstream when the API key is not configured" do
      DefraRubyMap.configuration.os_maps_api_key = nil

      get "/map/nearest-proxy", params: { easting: "1", northing: "1" }

      expect(response).to have_http_status(:service_unavailable)
      expect(WebMock).not_to have_requested(:get, %r{api\.os\.uk})
    end

    it "returns 502 with a generic body and logs when the upstream times out" do
      stub_request(:get, "https://api.os.uk/search/places/v1/nearest")
        .with(query: hash_including("key" => api_key))
        .to_timeout

      expect(Rails.logger).to receive(:error).with(a_string_including("nearest upstream error"))

      get "/map/nearest-proxy", params: { easting: "1", northing: "1" }

      expect(response).to have_http_status(:bad_gateway)
      expect(JSON.parse(response.body)["error"]).to eq("upstream service unavailable")
    end
  end
end
