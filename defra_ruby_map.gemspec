# frozen_string_literal: true

$LOAD_PATH.push File.expand_path("lib", __dir__)
require "defra_ruby_map/version"

Gem::Specification.new do |s|
  s.name        = "defra_ruby_map"
  s.version     = DefraRubyMap::VERSION
  s.authors     = ["Defra"]
  s.email       = ["leonid.brujev@environment-agency.gov.uk"]
  s.homepage    = "https://github.com/DEFRA/defra-ruby-map"
  s.summary     = "DEFRA Interactive Map component for Rails engines."
  s.description = "Provides vendored assets for the DEFRA Interactive Map component, " \
                  "including MapLibre provider, search and interact plugins, " \
                  "proj4js coordinate conversion, and an OS grid reference converter."
  s.license     = "The Open Government Licence (OGL) Version 3"

  s.metadata["rubygems_mfa_required"] = "true"

  s.files = Dir["{app,lib,vendor}/**/*", "LICENSE", "Rakefile", "README.md"]
  s.required_ruby_version = ">= 3.2"

  s.add_dependency "rails", ">= 7.0"
end
