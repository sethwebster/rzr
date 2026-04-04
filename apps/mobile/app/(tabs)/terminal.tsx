import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { ActivityIndicator, Pressable, Text, View, SafeAreaView } from '@/tw';
import { WebView } from 'react-native-webview';

import { GlassSafeAreaView } from '@/components/glass-safe-area-view';
import { PremiumBackdrop } from '@/components/premium-backdrop';
import { SignalChip } from '@/components/signal-chip';
import { TerminalComposer } from '@/components/terminal-composer';
import { useHideTabBar } from '@/hooks/use-hide-tab-bar';
import { accentClasses, createSessionId } from '@/lib/utils';
import { useSession } from '@/providers/session-provider';

export default function TerminalScreen() {
  const { activeSession, clearActiveSession, removeSession } = useSession();
  const [webKey, setWebKey] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useHideTabBar(!!activeSession);

  const keyboard = useAnimatedKeyboard();
  const composerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value }],
  }));

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
  const composerBottom = insets.bottom + 12;
  const composerHeight = 240;
  const terminalInstanceKey = `${activeSession.id}:${activeSession.lastConnectedAt}:${webKey}`;

  const injectedCSS = `
    html,body{
      background:#050816!important;
      width:100%!important;
      max-width:100%!important;
      overflow-x:hidden!important;
      overscroll-behavior-x:none!important;
      touch-action:pan-y!important;
    }
    .screen{
      padding-top:${headerHeight}px!important;
      padding-bottom:${composerHeight}px!important;
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

      window.addEventListener('scroll', lockX, { passive: true });
      window.addEventListener('touchstart', function(e){
        if(!e.touches || !e.touches.length) return;
        touchStartX=e.touches[0].clientX;
        touchStartY=e.touches[0].clientY;
      }, { passive: true });
      window.addEventListener('touchmove', function(e){
        if(!e.touches || !e.touches.length) return;
        var dx=Math.abs(e.touches[0].clientX-touchStartX);
        var dy=Math.abs(e.touches[0].clientY-touchStartY);
        if(dx>dy){
          e.preventDefault();
          lockX();
        }
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

  return (
    <View className="flex-1 bg-rzr-ink">
      <WebView
        key={terminalInstanceKey}
        source={{ uri: activeSession.url + (activeSession.url.includes('?') ? '&' : '?') + 'chrome=0' }}
        startInLoadingState
        originWhitelist={['*']}
        style={styles.webview}
        bounces={false}
        overScrollMode="never"
        keyboardDismissMode="on-drag"
        injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
        injectedJavaScript={injectedAfterLoad}
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

      {keyboardVisible ? (
        <Pressable
          onPress={() => Keyboard.dismiss()}
          style={StyleSheet.absoluteFillObject}
          className="bg-transparent"
        />
      ) : null}

      <GlassSafeAreaView
        leftSlot={
          <Text className="text-[17px] font-bold tracking-[-0.02em] text-white">
            {activeSession.label}
          </Text>
        }
        rightSlot={
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
        }
      />

      <Animated.View
        entering={FadeInDown.duration(320).springify()}
        exiting={FadeOutDown.duration(200)}
        style={[{ position: 'absolute', bottom: composerBottom, left: 16, right: 16 }, composerAnimStyle]}>
        <TerminalComposer
          sessionUrl={activeSession.url}
          onReload={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
            setWebKey((c) => c + 1);
          }}
          onClear={clearActiveSession}
          onForget={() => removeSession(activeSession.id)}
        />
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
