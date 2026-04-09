Pod::Spec.new do |s|
  s.name           = 'ExpoSwiftTerm'
  s.version        = '0.1.0'
  s.summary        = 'Native SwiftTerm terminal view for Expo'
  s.homepage       = 'https://github.com/sethwebster/expo-swift-term'
  s.license        = 'MIT'
  s.author         = 'Seth Webster'
  s.source         = { git: '' }
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'

  s.source_files   = [
    'ExpoSwiftTermModule.swift',
    'ExpoSwiftTermView.swift',
    'vendor/SwiftTerm/Sources/SwiftTerm/*.swift',
    'vendor/SwiftTerm/Sources/SwiftTerm/Apple/*.swift',
    'vendor/SwiftTerm/Sources/SwiftTerm/Apple/Metal/*.swift',
    'vendor/SwiftTerm/Sources/SwiftTerm/iOS/*.swift',
    'vendor/SwiftTerm/Sources/SwiftTerm/Mac/MacAccessibilityService.swift',
  ]
  s.exclude_files  = [
    'vendor/SwiftTerm/Sources/SwiftTerm/Documentation.docc/**/*',
  ]
  s.resources      = ['vendor/SwiftTerm/Sources/SwiftTerm/Apple/Metal/Shaders.metal']

  s.dependency 'ExpoModulesCore'
end
