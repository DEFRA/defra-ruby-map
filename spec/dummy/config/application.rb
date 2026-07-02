# frozen_string_literal: true

require_relative "boot"

require "rails"
require "action_controller/railtie"
require "sprockets/railtie"
require "defra_ruby_map"

module Dummy
  class Application < Rails::Application
    config.load_defaults Rails::VERSION::STRING.to_f
    config.root = File.expand_path("..", __dir__)
    config.eager_load = false
    config.hosts.clear
    config.secret_key_base = "dummy-secret-key-base-for-tests"
    config.logger = ActiveSupport::Logger.new(nil)
    config.log_level = :fatal
  end
end
