import * as tf from "@tensorflow/tfjs";

interface WeightsManifestGroup {
  paths: string[];
  weights: tf.io.WeightsManifestEntry[];
}

interface GraphModelManifest {
  modelTopology: object;
  weightsManifest: WeightsManifestGroup[];
}

const concatArrayBuffers = (buffers: ArrayBuffer[]): ArrayBuffer => {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const merged = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return merged.buffer;
};

const getWeightSpecs = (manifest: GraphModelManifest): tf.io.WeightsManifestEntry[] =>
  manifest.weightsManifest.flatMap((group) => group.weights);

interface LoadBundledGraphModelOptions {
  manifestUrl: string;
  weightUrls: string[];
  fetchImpl?: typeof fetch;
  fromMemoryImpl?: typeof tf.io.fromMemory;
  loadGraphModelImpl?: typeof tf.loadGraphModel;
}

export const loadBundledGraphModel = async ({
  manifestUrl,
  weightUrls,
  fetchImpl = fetch,
  fromMemoryImpl = tf.io.fromMemory,
  loadGraphModelImpl = tf.loadGraphModel,
}: LoadBundledGraphModelOptions): Promise<tf.GraphModel> => {
  const response = await fetchImpl(manifestUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model manifest: ${response.status}`);
  }

  const manifest = (await response.json()) as GraphModelManifest;
  const weightResponses = await Promise.all(
    weightUrls.map(async (weightUrl) => {
      const weightResponse = await fetchImpl(weightUrl);

      if (!weightResponse.ok) {
        throw new Error(`Failed to load model weights: ${weightResponse.status}`);
      }

      return weightResponse.arrayBuffer();
    })
  );

  const weightSpecs = getWeightSpecs(manifest);
  const weightData = concatArrayBuffers(await Promise.all(weightResponses));
  const ioHandler = fromMemoryImpl(manifest.modelTopology, weightSpecs, weightData);

  return loadGraphModelImpl(ioHandler);
};