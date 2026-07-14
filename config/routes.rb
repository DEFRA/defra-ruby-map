# frozen_string_literal: true

DefraRubyMap::Engine.routes.draw do
  get "geocode-proxy", to: "proxy#geocode"
  get "nearest-proxy", to: "proxy#nearest"
  get "os-tiles-proxy/*os_path", to: "proxy#os_tiles", format: false
end
