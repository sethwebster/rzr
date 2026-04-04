import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useAnimatedKeyboard,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ActivityIndicator, Pressable, Text, View, SafeAreaView } from '@/tw';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { GlassSafeAreaView } from '@/components/glass-safe-area-view';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { RadialMenu, type RadialMenuHandle } from '@/components/radial-menu';
import { SignalChip } from '@/components/signal-chip';
import { ComposerV2 } from '@/components/composer-v2';
import { useHideTabBar } from '@/hooks/use-hide-tab-bar';
import { useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useTerminalApi } from '@/hooks/use-terminal-api';
import { accentClasses, createSessionId } from '@/lib/utils';
import { useSession } from '@/providers/session-provider';

const COMPOSER_DETENTS = [120, 240, 420] as const;

function snapToNearest(value: number, points: readonly number[]) {
  'worklet';

  let nearest = points[0] ?? value;
  let minDistance = Math.abs(value - nearest);

  for (const point of points) {
    const distance = Math.abs(value - point);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = point;
    }
  }

  return nearest;
}

function snapToDetent(value: number, velocityY: number, points: readonly number[]) {
  'worklet';

  if (!points.length) return value;

  if (Math.abs(velocityY) < 900) {
    return snapToNearest(value, points);
  }

  if (velocityY < 0) {
    for (const point of points) {
      if (point > value + 8) return point;
    }
    return points[points.length - 1] ?? value;
  }

  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i];
    if (point != null && point < value - 8) return point;
  }

  return points[0] ?? value;
}

function isChromelessView(urlValue: string) {
  try {
    const url = new URL(urlValue);
    const value =
      url.searchParams.get('chrome') ??
      url.searchParams.get('ui') ??
      url.searchParams.get('view') ??
      '';
    const normalized = value.toLowerCase();

    return (
      normalized === '0' ||
      normalized === 'false' ||
      normalized === 'off' ||
      normalized === 'minimal' ||
      normalized === 'screen' ||
      normalized === 'observe' ||
      url.searchParams.get('nochrome') === '1'
    );
  } catch {
    return false;
  }
}

