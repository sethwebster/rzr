# Expo Performance Audit Template

> Use this template to run a measured, production-like performance audit for an Expo app. Optimize one proven bottleneck at a time, and re-measure after every change.

## 1. Audit metadata

| Field | Value |
| --- | --- |
| App / package | |
| Repo / branch | |
| Auditor | |
| Date | |
| Expo SDK | |
| React Native version | |
| Target platforms | iOS / Android / Web |
| Build type used for testing | Dev build / Preview / Release / `npx expo start --no-dev --minify` |
| Primary performance goal | |
| Secondary performance goal | |

## 2. Symptoms and success criteria

### User-visible symptoms
- [ ] Slow cold start
- [ ] Slow first usable screen
- [ ] Janky navigation transitions
- [ ] Typing/input lag
- [ ] List / feed scroll jank
- [ ] Slow image loading
- [ ] Large bundle / slow updates
- [ ] Memory growth / crash risk
- [ ] Other:

### Exact flows to audit
1.
2.
3.

### Success criteria
| Metric | Baseline | Target | Notes |
| --- | --- | --- | --- |
| Cold start | | | |
| Time to first usable screen | | | |
| Navigation transition smoothness | | | |
| Scroll smoothness | | | |
| Input responsiveness | | | |
| JS bundle size | | | |
| Memory stability | | | |

## 3. Test matrix

| Device | OS | Build | Priority | Notes |
| --- | --- | --- | --- | --- |
| Real iPhone | | | High | |
| Real Android (mid-range if possible) | | | High | |
| Simulator / emulator | | | Medium | |
| Web browser | | | Optional | |

## 4. Measurement setup

### Ground rules
- Use a production-like build before trusting results.
- Do not optimize based only on normal dev-mode behavior.
- Re-test the same flow on the same device after each meaningful change.

### Recommended tools
- React Native Perf Monitor for JS FPS vs UI FPS
- React DevTools Profiler for rerender hotspots
- Hermes profiling for JS-thread hotspots when deeper traces are needed
- Expo Atlas for bundle composition and oversized dependencies
- Real-device testing for final validation

### Commands and entry points
- Production-ish Metro run: `npx expo start --no-dev --minify`
- Atlas during dev server analysis: `EXPO_ATLAS=true npx expo start`
- Atlas on export: `EXPO_ATLAS=true npx expo export --platform ios,android`
- Open Atlas report: `npx expo-atlas`

> If the app depends on native startup behavior, profile on a preview or release build instead of Expo Go.

## 5. Baseline evidence

### Before any optimization
| Flow / screen | Device | Repro steps | Observed issue | Evidence link / note |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |

### Raw measurements
| Metric | Device | Before | After | Delta | Tool |
| --- | --- | --- | --- | --- | --- |
| Cold start | | | | | |
| First usable screen | | | | | |
| JS FPS | | | | | |
| UI FPS | | | | | |
| Scroll hitch / dropped frames | | | | | |
| Bundle size | | | | | |
| Memory footprint / stability note | | | | | |

## 6. Bottleneck classification

Mark the most likely root cause based on actual evidence.

- [ ] Startup path / eager initialization
- [ ] Unnecessary rerenders
- [ ] Expensive list rows / virtualization issues
- [ ] Heavy images / fonts / video assets
- [ ] Navigation / animation contention
- [ ] Network work on critical path
- [ ] Storage / parsing on critical path
- [ ] Oversized dependency / bundle weight
- [ ] Memory leak / lifecycle retention
- [ ] Native module / platform-specific issue

### Notes
- JS FPS drops usually indicate JS-thread pressure.
- UI FPS drops usually indicate rendering/layout/image/compositing pressure.
- A slow first screen is often startup work, data loading, or oversized assets rather than one isolated component.

## 7. Audit passes

### A. Startup audit
- [ ] Inventory everything that runs before the first useful screen
- [ ] Mark which startup work is truly critical
- [ ] Defer analytics, secondary SDKs, and non-blocking fetches
- [ ] Reduce blocking font and asset loading
- [ ] Remove unused dependencies affecting initial bundle size
- [ ] Verify root layout / app entry is not doing unnecessary work
- [ ] Re-measure cold start and first usable screen

### B. Rerender audit
- [ ] Profile the slow flow with React Profiler
- [ ] Identify parent components causing broad rerenders
- [ ] Move state closer to where it is used
- [ ] Split oversized components
- [ ] Memoize expensive derived values only when profiling justifies it
- [ ] Stabilize callback props passed to memoized children when needed
- [ ] Re-measure input and interaction latency

### C. List / scrolling audit
- [ ] Check every `FlatList` / `SectionList` on slow screens
- [ ] Confirm stable `keyExtractor`
- [ ] Review row render cost
- [ ] Reduce heavy images and effects inside rows
- [ ] Add `getItemLayout` where row sizes are known
- [ ] Paginate or window large datasets
- [ ] Re-measure JS/UI FPS during scroll

### D. Asset audit
- [ ] Compress oversized raster assets
- [ ] Avoid loading images larger than their display size
- [ ] Reduce loaded font variants to the minimum needed
- [ ] Prefer cached image paths where appropriate
- [ ] Replace costly GIF-like media with better formats when possible
- [ ] Re-measure startup and scroll performance on media-heavy screens

### E. Bundle audit
- [ ] Run Expo Atlas and list the biggest modules
- [ ] Remove dead or duplicate dependencies
- [ ] Replace unusually expensive libraries when justified
- [ ] Confirm production minification and tree shaking assumptions
- [ ] Re-measure bundle size and startup after dependency changes

### F. Data-path audit
- [ ] Identify blocking requests on initial render
- [ ] Parallelize independent requests
- [ ] Paginate large payloads
- [ ] Cache safe-to-cache data
- [ ] Move expensive transforms outside render paths
- [ ] Re-measure first usable screen and interaction responsiveness

### G. Memory / lifecycle audit
- [ ] Watch for degradation over time on long sessions
- [ ] Check for leaked listeners, timers, and subscriptions
- [ ] Confirm screens do not retain oversized in-memory data unnecessarily
- [ ] Review image and media caching pressure
- [ ] Re-test on lower-memory devices if possible

## 8. Screen-by-screen audit table

| Screen / flow | Symptom | Tool used | Primary bottleneck | Proposed fix | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |
| | | | | | | |
| | | | | | | |

## 9. Optimization backlog

Prioritize the smallest high-confidence changes first.

| Priority | Change | Expected impact | Effort | Risk | Evidence supporting it | Result |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | | | | | | |
| P1 | | | | | | |
| P2 | | | | | | |

## 10. Verification log

| Change | Verification step | Device / build | Result | Follow-up |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |

## 11. Final summary

### What improved
- 
- 
- 

### What did not help
- 
- 

### Remaining risks
- 
- 

### Recommended next actions
1.
2.
3.

## 12. Guardrails for future regressions
- [ ] Keep bundle analysis snapshots for large dependency changes
- [ ] Re-profile critical screens before major releases
- [ ] Treat performance work as evidence-based, not assumption-based
- [ ] Do not add blanket memoization without proof of benefit
- [ ] Test on at least one real device before declaring performance work complete
