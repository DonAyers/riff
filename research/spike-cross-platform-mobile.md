# Spike: Shipping Riff as an iOS and Android app

Date: 2026-10-07

This is exploratory and commits to nothing. It looks at whether Riff should become an app in the iOS App Store and Google Play, what the options are, and what each one would cost. It is based on the code in this repo and on official docs (Capacitor, Apple, Android, WebKit, Chromium, Expo, Software Mansion). Anything marked **(unverified)** is an inference that needs a check on a real device.

## TL;DR

**Recommendation: wrap the existing app with Capacitor. Do not rewrite it.**

1. **Phase 0: Android, low cost.** Ship the PWA to Google Play as a Trusted Web Activity with Bubblewrap. The code doesn't change. Test the mic on a device first.
2. **Phase 1: both stores via Capacitor.** Wrap the existing Vite build. About 95% of the code and all the Vitest tests carry over. On iOS this is a real gain over the PWA, because the mic permission sticks and recordings can live on a file system the OS doesn't evict.
3. **Phase 2: a native audio plugin, only if it becomes necessary.** Write a small Swift (AVAudioEngine) and Kotlin (Oboe) plugin for the looper's capture and playback, but only if device testing shows WebView latency or background behaviour is a real problem. Hide it behind the existing `useLooper` interface.

**Don't move to React Native, Flutter or fully native.** Each one means rewriting the whole DOM/CSS/SVG UI and the Playwright suite. None of them gives you a ready-made Web Audio-style looper engine. Any serious app on those stacks still ends up writing a native C++, Swift or Kotlin audio core. That is the same work as Phase 2, plus a rewrite.

**Is it worth it?**
- **Yes, if you want people to find Riff in the stores, or want iOS to stop asking for the mic.** Capacitor is cheap and reversible. Phase 1 is roughly 1–2 focused weeks plus App Review time.
- **No, if the goal is lower looper latency or audio that keeps running with the screen locked.** A wrapper doesn't fix those, and the PWA already handles most of what can be handled on the web.
- **Ongoing cost:** $99 a year for the Apple Developer Program, $25 once for Google Play, and a second release pipeline.

## Where Riff stands today

Riff is already a well-tuned mobile web app. Several of the usual gotchas are handled in the code:

- **Mic processing is off.** All three capture paths turn off AEC, noise suppression and AGC: `useAudioRecorder.ts:180`, `useLooper.ts:119`, `useGuitarTuner.ts:51`.
- **Audio session.** The looper sets `navigator.audioSession.type = "play-and-record"` (`useLooper.ts:163`), which stops the iOS silent switch from muting Web Audio.
- **Latency compensation.** The looper compensates for round-trip latency from `baseLatency`, `outputLatency` and the track's `latency`, plus a stored user nudge (`lib/looper.ts:187`).
- **Interruptions.** The tuner handles the iOS `suspended` / `interrupted` states on `visibilitychange` (`useGuitarTuner.ts:270`).
- **Screen stays on.** The tuner and looper both take a Screen Wake Lock.
- **Storage.** Recordings live in OPFS and metadata in IndexedDB. A `StorageEvictionPrompt` already warns iOS Safari users about eviction.

## The iOS PWA limits a native shell would fix

These are the concrete user-facing problems on iOS today, with sources:

