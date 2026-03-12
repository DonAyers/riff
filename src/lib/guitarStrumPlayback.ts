import type { MappedNote } from "./noteMapper";

export interface NoteStrumCluster {
  noteIndices: number[];
  startTimeS: number;
  endTimeS: number;
}

function createCluster(
  noteIndices: number[],
  notes: readonly MappedNote[],
): NoteStrumCluster {
  const clusterNotes = noteIndices.map((index) => notes[index]);
  const startTimeS = Math.min(...clusterNotes.map((note) => note.startTimeS));
  const endTimeS = Math.max(
    ...clusterNotes.map((note) => note.startTimeS + note.durationS),
  );

  return { noteIndices, startTimeS, endTimeS };
}

export function buildStrumClusters(
  notes: readonly MappedNote[],
  windowS: number,
): NoteStrumCluster[] {
  if (notes.length === 0) return [];

  if (windowS <= 0) {
    return notes.map((_note, index) =>
      createCluster([index], notes),
    );
  }

  const indexed = notes
    .map((note, index) => ({ note, index }))
    .sort((a, b) => a.note.startTimeS - b.note.startTimeS);

  const clusters: number[][] = [];
  let currentCluster: number[] = [indexed[0].index];
  let clusterAnchorStart = indexed[0].note.startTimeS;

  for (let i = 1; i < indexed.length; i++) {
    const { note, index } = indexed[i];
    if (note.startTimeS - clusterAnchorStart <= windowS) {
      currentCluster.push(index);
    } else {
      clusters.push(currentCluster);
      currentCluster = [index];
      clusterAnchorStart = note.startTimeS;
    }
  }

  clusters.push(currentCluster);

  return clusters.map((indices) => createCluster(indices, notes));
}

export function extendStrumPlaybackDurations(
  notes: readonly MappedNote[],
  baseDurations: readonly number[],
  windowS: number,
): number[] {
  if (notes.length !== baseDurations.length) {
    throw new Error("extendStrumPlaybackDurations requires matching array sizes");
  }

  if (notes.length === 0) return [];

  const playbackDurations = baseDurations.slice();
  if (windowS <= 0) {
    return playbackDurations;
  }

  const clusters = buildStrumClusters(notes, windowS);

  for (const cluster of clusters) {
    if (cluster.noteIndices.length <= 1) continue;

    const targetEnd = Math.max(
      ...cluster.noteIndices.map(
        (index) => notes[index].startTimeS + baseDurations[index],
      ),
    );

    for (const index of cluster.noteIndices) {
      const desiredDuration = targetEnd - notes[index].startTimeS;
      if (desiredDuration > playbackDurations[index]) {
        playbackDurations[index] = desiredDuration;
      }
    }
  }

  return playbackDurations;
}
