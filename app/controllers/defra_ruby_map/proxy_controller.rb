# frozen_string_literal: true

require "cgi"
require "net/http"

module DefraRubyMap
  class ProxyController < ApplicationController
    OS_PLACES_FIND_URL = "https://api.os.uk/search/places/v1/find"
    OS_PLACES_NEAREST_URL = "https://api.os.uk/search/places/v1/nearest"
    OS_TILES_ALLOWED_PREFIX = "maps/vector/v1/vts"

    before_action :require_api_key

    def geocode
      query = params[:query]
      return render(json: { error: "query parameter required" }, status: :bad_request) if query.blank?

      proxy_get(OS_PLACES_FIND_URL, query: query, output_srs: "EPSG:4326", maxresults: 5, key: os_maps_api_key)
    end

    def nearest
      easting = params[:easting]
      northing = params[:northing]
      if easting.blank? || northing.blank?
        return render(json: { error: "easting and northing parameters required" }, status: :bad_request)
      end

      proxy_get(OS_PLACES_NEAREST_URL, point: "#{easting},#{northing}", key: os_maps_api_key)
    end

    def os_tiles
      os_path = params[:os_path]
      return render(json: { error: "path required" }, status: :bad_request) if os_path.blank?
      return render(json: { error: "invalid path" }, status: :bad_request) unless allowed_os_path?(os_path)

      render_tile_response(fetch_upstream(os_tiles_uri(os_path)))
    rescue StandardError => e
      Rails.logger.error("[DefraRubyMap] os_tiles upstream error: #{e.class}: #{e.message}")
      render json: { error: "upstream tile service unavailable" }, status: :bad_gateway
    end

    private

    def require_api_key
      return if os_maps_api_key.present?

      render(json: { error: "OS Maps API key not configured" }, status: :service_unavailable)
    end

    def os_maps_api_key
      DefraRubyMap.configuration.os_maps_api_key
    end

    def allowed_os_path?(os_path)
      return false if os_path.split("/").any? { |seg| ["..", "."].include?(seg) }

      os_path == OS_TILES_ALLOWED_PREFIX || os_path.start_with?("#{OS_TILES_ALLOWED_PREFIX}/")
    end

    def os_tiles_uri(os_path)
      encoded_path = os_path.split("/").map { |seg| CGI.escape(seg).gsub("+", "%20") }.join("/")
      uri = URI("https://api.os.uk/#{encoded_path}")
      uri.query = URI.encode_www_form(request.query_parameters.except("os_path").merge("key" => os_maps_api_key))
      uri
    end

    def render_tile_response(response)
      status_code = response.code.to_i
      if status_code == 204
        head :no_content
      else
        render body: response.body, status: status_code,
               content_type: response["Content-Type"] || "application/octet-stream"
      end
    end

    def proxy_get(base_url, params)
      uri = URI(base_url)
      uri.query = URI.encode_www_form(params)

      response = fetch_upstream(uri)
      render(json: response.body, status: response.code.to_i)
    rescue StandardError => e
      Rails.logger.error("[DefraRubyMap] #{action_name} upstream error: #{e.class}: #{e.message}")
      render(json: { error: "upstream service unavailable" }, status: :bad_gateway)
    end

    def fetch_upstream(uri)
      Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                                          open_timeout: 5, read_timeout: 10) do |http|
        http.request(Net::HTTP::Get.new(uri))
      end
    end
  end
end
