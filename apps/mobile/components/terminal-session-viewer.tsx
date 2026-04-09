import * as Linking from "expo-linking";
import { useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type {
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";
import { WebView } from "react-native-webview";

import { buildInjectedScripts } from "@/lib/terminal-injected-js";
import { ActivityIndicator, Text } from "@/tw";

type Props = {
  sessionUrl: string;
  authToken?: string;
  instanceKey?: string;
  mode?: "full" | "preview";
  webViewRef?: RefObject<WebView | null>;
  headerHeight?: number;
  composerReservedHeight?: number;
  radialEnabled?: boolean;
  onLoadEnd?: () => void;
  onError?: () => void;
  onHttpError?: (statusCode: number) => void;
  onTunnelDead?: () => void;
  onMessage?: (event: WebViewMessageEvent) => void;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  textInteractionEnabled?: boolean;
};

const PREVIEW_FILL_SCALE_INJECTION = `
  (function () {
    if (!document.documentElement.classList.contains('preview')) {
      return;
    }

    var VIRTUAL_WIDTH = 430;
    var VIRTUAL_HEIGHT = 932;

    var applyScale = function () {
      var viewportWidth = window.innerWidth || 1;
      var viewportHeight = window.innerHeight || 1;
      var scale = Math.min(viewportWidth / VIRTUAL_WIDTH, viewportHeight / VIRTUAL_HEIGHT);
      var app = document.querySelector('.app');

      document.documentElement.style.background = '#05070c';
      document.body.style.background = '#05070c';
      document.body.style.overflow = 'hidden';
      document.body.style.display = 'flex';
      document.body.style.alignItems = 'center';
      document.body.style.justifyContent = 'center';

      if (!app) {
        return;
      }

      app.style.width = VIRTUAL_WIDTH + 'px';
      app.style.height = VIRTUAL_HEIGHT + 'px';
      app.style.transform = 'scale(' + scale + ')';
      app.style.transformOrigin = 'center center';
      app.style.flex = '0 0 auto';
    };

    document.addEventListener('DOMContentLoaded', applyScale);
    window.addEventListener('resize', applyScale);
    applyScale();
  })();
  true;
`;

function buildViewerUrl(urlValue: string, mode: "full" | "preview") {
  try {
    const url = new URL(urlValue);
    url.searchParams.set("chrome", "0");
    if (mode === "preview") {
      url.searchParams.set("view", "preview");
    }
    return url.toString();
  } catch {
    return urlValue;
  }
}

export function TerminalSessionViewer({
  sessionUrl,
  authToken,
  instanceKey,
  mode = "full",
  webViewRef,
  headerHeight = 0,
  radialEnabled = false,
  onLoadEnd,
  onError,
  onHttpError,
  onTunnelDead,
  onMessage,
  style,
  interactive = true,
  textInteractionEnabled,
}: Props) {
  const internalWebViewRef = useRef<WebView | null>(null);
  const viewerUrl = useMemo(() => {
    try {
      const url = new URL(buildViewerUrl(sessionUrl, mode));
      if (authToken) {
        url.searchParams.set('auth', authToken);
      }
      return url.toString();
    } catch {
      return buildViewerUrl(sessionUrl, mode);
    }
  }, [authToken, mode, sessionUrl]);
  const fullModeScripts = buildInjectedScripts({
    headerHeight,
    radialEnabled,
  });
  const injectedBeforeLoad =
    mode === "full"
      ? fullModeScripts.injectedBeforeLoad
      : PREVIEW_FILL_SCALE_INJECTION;
  const tunnelCheckScript = `
    (function() {
      function check() {
        try {
          var title = (document.title || '').toLowerCase();
          var body = (document.body && document.body.textContent || '').slice(0, 500).toLowerCase();
          var isCfError = title.includes('cloudflare') || title.includes('error') ||
                          body.includes('origin dns error') || body.includes('web server is down') ||
                          body.includes('connection timed out') || body.includes('bad gateway');
          if (isCfError) {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({__rzrTunnelDead: true}));
          }
        } catch(e) {}
      }
      setTimeout(check, 500);
    })();
  `;
  const injectedAfterLoad =
    mode === "full"
      ? fullModeScripts.injectedAfterLoad + tunnelCheckScript
      : PREVIEW_FILL_SCALE_INJECTION;
  const resolvedWebViewRef = webViewRef ?? internalWebViewRef;
  const handleContentProcessDidTerminate = useCallback(() => {
    if (__DEV__)
      console.warn("[rzr-webview] content process terminated; reloading");
    resolvedWebViewRef.current?.reload();
  }, [resolvedWebViewRef]);

  const renderLoading = useCallback(() => (
    <View style={styles.loadingWrap}>
      <ActivityIndicator color="#7cf6ff" />
      {mode === "full" ? (
        <Text style={styles.loadingText}>Syncing the live terminal…</Text>
      ) : null}
    </View>
  ), [mode]);

  const handleShouldStartLoad = useCallback((request: WebViewNavigation) => {
    if (request.url.startsWith("rzrmobile://")) {
      Linking.openURL(request.url).catch(() => null);
      return false;
    }
    return true;
  }, []);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.__rzrTunnelDead) {
        onTunnelDead?.();
        return;
      }
    } catch {
      // not JSON, pass through
    }
    onMessage?.(event);
  }, [onMessage, onTunnelDead]);


  return (
    <WebView
      ref={resolvedWebViewRef}
      key={instanceKey}
      source={{ uri: viewerUrl }}
      startInLoadingState
      originWhitelist={["*"]}
      style={[styles.webview, style]}
      bounces={true}
      overScrollMode="never"
      textInteractionEnabled={textInteractionEnabled ?? interactive}
      injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
      injectedJavaScript={injectedAfterLoad}
      onLoadEnd={onLoadEnd}
      onError={onError ? () => onError() : undefined}
      onHttpError={onHttpError ? (e) => onHttpError(e.nativeEvent.statusCode) : undefined}
      onMessage={handleMessage}
      onContentProcessDidTerminate={handleContentProcessDidTerminate}
      scrollEnabled={mode === "full"}
      cacheEnabled={mode !== "preview"}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustContentInsets={false}
      renderLoading={renderLoading}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      pointerEvents={interactive ? "auto" : "none"}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: "#050816",
    paddingBottom: 180
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#050816",
    gap: 12,
  },
  loadingText: {
    color: "rgba(248, 251, 255, 0.72)",
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
