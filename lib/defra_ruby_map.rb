# frozen_string_literal: true

require "defra_ruby_map/version"
require "defra_ruby_map/configuration"
require "defra_ruby_map/engine"

module DefraRubyMap
  class << self
    attr_writer :configuration

    def configuration
      @configuration ||= Configuration.new
    end
  end

  def self.configure
    yield(configuration)
  end
end
