#!/bin/bash
# Patches expo-widgets to cache JSContext in live activity rendering.
# Without this, each re-render allocates a new JSContext + 132KB JS bundle,
# exceeding the widget extension's 30MB memory limit and crashing on update().

TARGET="node_modules/expo-widgets/ios/Widgets/Utils.swift"

if [ ! -f "$TARGET" ]; then
  exit 0
fi

if grep -q "cachedLiveActivityContext" "$TARGET"; then
  exit 0
fi

sed -i '' 's/^import Foundation$/import Foundation\nimport JavaScriptCore/' "$TARGET"

sed -i '' '/^func getLiveActivityNodes/i\
private var cachedLiveActivityContext: JSContext?\
private var cachedLiveActivityLayout: String?\
' "$TARGET"

sed -i '' '/let propsDict = propsData/,/return \[:\]/{
  /guard let context = createWidgetContext(layout: layout) else {/{
    N
    s/guard let context = createWidgetContext(layout: layout) else {\n    return \[:\]\n  }/let context: JSContext\n  if let cached = cachedLiveActivityContext, cachedLiveActivityLayout == layout {\n    context = cached\n  } else {\n    guard let fresh = createWidgetContext(layout: layout) else {\n      return [:]\n    }\n    cachedLiveActivityContext = fresh\n    cachedLiveActivityLayout = layout\n    context = fresh\n  }/
  }
}' "$TARGET"

echo "[patch-expo-widgets] JSContext cache applied"
