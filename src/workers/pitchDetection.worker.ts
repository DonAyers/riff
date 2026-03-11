import type { NoteEventTime } from "@spotify/basic-pitch";

import { loadBundledGraphModel } from "./basicPitchModel";

interface DetectRequest {
  type: "detect";
  requestId: number;
  audio: Float32Array;
  confidenceThreshold?: number;
  onsetThreshold?: number;
  maxPolyphony?: number;
}

interface PreloadRequest {
  type: "preload";
  requestId: number;
}

interface ProgressResponse {
  type: "progress";
  requestId: number;
  progress: number;
}

interface ResultResponse {
  type: "result";
  requestId: number;
  audioBuffer: ArrayBuffer;
  notes: NoteEventTime[];
}

interface ErrorResponse {
  type: "error";
  requestId: number;
  error: string;
  audioBuffer?: ArrayBuffer;
}

interface PreloadCompleteResponse {
  type: "preloadComplete";
  requestId: number;
}

type WorkerRequest = DetectRequest | PreloadRequest;
const MODEL_MANIFEST_URL = new URL("@spotify/basic-pitch/model/model.json", import.meta.url).href;
const MODEL_WEIGHT_URLS = [
  new URL("@spotify/basic-pitch/model/group1-shard1of1.bin", import.meta.url).href,
];

type BasicPitchModule = typeof import("@spotify/basic-pitch");
type BasicPitchModelPromise = Exclude<ConstructorParameters<BasicPitchModule["BasicPitch"]>[0], string>;

let basicPitchModule: BasicPitchModule | null = null;
let modelInstance: InstanceType<BasicPitchModule["BasicPitch"]> | null = null;
let graphModelPromise: BasicPitchModelPromise | null = null;

const loadBasicPitchModule = async (): Promise<BasicPitchModule> => {
  if (basicPitchModule) {
    return basicPitchModule;
  }

  // Some TF.js/Bundled browser code paths still assume a window-like global.
  // Mirror worker global aliases before importing Basic Pitch.
  const workerGlobal = globalThis as Record<string, unknown>;
  if (!("window" in workerGlobal)) {
    workerGlobal.window = globalThis;
  }
  if (!("global" in workerGlobal)) {
    workerGlobal.global = globalThis;
  }

  basicPitchModule = await import("@spotify/basic-pitch");
  return basicPitchModule;
};

const getGraphModel = (): BasicPitchModelPromise => {
  if (!graphModelPromise) {
    graphModelPromise = loadBundledGraphModel({
      manifestUrl: MODEL_MANIFEST_URL,
      weightUrls: MODEL_WEIGHT_URLS,
    }) as unknown as BasicPitchModelPromise;
  }

  return graphModelPromise;
};

const getModel = async (): Promise<InstanceType<BasicPitchModule["BasicPitch"]>> => {
  const module = await loadBasicPitchModule();

  if (modelInstance) {
    return modelInstance;
  }

  modelInstance = new module.BasicPitch(getGraphModel());
  return modelInstance;
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "preload") {
    try {
      await loadBasicPitchModule();
      await getModel();
      const response: PreloadCompleteResponse = { type: "preloadComplete", requestId: message.requestId };
      self.postMessage(response);
    } catch (error) {
      const resp: ErrorResponse = {
        type: "error",
        requestId: message.requestId,
        error: error instanceof Error ? error.message : "Failed to preload model",
      }
      self.postMessage(resp);
    }
    return;
  }

  if (message.type !== "detect") {
    return;
  }

  const { requestId, audio, confidenceThreshold = 0.5, onsetThreshold = 0.3, maxPolyphony = 5 } = message;

  try {
    const module = await loadBasicPitchModule();
    const model = await getModel();

    const frames: number[][] = [];
    const onsets: number[][] = [];
    const contours: number[][] = [];

    await model.evaluateModel(
      audio,
      (f: number[][], o: number[][], c: number[][]) => {
        frames.push(...f);
        onsets.push(...o);
        contours.push(...c);
      },
      (progress: number) => {
        const progressMessage: ProgressResponse = {
          type: "progress",
          requestId,
          progress: Math.round(progress * 100),
        };
        self.postMessage(progressMessage);
      }
    );

    const noteEvents = module.outputToNotesPoly(frames, onsets, confidenceThreshold, onsetThreshold, maxPolyphony);
    const timedNotes = module.noteFramesToTime(noteEvents);

    const result: ResultResponse = {
      type: "result",
      requestId,
      audioBuffer: audio.buffer as ArrayBuffer,
      notes: timedNotes,
    };
    (self as any).postMessage(result, { transfer: [audio.buffer] });
  } catch (error) {
    const failure: ErrorResponse = {
      type: "error",
      requestId,
      error: error instanceof Error ? error.message : "Pitch detection failed",
      audioBuffer: audio.buffer as ArrayBuffer,
    };
    (self as any).postMessage(failure, { transfer: [audio.buffer] });
  }
};

export {};
