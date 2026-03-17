import "./StorageEvictionPrompt.css";

export function StorageEvictionPrompt() {
  return (
    <aside className="storage-eviction-prompt" role="note" aria-label="Export reminder">
      <span className="storage-eviction-prompt__kicker">Keep important riffs safe</span>
      <p className="storage-eviction-prompt__body">
        <strong>Saved riffs can clear out on this browser</strong> when your device needs space.
        Export any riff you want to keep.
      </p>
    </aside>
  );
}
