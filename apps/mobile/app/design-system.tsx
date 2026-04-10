import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Switch } from 'react-native';

import { ArcGauge, StatGauge } from '@/components/arc-gauge';
import {
  ActionPillButton,
  FieldPanel,
  IconButtonCircle,
  IconCircle,
  InsetPanel,
  SectionCard,
} from '@/components/design-elements';
import { HeaderWithContentScreen } from '@/components/header-with-content-screen';
import { LiquidGlassCard } from '@/components/liquid-glass-card';
import { PremiumButton } from '@/components/premium-button';
import { SignalChip } from '@/components/signal-chip';
import { toast } from '@/lib/toast';
import { Text, TextInput, View } from '@/tw';

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
      {children}
    </Text>
  );
}

export default function DesignSystemScreen() {
  const router = useRouter();
  const [switchOn, setSwitchOn] = useState(false);
  const [inputValue, setInputValue] = useState('');

  return (
    <HeaderWithContentScreen
      title="Design system."
      note="Every primitive in the RZR mobile toolkit — glass cards, panels, pills, chips, buttons, icons, inputs, and typography.">

      {/* ── LiquidGlassCard ── */}
      <LiquidGlassCard className="mt-8 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          LiquidGlassCard
        </Text>
        <Text className="mt-2 text-[14px] leading-6 text-white/56">
          Primary container. Glass morphism on iOS, blur fallback elsewhere.
          Cyan tint by default.
        </Text>
      </LiquidGlassCard>

      {/* ── SectionCard ── */}
      <SectionCard className="mt-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          SectionCard
        </Text>
        <Text className="mt-2 text-[14px] leading-6 text-white/56">
          Convenience wrapper — LiquidGlassCard with standard padding.
        </Text>
      </SectionCard>

      {/* ── InsetPanel tones ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          InsetPanel
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Seven tonal variants for nested containers.
        </Text>

        <View className="gap-2.5">
          {(['default', 'soft', 'glass', 'black-glass', 'elevated', 'accent', 'danger'] as const).map(
            (tone) => (
              <InsetPanel key={tone} tone={tone} padding="sm">
                <Text className="text-[13px] font-semibold text-white/72">{tone}</Text>
              </InsetPanel>
            ),
          )}
        </View>
      </LiquidGlassCard>

      {/* ── SignalChip accents ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          SignalChip
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Status badges in every accent colour.
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {(['cyan', 'violet', 'pink', 'green'] as const).map((accent) => (
            <SignalChip key={accent} label={accent} accent={accent} />
          ))}
        </View>
      </LiquidGlassCard>

      {/* ── ActionPillButton ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          ActionPillButton
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Pill-shaped actions with tone and size variants.
        </Text>

        <SectionLabel>Tones (md)</SectionLabel>
        <View className="gap-2.5">
          <ActionPillButton label="Neutral" icon="ellipse-outline" tone="neutral" />
          <ActionPillButton label="Primary" icon="flash" tone="primary" />
          <ActionPillButton label="Danger" icon="trash" tone="danger" />
        </View>

        <SectionLabel>Sizes (sm)</SectionLabel>
        <View className="mt-3 flex-row flex-wrap gap-2">
          <ActionPillButton label="Small neutral" tone="neutral" size="sm" />
          <ActionPillButton label="Small primary" tone="primary" size="sm" />
          <ActionPillButton label="Small danger" tone="danger" size="sm" />
        </View>
      </LiquidGlassCard>

      {/* ── PremiumButton ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          PremiumButton
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Full-width action buttons with icon support.
        </Text>

        <View className="gap-2.5">
          <PremiumButton label="Primary" icon="flash" />
          <PremiumButton label="Secondary" icon="settings-outline" variant="secondary" />
          <PremiumButton label="Ghost" icon="eye-outline" variant="ghost" />
        </View>
      </LiquidGlassCard>

      {/* ── IconCircle & IconButtonCircle ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          Icon circles
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Decorative (IconCircle) and pressable (IconButtonCircle) variants.
        </Text>

        <SectionLabel>IconCircle — sizes & tones</SectionLabel>
        <View className="flex-row items-center gap-3">
          <IconCircle size="sm" tone="neutral"><Ionicons name="wifi" size={12} color="#f8fbff" /></IconCircle>
          <IconCircle size="md" tone="primary"><Ionicons name="flash" size={16} color="#7cf6ff" /></IconCircle>
          <IconCircle size="lg" tone="danger"><Ionicons name="warning" size={28} color="#ff6a6a" /></IconCircle>
        </View>

        <SectionLabel>IconButtonCircle — pressable</SectionLabel>
        <View className="mt-1 flex-row items-center gap-3">
          <IconButtonCircle icon="add" size="sm" tone="neutral" />
          <IconButtonCircle icon="refresh" size="md" tone="primary" />
          <IconButtonCircle icon="close" size="lg" tone="danger" />
        </View>
      </LiquidGlassCard>

      {/* ── FieldPanel + Inputs ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          FieldPanel + inputs
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Labeled input containers and the shared Switch control.
        </Text>

        <FieldPanel label="Text input">
          <TextInput
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Type something…"
            placeholderTextColor="rgba(255,255,255,0.28)"
            className="text-[15px] text-white"
          />
        </FieldPanel>

        <InsetPanel className="mt-3 flex-row items-center justify-between" padding="md">
          <Text className="text-[15px] font-semibold text-white">Toggle</Text>
          <Switch
            value={switchOn}
            onValueChange={setSwitchOn}
            trackColor={{ false: 'rgba(255,255,255,0.18)', true: 'rgba(124,246,255,0.46)' }}
            thumbColor={switchOn ? '#7cf6ff' : '#f8fbff'}
            ios_backgroundColor="rgba(255,255,255,0.14)"
          />
        </InsetPanel>
      </LiquidGlassCard>

      {/* ── Typography ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          Typography
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Scale, weights, and opacity hierarchy.
        </Text>

        <View className="gap-3">
          <Text className="text-[42px] font-black leading-[42px] tracking-display text-white">Display</Text>
          <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">Heading</Text>
          <Text className="text-[16px] font-semibold text-white">Subheading</Text>
          <Text className="text-[14px] leading-6 text-white/56">Body — default at 56% opacity</Text>
          <Text className="text-[13px] leading-6 text-rzr-cyan">Accent body — cyan</Text>
          <Text className="text-[12px] leading-5 text-white/40">Caption — 40% opacity</Text>
          <Text className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/44">
            Label — uppercase spaced
          </Text>
          <Text className="font-mono text-[12px] text-rzr-green">$ monospace — terminal green</Text>
          <Text className="font-mono text-[12px] text-white/84">monospace — output</Text>
        </View>
      </LiquidGlassCard>

      {/* ── Color palette ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          Colour palette
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Named semantic colours from the design tokens.
        </Text>

        <View className="gap-2">
          {[
            ['rzr-ink', '#050816', 'bg-rzr-ink border border-white/12'],
            ['rzr-ink-soft', '#0b1123', 'bg-rzr-ink-soft border border-white/12'],
            ['rzr-panel', '#10172a', 'bg-rzr-panel border border-white/12'],
            ['rzr-cyan', '#7cf6ff', 'bg-rzr-cyan'],
            ['rzr-cyan-2', '#66d9ff', 'bg-rzr-cyan-2'],
            ['rzr-violet', '#8b7cff', 'bg-rzr-violet'],
            ['rzr-pink', '#ff77d9', 'bg-rzr-pink'],
            ['rzr-green', '#69f0b7', 'bg-rzr-green'],
          ].map(([name, hex, cls]) => (
            <View key={name} className="flex-row items-center gap-3">
              <View className={`h-8 w-8 rounded-micro ${cls}`} />
              <View>
                <Text className="text-[13px] font-semibold text-white">{name}</Text>
                <Text className="text-[11px] text-white/40">{hex}</Text>
              </View>
            </View>
          ))}
        </View>
      </LiquidGlassCard>

      {/* ── Gauges ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          Gauges
        </Text>
        <Text className="mt-2 mb-5 text-[14px] leading-6 text-white/56">
          Animated bar gauges and stat displays for dashboard-style metrics.
        </Text>

        <View className="flex-row flex-wrap justify-around gap-y-5 py-2">
          <ArcGauge label="Sessions" display="29" value={0.58} />
          <ArcGauge label="Tunnels" display="3/10" value={0.3} color="#8b7cff" />
          <ArcGauge label="Usage" display="87%" value={0.87} color="#ff77d9" />
          <ArcGauge label="Health" display="100%" value={1} color="#69f0b7" />
        </View>

        <View className="mt-4 gap-3">
          <StatGauge label="Plan" display="PRO" color="#7cf6ff" />
          <StatGauge label="Region" display="us-east-1" />
        </View>
      </LiquidGlassCard>

      {/* ── Broken link (triggers 404) ── */}
      <LiquidGlassCard className="mt-5 px-5 py-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          404 test
        </Text>
        <Text className="mt-2 mb-4 text-[14px] leading-6 text-white/56">
          Navigate to a route that doesn't exist.
        </Text>
        <ActionPillButton
          label="Visit /nowhere"
          icon="skull-outline"
          tone="danger"
          onPress={() => router.push('/nowhere' as any)}
        />
      </LiquidGlassCard>

      {/* ── Toasts ── */}
      <SectionCard className="mt-5">
        <Text className="text-[22px] font-semibold tracking-[-0.04em] text-white">
          Toasts
        </Text>
        <Text className="mt-2 text-[14px] leading-6 text-white/56">
          sonner-native wrapped via <Text className="font-mono text-rzr-cyan">@/lib/toast</Text>.
          Default duration + bottom placement baked in.
        </Text>
        <View className="mt-4 flex-row flex-wrap gap-3">
          <PremiumButton
            label="Default"
            icon="chatbox-outline"
            onPress={() => toast('Session saved')}
          />
          <PremiumButton
            label="Success"
            icon="checkmark-circle-outline"
            onPress={() => toast.success('Connected to bridge')}
          />
          <PremiumButton
            label="Error"
            icon="alert-circle-outline"
            variant="secondary"
            onPress={() => toast.error('Tunnel dropped', { description: 'Reconnecting…' })}
          />
          <PremiumButton
            label="Info"
            icon="information-circle-outline"
            variant="ghost"
            onPress={() => toast.info('3 claimed sessions synced')}
          />
          <PremiumButton
            label="Promise"
            icon="hourglass-outline"
            variant="ghost"
            onPress={() =>
              toast.promise(
                new Promise((resolve) => setTimeout(() => resolve('done'), 1500)),
                {
                  loading: 'Uploading snapshot…',
                  success: 'Upload complete',
                  error: 'Upload failed',
                },
              )
            }
          />
        </View>
      </SectionCard>

      {/* ── Close ── */}
      <View className="mt-8 items-center">
        <ActionPillButton
          label="Close"
          icon="close"
          tone="neutral"
          onPress={() => router.back()}
        />
      </View>
    </HeaderWithContentScreen>
  );
}
