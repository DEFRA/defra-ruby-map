# frozen_string_literal: true

require "net/http"

module DefraRubyMap
  class ProxyController < ActionController::Base
    OS_PLACES_FIND_URL = "https://api.os.uk/search/places/v1/find"
    OS_PLACES_NEAREST_URL = "https://api.os.uk/search/places/v1/nearest"

    def geocode
      query = params[:query]
      return render(json: { error: "query parameter required" }, status: :bad_request) if query.blank?
      return render(json: { error: "OS API key not configured" }, status: :service_unavailable) unless api_key.present?

      proxy_get(OS_PLACES_FIND_URL, query: query, output_srs: "EPSG:4326", maxresults: 5, key: api_key)
    end

    def nearest
      easting = params[:easting]
      northing = params[:northing]
      return render(json: { error: "easting and northing parameters required" }, status: :bad_request) if easting.blank? || northing.blank?
      return render(json: { error: "OS API key not configured" }, status: :service_unavailable) unless api_key.present?

      proxy_get(OS_PLACES_NEAREST_URL, point: "#{easting},#{northing}", key: api_key)
    end

    private

    def api_key
      DefraRubyMap.configuration.os_places_api_key
    end

    def proxy_get(base_url, params)
      uri = URI(base_url)
      uri.query = URI.encode_www_form(params)

      response = Net::HTTP.get_response(uri)
      render(json: response.body, status: response.code.to_i)
    rescue StandardError => e
      render(json: { error: e.message }, status: :bad_gateway)
    end
  end
end
