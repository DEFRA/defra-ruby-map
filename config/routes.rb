# frozen_string_literal: true

DefraRubyMap::Engine.routes.draw do
  get "geocode-proxy", to: "proxy#geocode"
  get "nearest-proxy", to: "proxy#nearest"
end
