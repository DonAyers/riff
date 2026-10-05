# Plan: Tuner accuracy, simpler navigation, 4-track looper

Date: 2026-10-05

Decided work for three asks: make the tuner more accurate and readable, simplify the interface, and add a simple multi-track looper. Builds on `spike-tuner-reliability-and-dependency-audit.md`.

## Tuner

### Findings

- The YIN loop in `detectPitchYin` is O(window × lag): about 3 ms per 8192-sample frame on a desktop, run every animation frame. On phones that is a real share of the frame budget, and the 8192 window adds roughly 170 ms of latency.
- pitchy (MIT, the McLeod Pitch Method, computed with an FFT) reaches the same precision at half the window. On synthetic guitar tones with a weak fundamental and 5% noise, both methods stayed under 0.2 cents of error and neither made octave errors. MPM at 4096 samples took about 0.4 ms against 3 ms for YIN at 4096.
- pitchy gotcha: `minVolumeDecibels` converts with `10^(dB/10)`, which is a power ratio, while the input is amplitude. We gate RMS ourselves. pitchy also has no frequency range, so results outside 60 to 720 Hz are dropped.
- The target string was re-picked on every frame, so the target flickered when harmonics briefly won. In-tune feedback used a single ±5 cent threshold with no hysteresis.
- The light theme was broken: the panel was hard-coded dark, which left the stop button invisible.
- `voiceIsolation` is a newer capture constraint. It is turned off only when `getSupportedConstraints()` lists it.
- iOS suspends or interrupts the AudioContext after calls, Siri or a screen lock. The tuner now resumes it on `visibilitychange` and holds a screen wake lock while listening.

### Decisions

- MPM via pitchy on a 4096-sample frame, gated on clarity ≥ 0.9 and RMS ≥ 0.01.
- Per-string hysteresis: a new target must win 3 frames in a row while a note rings. A fresh pluck after 250 ms of silence switches at once.
- In tune means entering at ±3 cents and leaving past ±5. A held reading is dimmed for 1.5 s, not snapped to zero.
- Tap a string to lock it. Octave errors fold onto the locked string.
- Presets: Standard, Drop D, Half step down, DADGAD, Open G and Open D. A4 reference from 430 to 450 Hz. Both saved in localStorage.
- One meter replaces the Bars/Fine/Fluid styles: a big note, "Tune up" / "Tune down" / "In tune", and a needle with colour zones at ±3 and ±15 cents.

## Navigation

- One fixed bottom tab bar (Record, Builder, Tuner, Looper) on every route. It replaces three different header link layouts. On desktop it becomes a floating pill.
- Removed the "Screen 01/02/03" and "Utility" labels and the builder tagline.
- Added `viewport-fit=cover`. Without it, `env(safe-area-inset-*)` is always 0 in iOS Safari, so the existing safe-area padding never applied.

## Looper

### Design

- One AudioContext clock. Track 1 sets the loop length: the time between the two taps, counted in sample frames.
- Each track is one `AudioBuffer` at the context's sample rate, played by an `AudioBufferSourceNode` with `loop = true`. Every track starts with `start(when, offset)`, where the offset is the shared loop position. All buffers are exactly the same length, so they cannot drift.
- Tracks 2 to 4 arm on tap and record exactly one pass from the next loop start, then start looping.
- Capture uses a dedicated AudioWorklet (`looper-capture.worklet.ts`). It batches 2048 frames and stamps each batch with `currentFrame`, so the main thread can cut sample-exact windows. MediaRecorder was avoided because its timing is not sample-accurate and the codec differs per browser.
- Latency: overdub windows are shifted by `baseLatency + outputLatency + track latency`, plus a user "Recording offset" nudge from −100 to +300 ms. Safari has no `outputLatency`, and Bluetooth adds 150 to 250 ms.
- 4 ms edge fades on every take stop clicks at the loop seam.
- The mic is never monitored, which avoids feedback. The UI recommends wired headphones.
- iOS: `navigator.audioSession.type = "play-and-record"` is set when supported, and the AudioContext is created and resumed before any await so the tap still counts as a user gesture.

### Follow-ups (not built)

- Automatic latency calibration: play clicks, record them and cross-correlate.
- Count-in and metronome using a lookahead scheduler.
- Export the mixed loop to WAV with the existing `audioExport.ts`.
- Move the tuner to an AudioWorklet ring buffer if rAF throttling becomes a problem.

## Bug found along the way

`useAudioRecorder` imported its worklet with `?url`. In production that copied the TypeScript source verbatim into the bundle as a `video/mp2t` data URL, so `addModule()` failed and recording silently fell back to `ScriptProcessorNode`. All worklets now use `?worker&url`, which Vite bundles and transpiles. `src/worklets/workletImports.test.ts` guards against this coming back.

## References

- MDN: [AnalyserNode](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode), [AudioBufferSourceNode.start](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start), [AudioContext.outputLatency](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency), [AudioWorkletGlobalScope.currentFrame](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletGlobalScope/currentFrame), [AudioSession.type](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/type), [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- web.dev: [A tale of two clocks](https://web.dev/articles/audio-scheduling)
- Chrome: [Disabling hardware noise suppression](https://developer.chrome.com/blog/disabling-hardware-noise-suppression/)
- pitchy: <https://github.com/ianprime0509/pitchy>; McLeod and Wyvill, "A Smarter Way to Find Pitch"
- Vite: [Web Workers, `?worker&url`](https://vite.dev/guide/features#web-workers)
- WebKit: [Designing websites for iPhone X (`viewport-fit=cover`)](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
