import { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumBackdrop } from '@/components/premium-backdrop';

type ClerkAuthMode = 'sign-in' | 'sign-up';
type ClerkAuthStage = 'request' | 'verify';

type ClerkAuthShellProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  mode: ClerkAuthMode;
  stage: ClerkAuthStage;
  statusLabel?: string;
}>;

const layoutTransition = LinearTransition.springify().damping(18).stiffness(180);

export function ClerkAuthShell({
  title,
  subtitle,
  mode,
  stage,
  statusLabel,
  children,
}: ClerkAuthShellProps) {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <PremiumBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}>
          <Animated.View entering={FadeIn.duration(280)} layout={layoutTransition} style={styles.frame}>
            <Animated.View entering={FadeInDown.duration(320)} style={styles.heroBlock}>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrowBadge}>
                  <Text selectable style={styles.eyebrowBadgeText}>
                    {stage === 'verify' ? 'Email code sent' : 'Passwordless native auth'}
                  </Text>
                </View>
                <Text selectable style={styles.eyebrowMeta}>
                  Expo native
                </Text>
              </View>

              <Text selectable style={styles.heroTitle}>
                {title}
              </Text>
              <Text selectable style={styles.heroSubtitle}>
                {subtitle}
              </Text>
              {statusLabel ? (
                <View style={styles.statusPill}>
                  <Text selectable numberOfLines={1} style={styles.statusPillText}>
                    {statusLabel}
                  </Text>
                </View>
              ) : null}
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(340).delay(40)} layout={layoutTransition}>
              <LiquidGlassCard style={styles.card} tintColor="rgba(124,246,255,0.12)">
                <View style={styles.segmentedControl}>
                  <ModeButton
                    label="Sign in"
                    active={mode === 'sign-in'}
                    onPress={() => {
                      if (mode !== 'sign-in') {
                        router.replace('/(auth)/sign-in');
                      }
                    }}
                  />
                  <ModeButton
                    label="Sign up"
                    active={mode === 'sign-up'}
                    onPress={() => {
                      if (mode !== 'sign-up') {
                        router.replace('/(auth)/sign-up');
                      }
                    }}
                  />
                </View>

                <View style={styles.progressRow}>
                  <View style={[styles.progressTrack, styles.progressTrackActive]} />
                  <View
                    style={[
                      styles.progressTrack,
                      stage === 'verify' ? styles.progressTrackActive : null,
                    ]}
                  />
                </View>

                <Animated.View layout={layoutTransition} style={styles.content}>
                  {children}
                </Animated.View>

                <Text selectable style={styles.footerText}>
                  Tokens stay on-device and encrypted. Finish sign-up once, then use the same email to
                  sign back in.
                </Text>
              </LiquidGlassCard>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.modeButton, active && styles.modeButtonActive, pressed && styles.modeButtonPressed]}>
      <Text selectable style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050816',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  frame: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    gap: 18,
  },
  heroBlock: {
    gap: 10,
    paddingHorizontal: 6,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrowBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(124,246,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124,246,255,0.24)',
  },
  eyebrowBadgeText: {
    color: '#b6fbff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  eyebrowMeta: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  heroTitle: {
    color: '#f8fbff',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 16,
    lineHeight: 24,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  },
  statusPillText: {
    color: '#d7fafe',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 30,
    borderCurve: 'continuous',
    padding: 18,
    gap: 16,
    boxShadow: '0 16px 60px rgba(1, 8, 24, 0.35)',
  },
  segmentedControl: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButtonActive: {
    backgroundColor: 'rgba(124,246,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(124,246,255,0.22)',
  },
  modeButtonPressed: {
    opacity: 0.82,
  },
  modeButtonText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 15,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#e6fdff',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressTrackActive: {
    backgroundColor: '#7cf6ff',
  },
  content: {
    gap: 14,
  },
  footerText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    lineHeight: 18,
  },
});
