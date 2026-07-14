# frozen_string_literal: true

require "spec_helper"

ENV["RAILS_ENV"] ||= "test"

require_relative "dummy/config/environment"
require "rspec/rails"
require "webmock/rspec"

RSpec.configure do |config|
  config.infer_spec_type_from_file_location!
  config.filter_rails_from_backtrace!

  # The engine reads a single process-global configuration object; make each
  # example set its own key and restore the previous value afterwards.
  config.around do |example|
    previous_key = DefraRubyMap.configuration.os_maps_api_key
    example.run
    DefraRubyMap.configuration.os_maps_api_key = previous_key
  end
end
