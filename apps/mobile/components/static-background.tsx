import { Canvas, Fill, Shader, Skia, useClock } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

const source = Skia.RuntimeEffect.Make(`
uniform float time;
uniform vec2 resolution;
uniform float opacity;

vec4 main(vec2 pos) {
  vec3 ink = vec3(0.0196, 0.0314, 0.0863); // #050816

  float t = floor(time * 24.0);

  // random horizontal wiggle glitch on ~8% of frames
  float glitchSeed = fract(sin(t * 13.7) * 4375.545);
  float glitchOn = step(0.92, glitchSeed);
  float bandY = fract(sin(t * 7.13) * 917.3) * 800.0;
  float bandH = 4.0 + fract(sin(t * 3.91) * 531.7) * 20.0;
  float inBand = step(bandY, pos.y) * step(pos.y, bandY + bandH);
  float shift = (fract(sin(t * 91.1) * 7531.3) - 0.5) * 30.0;
  vec2 p = pos + vec2(shift * inBand * glitchOn, 0.0);

  // grain: randomise per 3x3 block per frame
  vec2 block = floor(p / 1.5);
  float grain = fract(sin(dot(block, vec2(127.1, 311.7)) + t * 43.758) * 43758.5453);

  // scanlines: darken every other 2px row
  float scanline = 1.0 - 0.12 * step(1.0, mod(p.y, 4.0));

  // brighten the glitch band slightly
  float glitchBright = 1.0 + 0.3 * inBand * glitchOn;

  // irregular breathing — layered sines, ±10%
  float breath = 0.9 + 0.1 * (
    sin(time * 1.7) * 0.4 +
    sin(time * 3.1) * 0.35 +
    sin(time * 5.3) * 0.25
  );

  // mix subtle white noise into the ink
  vec3 col = ink + vec3(grain) * opacity * glitchBright * breath;
  col *= scanline;

  return vec4(col, 1.0);
}
`)!;

interface StaticBackgroundProps {
  opacity?: number;
}

export function StaticBackground({ opacity = 0.15 }: StaticBackgroundProps) {
  const clock = useClock();

  const uniforms = useDerivedValue(() => ({
    time: clock.value / 1000,
    resolution: [1, 1] as [number, number],
    opacity,
  }));

  return (
    <Canvas style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Fill>
        <Shader source={source} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}
