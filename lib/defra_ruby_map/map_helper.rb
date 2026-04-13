# frozen_string_literal: true

module DefraRubyMap
  module MapHelper
    def defra_map_asset_path(file)
      "/defra-ruby-map/#{DefraRubyMap::VERSION}/#{file}"
    end
  end
end
