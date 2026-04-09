import {
  Canvas,
  Fill,
  Shader,
  Skia,
  useClock,
} from '@shopify/react-native-skia';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const noiseSource = Platform.OS === 'web' ? null : Skia.RuntimeEffect.Make(`
uniform float time;
uniform vec2 resolution;
uniform float opacity;
uniform float vignetteOpacity;

vec4 main(vec2 pos) {
  vec3 ink = vec3(0.0196, 0.0314, 0.0863);
  float steppedTime = floor(time * 18.0);

  float glitchSeed = fract(sin(steppedTime * 13.7) * 4375.545);
  float glitchOn = step(0.92, glitchSeed);
  float bandY = fract(sin(steppedTime * 7.13) * 917.3) * resolution.y;
  float bandH = 4.0 + fract(sin(steppedTime * 3.91) * 531.7) * 20.0;
  float inBand = step(bandY, pos.y) * step(pos.y, bandY + bandH);
  float shift = (fract(sin(steppedTime * 91.1) * 7531.3) - 0.5) * 18.0;
  vec2 p = pos + vec2(shift * inBand * glitchOn, 0.0);

  vec2 block = floor(p / 2.2);
  float grain = fract(sin(dot(block, vec2(127.1, 311.7)) + time * 43.758) * 43758.5453);
  float scanline = 1.0 - 0.10 * step(1.0, mod(p.y, 4.0));
  float breath = 0.92 + 0.08 * (
    sin(time * 1.7) * 0.4 +
    sin(time * 3.1) * 0.35 +
    sin(time * 5.3) * 0.25
  );
  vec2 uv = pos / resolution.xy;
  vec2 vignetteCenter = vec2(0.5, 0.42);
  float dist = distance(uv, vignetteCenter);
  float edge = smoothstep(0.24, 0.92, dist);
  float vignette = 1.0 - edge * (0.82 * vignetteOpacity);

  vec3 col = ink + vec3(grain) * opacity * (1.0 + 0.2 * inBand * glitchOn) * breath;
  col *= scanline;
  col *= vignette;

  return vec4(col, 1.0);
}
`)!;

export function StaticBackground({
  opacity = 0.16,
  vignetteOpacity = 0,
}: {
  opacity?: number;
  vignetteOpacity?: number;
}) {
  const clock = useClock();
  const uniforms = useDerivedValue(() => ({
    time: clock.value / 1000,
    resolution: [SCREEN_W, SCREEN_H] as [number, number],
    opacity,
    vignetteOpacity,
  }));

  if (!noiseSource) return null;

  return (
    <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Fill>
        <Shader source={noiseSource} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
