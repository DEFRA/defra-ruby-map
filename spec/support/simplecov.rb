# frozen_string_literal: true

require "simplecov"

# The JSON formatter generates coverage/coverage.json, which is what
# SonarCloud reads (see sonar.ruby.coverage.reportPaths in
# sonar-project.properties)
SimpleCov.formatters = [
  SimpleCov::Formatter::HTMLFormatter,
  SimpleCov::Formatter::JSONFormatter
]

SimpleCov.start do
  # Nothing in the spec folder should be included in the coverage report
  skip "/spec/"
  # The version file is simply just that, so we do not feel the need to ensure
  # we have a test for it
  skip "lib/defra_ruby_map/version"
end
