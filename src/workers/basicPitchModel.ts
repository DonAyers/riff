interface WeightsManifestGroup {
  paths: string[];
  weights: unknown[];
}

interface GraphModelManifest {
  modelTopology: unknown;
  weightsManifest: WeightsManifestGroup[];
  [key: string]: unknown;
}

export const rewriteWeightsManifestPaths = (
  manifest: GraphModelManifest,
  weightUrls: string[]
): GraphModelManifest => {
  let weightIndex = 0;

  return {
    ...manifest,
    weightsManifest: manifest.weightsManifest.map((group) => ({
      ...group,
      paths: group.paths.map(() => {
        const weightUrl = weightUrls[weightIndex];
        weightIndex += 1;

        if (!weightUrl) {
          throw new Error("Missing bundled model weight URL");
        }

        return weightUrl;
      }),
    })),
  };
};

interface CreateBundledModelUrlOptions {
  manifestUrl: string;
  weightUrls: string[];
  fetchImpl?: typeof fetch;
  createObjectUrl?: (object: Blob) => string;
}

export const createBundledModelUrl = async ({
  manifestUrl,
  weightUrls,
  fetchImpl = fetch,
  createObjectUrl = (object) => URL.createObjectURL(object),
}: CreateBundledModelUrlOptions): Promise<string> => {
  const response = await fetchImpl(manifestUrl);

  if (!response.ok) {
    throw new Error(`Failed to load model manifest: ${response.status}`);
  }

  const manifest = (await response.json()) as GraphModelManifest;
  const rewrittenManifest = rewriteWeightsManifestPaths(manifest, weightUrls);
  const blob = new Blob([JSON.stringify(rewrittenManifest)], { type: "application/json" });

  return createObjectUrl(blob);
};