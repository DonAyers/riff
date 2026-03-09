# Riff

Record a riff, chord, or arpeggio — see every note you played.

Riff is a browser-based music tool that uses [Spotify's Basic Pitch](https://github.com/spotify/basic-pitch) to perform polyphonic pitch detection entirely client-side. No backend, no account, no data leaves your device.

## How It Works

1. **Tap Record** — the app captures audio from your microphone
2. **Play something** — a chord, a riff, an arpeggio, on any instrument
3. **Tap Stop** — Basic Pitch (a lightweight neural network running via TensorFlow.js) analyzes the audio
4. **See results** — individual notes, chord name, and a piano-roll timeline

```
Mic → Web Audio API → Basic Pitch (TF.js, in-browser) → Notes + Chord Name
```

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript |
| Bundler | Vite |
| Audio capture | Web Audio API |
| Pitch detection | [@spotify/basic-pitch](https://www.npmjs.com/package/@spotify/basic-pitch) (~8 MB model, runs in browser via WebGL) |
| Music theory | [Tonal](https://github.com/tonaljs/tonal) (MIDI → note names, chord detection) |
| Deployment | PWA — installable, works offline on any device with a modern browser |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Production build
npm run build
```

The dev server runs at `http://localhost:3000`. Open it in a browser and allow microphone access when prompted.

## Testing

Riff uses both unit/component tests and browser end-to-end tests.

```bash
# Run Vitest once
npm run test

# Run Vitest in watch mode
npm run test:watch

# Run Vitest with coverage report
npm run test:coverage

# Run Playwright end-to-end tests
npm run test:e2e
```

## Versioning and Releases

Riff now exposes its deployed build identity directly in the app.

- The bottom-right badge shows `v<package-version> · <short-commit-sha>`.
- The same build label is logged to the browser console on startup.
- This makes it easy to verify what is deployed in Vercel production or preview without checking the dashboard first.

### Standard release flow

For a small app like this, the practical standard is:

1. Bump the semantic version.
2. Run tests and a production build.
3. Commit the release change.
4. Create a Git tag like `v1.0.1`.
5. Push `main` and the tag.
6. Let Vercel deploy `main`, and let GitHub create release notes from the tag.

### Commands

```bash
# patch release example
npm version patch

# validate the release candidate
npm run release:check

# push the commit and tag
git push origin main --follow-tags
```

`npm version patch|minor|major` updates `package.json` and `package-lock.json`, creates a release commit, and creates the matching Git tag.

When a tag like `v1.0.1` is pushed, GitHub Actions creates a GitHub Release with generated notes.

## Deploy to Vercel

Riff is a static Vite app, so deployment to Vercel is straightforward.

### Option 1: Vercel Dashboard (recommended first deploy)

1. Push this repo to GitHub.
2. In Vercel, click **Add New... -> Project**.
3. Import `DonAyers/riff`.
4. Confirm build settings:
	- Build Command: `npm run build`
	- Output Directory: `dist`
5. Deploy.

### Option 2: Vercel CLI

```bash
# one-time login
npx vercel login

# preview deployment
npx vercel

# production deployment
npx vercel --prod
```

`vercel.json` is included in this repo to pin the Vite build/output configuration.
It uses `npm install` (not `npm ci`) to avoid cross-version lockfile strictness issues on Vercel.

### Notes for this app

- Microphone access requires a secure origin. Vercel deployments are HTTPS by default, so recording works in production.
- If your app grows into multiple client-side routes, keep SPA fallback behavior in mind.

## Project Structure

```
src/
├── hooks/
│   ├── useAudioRecorder.ts      # Mic recording → Float32Array (22050 Hz mono)
│   └── usePitchDetection.ts     # Float32Array → detected notes via Basic Pitch
├── lib/
│   ├── noteMapper.ts            # MIDI numbers → note names (C4, E4, G4)
│   └── chordDetector.ts         # Pitch class set → chord name via Tonal
├── components/
│   ├── Recorder.tsx             # Record / stop button
│   ├── NoteDisplay.tsx          # Note chips for each detected note
│   ├── ChordDisplay.tsx         # Chord name display
│   ├── PianoRoll.tsx            # Visual note timeline
│   └── ProgressBar.tsx          # Model inference progress bar
├── styles/
│   ├── index.css                # Global reset + dark theme
│   └── App.css                  # App layout
├── App.tsx                      # Root — wires hooks, libs, and components
└── main.tsx                     # Entry point
```

## Browser Support

Works in any modern browser with Web Audio API and WebGL support:
- Chrome / Edge (desktop & Android)
- Firefox
- Safari (iOS 14.5+ / macOS)

> **iOS note:** `AudioContext` must be created from a user gesture (tap). The app handles this — recording starts on button press.

## Future Ideas

- Real-time note display while playing
- Scale / key detection
- Saved riff library
- Guitar tablature output
- Tuner mode
- Tempo / BPM detection
- Capacitor wrapper for native App Store / Play Store distribution

## License

ISC
