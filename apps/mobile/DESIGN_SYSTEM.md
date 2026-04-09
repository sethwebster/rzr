# Mobile Design System

## Radius scale

The mobile app now uses a semantic radius scale instead of one-off pixel values.

### Tailwind / NativeWind tokens

- `rounded-micro` → `6px`
- `rounded-input` → `16px`
- `rounded-panel` → `10px`
- `rounded-card` → `12px`
- `rounded-hero` → `18px`
- `rounded-full` → pill / circular surfaces

Defined in:

- `apps/mobile/global.css`

### TypeScript tokens

For inline styles and non-className surfaces:

- `radii.micro`
- `radii.input`
- `radii.panel`
- `radii.card`
- `radii.hero`
- `radii.full`

Defined in:

- `apps/mobile/lib/design-system.ts`

## Usage guidance

- Use `micro` for compact previews and tiny inset surfaces.
- Use `input` for fields, upload tiles, and compact interior panels.
- Use `panel` for drawers and dense utility panels.
- Use `card` for primary containers and major app surfaces.
- Use `hero` for large focal cards or stage framing.
- Use `full` for pills, chips, and circles.

## Cleanup intent

This scale replaces the previous mix of `6`, `16`, `18`, `20`, `22`, `24`, `26`, `28`, and `36` pixel radii across the app with a smaller, reusable set. Cards and panels were later tightened by halving the larger surface radii, while pill/button shapes stayed unchanged.