export default function TerminalScreen() {
  const { activeSession, clearActiveSession, removeSession } = useSession();
  const [webKey, setWebKey] = useState(0);
  const keyboardVisible = useKeyboardVisible();
  const radialMenuRef = useRef<RadialMenuHandle>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { pressKey } = useTerminalApi(activeSession?.url ?? '');
  const headerPullY = useSharedValue(0);
  const composerSheetHeight = useSharedValue<number>(COMPOSER_DETENTS[1]);
  const composerDragStartHeight = useSharedValue<number>(COMPOSER_DETENTS[1]);

  useHideTabBar(!!activeSession);

  const keyboard = useAnimatedKeyboard();
  const composerAnimStyle = useAnimatedStyle(() => ({
    height: composerSheetHeight.value,
    transform: [{ translateY: -keyboard.height.value }],
  }));
  const headerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerPullY.value }],
  }));

  const dismissToHome = () => {
    clearActiveSession();
    router.replace('/');
  };

  const reloadTerminal = () => {
    setWebKey((current) => current + 1);
  };

  const forgetSession = () => {
    if (!activeSession) return;
    removeSession(activeSession.id);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const headerDismissGesture = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      headerPullY.value = Math.max(0, Math.min(event.translationY, 96));
    })
    .onEnd((event) => {
      const shouldDismiss = event.translationY > 72 || event.velocityY > 900;
      headerPullY.value = withSpring(0, { damping: 18, stiffness: 220 });
      if (shouldDismiss) {
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        runOnJS(dismissToHome)();
      }
    })
    .onFinalize(() => {
      headerPullY.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const composerSheetGesture = Gesture.Pan()
    .activeOffsetY([-4, 4])
    .failOffsetX([-24, 24])
    .onBegin(() => {
      composerDragStartHeight.value = composerSheetHeight.value;
      if (keyboard.height.value > 0) {
        runOnJS(dismissKeyboard)();
      }
    })
    .onUpdate((event) => {
      const min = COMPOSER_DETENTS[0];
      const max = COMPOSER_DETENTS[COMPOSER_DETENTS.length - 1];
      const next = Math.max(min, Math.min(max, composerDragStartHeight.value - event.translationY));
      composerSheetHeight.value = next;
    })
    .onEnd((event) => {
      const projected = composerSheetHeight.value + -event.velocityY * 0.08;
      const next = snapToDetent(projected, event.velocityY, COMPOSER_DETENTS);
      composerSheetHeight.value = withTiming(next, { duration: 180 });
    });

  if (!activeSession) {
    return (
      <View className="flex-1 bg-rzr-ink">
        <PremiumBackdrop />
        <SafeAreaView edges={['top']} className="flex-1 px-6 pt-4">
          <SignalChip label="No active session" className="self-start" />
          <View className="mt-10 gap-4">
            <Text className="text-[42px] font-black leading-[42px] tracking-display text-white">
              {'Terminal\nwaiting.'}
            </Text>
            <Text className="max-w-[280px] text-[16px] leading-7 text-white/58">
              Open a bridge from the home tab or fire a deep link into the app and we&apos;ll
              drop it here instantly.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const palette = accentClasses(activeSession.accent);
  const headerHeight = insets.top + 80;
  const composerReservedHeight = COMPOSER_DETENTS[COMPOSER_DETENTS.length - 1];
  const chromelessView = isChromelessView(activeSession.url);
  const webviewUrl =
    activeSession.url + (activeSession.url.includes('?') ? '&' : '?') + 'chrome=0';
  const terminalInstanceKey = `${activeSession.id}:${activeSession.lastConnectedAt}:${webKey}`;
  const radialEnabled = !chromelessView;

  const injectedCSS = `
    html,body{
      background:#050816!important;
      width:100%!important;
      max-width:100%!important;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
      touch-action:pan-y!important;
      -webkit-user-select:none!important;
      user-select:none!important;
      -webkit-touch-callout:none!important;
    }
    *{
      -webkit-user-select:none!important;
      user-select:none!important;
      -webkit-touch-callout:none!important;
      caret-color:transparent!important;
    }
    .screen{
      padding-top:${headerHeight}px!important;
      padding-bottom:${composerReservedHeight}px!important;
      width:100%!important;
      max-width:100%!important;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
    }
    body>*{
      max-width:100%!important;
    }
  `;
  const injectedBeforeLoad = `
    (function(){
      var css=${JSON.stringify(injectedCSS)};
      var s=document.createElement('style');
      s.textContent=css;
      document.documentElement.appendChild(s);

      var lockX=function(){
        if(window.scrollX!==0){
          window.scrollTo(0, window.scrollY || 0);
        }
        if(document.documentElement){
          document.documentElement.style.overflowX='hidden';
        }
        if(document.body){
          document.body.style.overflowX='hidden';
        }
      };

      var touchStartX=0;
      var touchStartY=0;
      var radialTouchId=null;
      var radialStartX=0;
      var radialStartY=0;
      var radialLastX=0;
      var radialLastY=0;
      var radialActivated=false;
      var radialTimer=null;
      var radialLockedScrollY=0;
      var RADIAL_HOLD_MS=520;
      var RADIAL_SCROLL_ESCAPE_SLOP=22;

      var postRadial=function(type,x,y){
        if(!${JSON.stringify(radialEnabled)} || !window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          __rzrRadial:true,
          type:type,
          x:x,
          y:y
        }));
      };

      var clearRadial=function(){
        if(radialTimer){
          clearTimeout(radialTimer);
          radialTimer=null;
        }
      };

      var lockRadialScroll=function(){
        if(window.scrollY!==radialLockedScrollY){
          window.scrollTo(0, radialLockedScrollY);
        }
        lockX();
      };

      var resetRadial=function(){
        clearRadial();
        radialTouchId=null;
        radialActivated=false;
      };

      var swallowTextInteraction=function(e){
        var target=e.target;
        if(target && (
          target.tagName==='INPUT' ||
          target.tagName==='TEXTAREA' ||
          target.isContentEditable
        )){
          return;
        }
        e.preventDefault();
      };

      var findTouchById=function(touches,id){
        if(id===null || !touches) return null;
        for(var i=0;i<touches.length;i+=1){
          if(touches[i].identifier===id){
            return touches[i];
          }
        }
        return null;
      };

      window.addEventListener('scroll', lockX, { passive: true });
      window.addEventListener('scroll', function(){
        if(radialTouchId!==null || radialActivated){
          lockRadialScroll();
        }
      }, { passive: true });
      document.addEventListener('selectstart', swallowTextInteraction, { passive: false });
      document.addEventListener('contextmenu', swallowTextInteraction, { passive: false });
      document.addEventListener('dblclick', swallowTextInteraction, { passive: false });
      window.addEventListener('touchstart', function(e){
        if(!e.touches || !e.touches.length) return;
        touchStartX=e.touches[0].clientX;
        touchStartY=e.touches[0].clientY;

        if(!${JSON.stringify(radialEnabled)}) return;
        if(e.touches.length!==1 || radialTouchId!==null) return;

        radialTouchId=e.touches[0].identifier;
        radialStartX=e.touches[0].clientX;
        radialStartY=e.touches[0].clientY;
        radialLastX=radialStartX;
        radialLastY=radialStartY;
        radialLockedScrollY=window.scrollY || 0;
        radialActivated=false;
        postRadial('hold-start', radialStartX, radialStartY);
        radialTimer=setTimeout(function(){
          if(radialTouchId===null) return;
          radialActivated=true;
          lockRadialScroll();
          postRadial('activate', radialLastX, radialLastY);
        }, RADIAL_HOLD_MS);
      }, { passive: true });
      window.addEventListener('touchmove', function(e){
        if(!e.touches || !e.touches.length) return;
        var dx=Math.abs(e.touches[0].clientX-touchStartX);
        var dy=Math.abs(e.touches[0].clientY-touchStartY);
        if(dx>dy){
          e.preventDefault();
          lockX();
        }

        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.touches, radialTouchId);
        if(!trackedTouch) return;

        radialLastX=trackedTouch.clientX;
        radialLastY=trackedTouch.clientY;

        var radialDx=trackedTouch.clientX-radialStartX;
        var radialDy=trackedTouch.clientY-radialStartY;
        var radialDistance=Math.sqrt(radialDx*radialDx + radialDy*radialDy);

        if(!radialActivated){
          if(radialDistance>RADIAL_SCROLL_ESCAPE_SLOP){
            postRadial('cancel', trackedTouch.clientX, trackedTouch.clientY);
            resetRadial();
            return;
          }
          e.preventDefault();
          lockRadialScroll();
          postRadial('hold-move', trackedTouch.clientX, trackedTouch.clientY);
          return;
        }

        e.preventDefault();
        postRadial('move', trackedTouch.clientX, trackedTouch.clientY);
        lockRadialScroll();
      }, { passive: false });

      window.addEventListener('touchend', function(e){
        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.changedTouches, radialTouchId);
        if(!trackedTouch && radialTouchId===null) return;
        var releaseX=trackedTouch ? trackedTouch.clientX : radialLastX;
        var releaseY=trackedTouch ? trackedTouch.clientY : radialLastY;

        if(radialActivated){
          postRadial('release', releaseX, releaseY);
        }else{
          postRadial('cancel', releaseX, releaseY);
        }
        resetRadial();
      }, { passive: true });

      window.addEventListener('touchcancel', function(e){
        if(!${JSON.stringify(radialEnabled)}) return;
        var trackedTouch=findTouchById(e.changedTouches, radialTouchId);
        if(trackedTouch){
          postRadial('cancel', trackedTouch.clientX, trackedTouch.clientY);
        }else if(radialTouchId!==null){
          postRadial('cancel', radialLastX, radialLastY);
        }
        resetRadial();
      }, { passive: false });

      lockX();
    })();
    true;
  `;
  const injectedAfterLoad = `
    (function(){
      var s=document.createElement('style');
      s.textContent=${JSON.stringify(injectedCSS)};
      document.head.appendChild(s);
      document.documentElement.style.overflowX='hidden';
      if(document.body){
        document.body.style.overflowX='hidden';
      }
      if(window.scrollX!==0){
        window.scrollTo(0, window.scrollY || 0);
      }
    })();
    true;
  `;

  const handleWebMessage = (event: WebViewMessageEvent) => {
    let payload: {
      __rzrRadial?: boolean;
      type?: string;
      x?: number;
      y?: number;
    } | null = null;

    try {
      payload = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (!payload?.__rzrRadial || !radialEnabled) return;

    const x = typeof payload.x === 'number' ? payload.x : 0;
    const y = typeof payload.y === 'number' ? payload.y : 0;

    switch (payload.type) {
      case 'hold-start':
        radialMenuRef.current?.beginHold(x, y);
        break;
      case 'hold-move':
      case 'move':
        radialMenuRef.current?.movePointer(x, y);
        break;
      case 'activate':
        radialMenuRef.current?.activateMenu(x, y);
        break;
      case 'release':
        radialMenuRef.current?.releasePointer();
        break;
      case 'cancel':
        radialMenuRef.current?.cancel();
        break;
      default:
        break;
    }
  };

  const terminalViewport = (
    <WebView
      key={terminalInstanceKey}
      source={{ uri: webviewUrl }}
      startInLoadingState
      originWhitelist={['*']}
      style={styles.webview}
      bounces={false}
      overScrollMode="never"
      textInteractionEnabled={false}
      keyboardDismissMode="on-drag"
      injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
      injectedJavaScript={injectedAfterLoad}
      onMessage={handleWebMessage}
      renderLoading={() => (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#7cf6ff" />
          <Text style={styles.loadingText}>Syncing the live terminal…</Text>
        </View>
      )}
      onShouldStartLoadWithRequest={(request) => {
        if (request.url.startsWith('rzrmobile://')) {
          Linking.openURL(request.url).catch(() => null);
          return false;
        }
        return true;
      }}
    />
  );

  return (
    <View className="flex-1 bg-rzr-ink">
      {terminalViewport}
      {radialEnabled ? <RadialMenu ref={radialMenuRef} onAction={pressKey} /> : null}

      {keyboardVisible ? (
        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={StyleSheet.absoluteFillObject}
          className="bg-transparent"
        />
      ) : null}

      <GestureDetector gesture={headerDismissGesture}>
        <Animated.View style={headerAnimStyle}>
          <GlassSafeAreaView
            leftSlot={
              <Text className="text-[17px] font-bold tracking-[-0.02em] text-white">
                {activeSession.label}
              </Text>
            }
            rightSlot={
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => Linking.openURL(activeSession.url).catch(() => null)}
                  className="flex-row items-center gap-1.5 rounded-full border border-white/10 bg-white/6 px-2.5 py-1">
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: palette.glow }}
                  />
                  <Text className="text-[10px] font-semibold text-white/52">
                    {createSessionId(activeSession.url).slice(0, 16)}
                  </Text>
                  <Ionicons name="open-outline" size={10} color="rgba(255,255,255,0.36)" />
                </Pressable>
              </View>
            }
          />
        </Animated.View>
      </GestureDetector>

      <Animated.View
        style={[{ position: 'absolute', bottom: 0, left: 0, right: 0 }, composerAnimStyle]}>
        <LiquidGlassCard
          className="mx-0 h-full rounded-t-[20px] rounded-b-none bg-transparent"
          tintColor="rgba(255,255,255,0.03)"
          style={{ borderWidth: 0 }}>
          <View
            className="flex-1 overflow-hidden rounded-t-[20px] rounded-b-none"
            style={{ backgroundColor: "transparent" }}>
            <GestureDetector gesture={composerSheetGesture}>
              <View className="items-center pb-2 pt-3">
                <View className="h-1.5 w-12 rounded-full bg-white/20" />
              </View>
            </GestureDetector>

            <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
              <ComposerV2
                sessionUrl={activeSession.url}
                onReload={reloadTerminal}
                onClear={dismissToHome}
                onForget={forgetSession}
              />
            </View>
          </View>
        </LiquidGlassCard>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: '#050816',
  },
  loadingWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050816',
    gap: 12,
  },
  loadingText: {
    color: 'rgba(248, 251, 255, 0.72)',
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
