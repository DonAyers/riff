# Spike: Tuner Reliability and Dependency Audit

Date: 2026-05-17

## Question

The dedicated tuner route works, but the G string feels hard to tune. We also see noisy high-severity npm audit output during install. This spike checks whether the live WebAudio tuner is doing anything that makes tuning harder, what is known about this class of pitch detection, and where the npm warnings come from.

## Current Tuner Path

- `useGuitarTuner` uses `getUserMedia()` directly, disables browser audio processing, creates an `AudioContext`, and reads time-domain samples through an `AnalyserNode`.
- `detectPitchYin` runs on a single `Float32Array` frame and maps the estimated pitch to the nearest standard guitar string.
- The recorder path is separate: `useAudioRecorder` captures through `AudioWorklet` where available, stores native-rate PCM, and resamples analysis audio to `ANALYSIS_SAMPLE_RATE` for Basic Pitch.
- The live tuner does not currently share the recorder's AudioWorklet path. That is not inherently wrong, but it means the tuner and recorder have different buffering and scheduling behavior.

## Findings

- Browser pitch detection from a plucked guitar string is prone to octave/harmonic mistakes. This is a known issue for autocorrelation/YIN-style approaches because the loudest or most stable partial can briefly be an overtone rather than the fundamental.
- The G string is a plausible pain point because its octave harmonic is around 392 Hz, within the tuner's search range. If the detector locks onto that octave, naive nearest-string mapping can drift toward the wrong target instead of treating it as G3.
- `AnalyserNode.getFloatTimeDomainData()` is a reasonable browser-native way to read waveform data, and `AnalyserNode.fftSize` controls the frame size available for time-domain analysis.
- `getUserMedia()` constraints should stay non-mandatory where possible. Using `ideal` for mono capture is safer than requiring an exact channel count, because mandatory constraints can reject otherwise usable microphones.
- AudioWorklet is the better long-term primitive for deterministic low-latency audio processing. The recorder already has an AudioWorklet pipeline, so a future tuner can share a small capture utility instead of maintaining two capture styles.

## Changes Made From This Spike

- Increased the tuner analysis frame from `4096` to `8192` samples for more stable period estimation.
- Added `channelCount: { ideal: 1 }` to tuner microphone constraints while keeping echo cancellation, noise suppression, and auto gain disabled.
- Added octave-harmonic folding in `getTuningReading()`: if the detector returns a strong octave harmonic, the tuner can map it back to the matching open string. This is specifically covered by a G-string regression where `391.9954 Hz` maps to `G3`.
- Extended high-string handling for B and high E: the live detector now accepts higher candidate frequencies, and B/E octave harmonics fold down to the matching open string. Ambiguous low-octave high E estimates are not forced upward because that frequency also matches a low-E harmonic.
- Added UI feedback for good tuning: active meter bars turn green and a thumbs-up burst appears when `reading.inTune` is true.
- Added selectable feedback styles so players can choose normal bars, denser bars, or a continuous fluid meter.

## Recommended Next Steps

- If G still jumps in real use, add a debug mode that logs raw estimated frequency, folded target, cents, clarity, and RMS per frame. That will tell us whether the problem is pitch estimation, string mapping, or UI smoothing.
- Consider moving live tuner capture to an AudioWorklet-backed ring buffer. This would align tuner and recorder capture and reduce main-thread timing dependence.
- Consider adding a second pitch candidate method for cross-checking, such as McLeod Pitch Method or harmonic product spectrum, only if the debug data shows repeated octave errors after the harmonic-folding fix.
- Consider per-string hysteresis: once the tuner has confidently chosen a string, keep that target until another string is clearly better for several frames. This can reduce flicker while tuning one string.
- Avoid forcing a single sample rate in `getUserMedia()`. Browser/device support varies, and the app already has reliable resampling where fixed-rate analysis is needed.

## Dependency / Audit Findings

- `npm audit --omit=dev` reported `0 vulnerabilities`; production/runtime dependencies were clean.
- Full `npm audit` initially reported 11 dev/build-tool vulnerabilities.
- The noisy paths were:
  - `vite@7.3.1` and its `postcss` / `picomatch` transitive deps.
  - `jsdom@28.1.0 -> undici@7.22.0`.
  - `vite-plugin-pwa@1.2.0 -> workbox-build@7.4.0`, including Babel, Rollup plugin, lodash, fast-uri, brace-expansion, and serialize-javascript transitives.
- `npm install --dry-run --ignore-scripts` did not show deprecation warnings in this workspace. The visible noise was audit vulnerability output rather than direct runtime package deprecation.
- `npm audit fix` updated the lockfile within existing semver ranges and cleared the audit:
  - `vite` resolved to `7.3.3`.
  - `undici` resolved to `7.25.0`.
  - `workbox-build` resolved to `7.4.1`.
  - affected transitive packages resolved to patched versions.
- After the fix, both `npm audit` and `npm audit --omit=dev` reported `0 vulnerabilities`, and the dry-run install stayed quiet.

## References Checked

- MDN `getUserMedia()` constraints and secure-context behavior: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- MDN `AnalyserNode` time-domain data and `fftSize`: https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
- MDN `AudioWorklet` low-latency processing model: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- General pitch detection notes, including octave errors in guitar tuners: https://en.wikipedia.org/wiki/Pitch_detection_algorithm
- `pitchfinder` notes on browser-compatible pitch detectors and tradeoffs: https://github.com/peterkhayes/pitchfinder