| Problem on an iOS home-screen PWA | Source | Fixed by Capacitor? |
|---|---|---|
| The mic prompt comes back on every cold launch | WebKit [215884](https://bugs.webkit.org/show_bug.cgi?id=215884), still reported on iOS 18.5. A WebKit engineer says the fix belongs in Safari's standalone mode | **Yes.** Capacitor's `WebViewDelegationHandler.swift` implements `requestMediaCapturePermissionFor` and always grants, so the user sees only the one-time system prompt (since Capacitor 3.4) |
| Storage can be evicted (7-day ITP rule in Safari tabs; disk pressure) | [webkit.org/blog/14403](https://webkit.org/blog/14403/updates-to-storage-policy/) | **Yes, if** recordings move to `@capacitor/filesystem` (app Documents), which is never evicted. IndexedDB inside a WKWebView can still be reclaimed under disk pressure ([Capacitor storage guide](https://capacitorjs.com/docs/guides/storage)) |
| The mic stops when the app is backgrounded or the screen locks | WebKit [239602](https://bugs.webkit.org/show_bug.cgi?id=239602) | **No.** WKWebView mutes the mic in the background unless you set `UIBackgroundModes: audio`, and even then reports say it drops ([241480](https://bugs.webkit.org/show_bug.cgi?id=241480)). Only native capture fixes this |
| AudioContext reports "running" but is silent after an interruption or after losing focus | WebKit [240646](https://bugs.webkit.org/show_bug.cgi?id=240646), [276016](https://bugs.webkit.org/show_bug.cgi?id=276016) | **No.** It affects Capacitor apps too. Keep the existing resume handling and extend it to the looper and playback |
| Not discoverable in the App Store | – | **Yes** |

On Android, Chrome PWAs are already in good shape: the mic permission persists, Chrome uses the AAudio low-latency driver by default ([Chromium audio_features.cc](https://chromium.googlesource.com/codesearch/chromium/src/+/HEAD/media/audio/audio_features.cc)), and storage is stable. **The case for an Android app is mostly about distribution.**

## Options compared

| | Effort | Code reuse | Fixes iOS mic re-prompt | Background capture | Looper latency | Risk |
|---|---|---|---|---|---|---|
| **Stay PWA** | none | 100% | no | no | WebView-level | – |
| **TWA (Android only)** | ~1 day | 100% | n/a | no | same as Chrome | low. Mic in a TWA is (unverified); test on a device |
| **Capacitor** | ~1–2 weeks | ~95% UI, all Vitest tests, most Playwright tests (they run against the web build) | **yes** | no (iOS), needs a foreground service (Android) | WebView-level | App Review 4.2, low to moderate |
| **Capacitor + native audio plugin** | +3–6 weeks for the looper engine | ~90% | yes | yes | native | you maintain the Swift and Kotlin code |
| **React Native + react-native-audio-api** | rewrite, months | logic only (`lib/`) | yes | yes | close to native (no published numbers) | the library is 0.x with no listed production users. smplr probably won't run on it unchanged (unverified) |
| **Flutter** | rewrite in Dart, months | none | yes | with a custom FFI engine | native, if you build it | no Web Audio-style graph exists; the looper needs a custom native engine |
| **Fully native (Swift + Kotlin)** | two rewrites | none | yes | yes | best | double the code to maintain |

### Why not React Native?

[react-native-audio-api](https://docs.swmansion.com/react-native-audio-api/) (Software Mansion, v0.13.6) is the most interesting option. It mirrors the Web Audio API, so `useLooper`'s scheduling could port almost one to one. It has AudioWorklet-like `WorkletNode`s on the audio thread and mic input through `AudioRecorder`. But:

- **The UI and the tests would be rewritten.** All the CSS, svguitar, the HTML SVG piano roll and the Playwright suite would have to be redone in `react-native-svg` or Skia, tested with Detox or Maestro.
- **The library is pre-1.0.** It publishes no latency figures, and I found no named production apps using it.
- **Expo DOM components (`'use dom'`) don't solve it.** They talk to the native side over an async JSON bridge, and the docs say nothing about getUserMedia or AudioWorklet inside them.

The real precedent is [Tuneo](https://github.com/DonBraulio/tuneo), an open-source Expo tuner. It still needed Swift and Kotlin mic modules and a C++ pitch detector.

### What popular music apps do

- **BandLab and Soundtrap** keep a web app and ship separate native iOS and Android apps.
- **Yousician / GuitarTuna** use a C++ audio core under a Unity/C# UI (from their job listings).
- **NeuralNote**, the Basic Pitch audio plugin with about 2.9k stars, runs the model in C++.

The pattern is consistent: the UI layer varies, but **the audio core is native when latency matters**. That is why the advice is to keep the web UI and add a native core only where it pays off.

## Phase 1 steps (Capacitor 8)

Capacitor 8.5.1 is current (Aug 2026). It needs Node 22+, Xcode 26+, iOS 15+, Android minSdk 24 and target SDK 36. ([docs](https://capacitorjs.com/docs/updating/8-0))

1. **Install and set up the projects.** Run `npm i @capacitor/core @capacitor/ios @capacitor/android` and `npm i -D @capacitor/cli`, then `npx cap init`. Set `webDir: "dist"`, since the docs have no Vite example and this has to be set by hand. Then run `npx cap add ios` and `npx cap add android`. The build loop becomes `npm run build && npx cap sync`.
2. **Keep the default origins.** That means `capacitor://localhost` on iOS and `https://localhost` on Android. **Never add a port to the hostname:** getUserMedia fails silently with one (WebKit [259304](https://bugs.webkit.org/show_bug.cgi?id=259304)). Bundle the build locally and don't use `server.url`. Loading a remote URL is the usual trigger for a 4.2 rejection.
3. **Set up permissions.**
   - **iOS:** add `NSMicrophoneUsageDescription` to `Info.plist`.
   - **Android:** add `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` to the manifest. Capacitor's `BridgeWebChromeClient` maps the WebView's audio request to these runtime permissions.
   - **Both:** add a "mic is blocked, open Settings" screen, because iOS never asks again after a denial.
4. **Skip the service worker in the app.** Gate `vite-plugin-pwa` registration with `Capacitor.isNativePlatform()`. WKWebView service workers need App-Bound Domains anyway, and assets are already bundled.
5. **Move storage.** Put recordings on `@capacitor/filesystem` behind the existing `audioStorage.ts` interface, and keep OPFS for the web. Hide `StorageEvictionPrompt` on native.
6. **Handle audio lifecycle.** On `@capacitor/app`'s `appStateChange`, resume or rebuild the AudioContext. Extend the tuner's interrupted/suspended handling to the looper and to MIDI playback. Keep `navigator.audioSession` (available in WKWebView on iOS 16.4+) and **let one owner control the audio session.** Don't mix WebView audio with a native audio plugin, because they fight over the AVAudioSession category and the Bluetooth route.
7. **Guard ML on older iOS.** Handle `webglcontextlost` in the pitch worker and fall back to the TF.js wasm backend. OffscreenCanvas WebGL in workers only arrived in iOS 17 (unverified), and Capacitor 8 supports iOS 15.
8. **Add native touches that help App Review.** Use haptics on record and tap tempo, the native share sheet for WAV and MIDI export (`@capacitor/share`), and the System Bars plugin for edge-to-edge.
9. **Test.**
   - Vitest stays as is, and Playwright keeps running against the web build. Add Vitest coverage for the new native-platform branches, mocking `@capacitor/core`.
   - The CLAUDE.md "Playwright for every user-visible flow" rule can't cover the native shell, so add a device smoke checklist to `research/`. If it's worth it later, add Maestro.
   - **Measure round-trip latency on real devices** with the looper's own calibration, on at least one iPhone, one Pixel and one budget Android.
10. **Ship.**
    - Do iOS TestFlight first, then App Review. In the review notes, list the native features: on-device ML, mic, offline, file export.
    - Play needs a privacy declaration for mic use. A foreground service, if Riff ever adds one, also needs a written justification.
    - Live updates: Ionic Appflow is closed to new customers (Feb 2025). Use Capgo or Capawesome, or just ship through the stores.

## Hidden gotchas checklist

- iOS hostname with a port breaks getUserMedia ([259304](https://bugs.webkit.org/show_bug.cgi?id=259304)).
- Silent switch mutes Web Audio unless `audioSession.type` is `playback` or `play-and-record` ([264473](https://bugs.webkit.org/show_bug.cgi?id=264473)). Riff sets this for the looper today, but **not for the tuner or MIDI playback** (worth checking).
- Background mic in a WKWebView is unreliable even with `UIBackgroundModes: audio`. Don't promise screen-locked looping without native capture.
- Android background mic needs a `microphone` foreground service, which **must be started while the app is still in the foreground** (Android 14 while-in-use rule) ([docs](https://developer.android.com/develop/background-work/services/fgs/service-types)).
- Android has no runtime API to query latency, and devices vary widely. Only `android.hardware.audio.pro` guarantees ≤20 ms round trip ([docs](https://developer.android.com/ndk/guides/audio/audio-latency)). Keep per-device calibration.
- Reported `outputLatency` values are unreliable across browsers, so measured calibration beats trusting them ([measurements](https://jefftkaufman.substack.com/p/browser-audio-latency)). Safari added `outputLatency` in 18.4, so the "Safari has no outputLatency" comment in `lib/looper.ts` is stale for current iOS.
- Wake Lock in home-screen web apps only works from iOS 18.4 ([254545](https://bugs.webkit.org/show_bug.cgi?id=254545)). It works in WKWebView, and Capacitor can also use a native keep-awake plugin.
- `capacitor-voice-recorder` and `@capgo/native-audio` are not substitutes. The first returns AAC only after you stop; the second has no sample-accurate scheduling. No maintained Capacitor plugin does low-latency duplex PCM, so Phase 2 would be a custom plugin.

## If Phase 2 is ever needed

These are the triggers, any one of which justifies it:
- Device testing shows looper round-trip latency that calibration can't hide.
- Users ask for screen-locked looping or recording.
- App Review rejects under 4.2 despite the native touches.

The shape it would take:
- A Capacitor plugin with `start`, `stop`, `arm(track, atFrame)` and `loadTrack(buffer)`, implemented with AVAudioEngine (`AVAudioSourceNode`/`AVAudioSinkNode`, `.playAndRecord`, `setPreferredIOBufferDuration(0.005)`, `.measurement` mode) and Oboe (AAudio, `VOICE_RECOGNITION` input preset).
- The pure looper maths in `lib/looper.ts` stays in TS, and `useLooper` picks the engine.
- Basic Pitch can stay in TF.js, because it runs offline after recording. The `basic-pitch` Python package also ships `nmp.tflite`, `nmp.onnx` and `nmp.mlpackage` (CoreML) if native inference is ever wanted. The note post-processing would still be the existing TS code.

## Sources

The main sources are linked inline. Capacitor: [getting started](https://capacitorjs.com/docs/getting-started), [config](https://capacitorjs.com/docs/config), [storage](https://capacitorjs.com/docs/guides/storage). Apple: [App Review Guidelines 4.2](https://developer.apple.com/app-store/review/guidelines/), [setPreferredIOBufferDuration](https://developer.apple.com/documentation/avfaudio/avaudiosession/setpreferrediobufferduration(_:)). Android: [TWA overview](https://developer.chrome.com/docs/android/trusted-web-activity/overview), [Oboe](https://github.com/google/oboe). WebKit: [Safari 18.4 notes](https://developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes). Basic Pitch: [spotify/basic-pitch](https://github.com/spotify/basic-pitch).
