import { useState, type FormEvent } from "react";
import {
  PALETTE_ROLES,
  autoMapRoles,
  fetchLospecPalette,
  parseColorList,
  parseLospecSlug,
  type CustomPalette,
  type PaletteRole,
} from "../lib/customPalette";

interface CustomPaletteEditorProps {
  palette: CustomPalette | null;
  /** Saves the palette and switches Riff to it. */
  onChange: (palette: CustomPalette) => void;
}

type ImportStatus = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

const LOSPEC_UNREACHABLE =
  "Couldn't load that from Lospec. Check the name, or paste the palette's hex codes instead (on Lospec: Download, then HEX).";

export function CustomPaletteEditor({ palette, onChange }: CustomPaletteEditorProps) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ImportStatus>({ kind: "idle" });
  const [activeRole, setActiveRole] = useState<PaletteRole | null>(null);

  const handleImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text) return;

    // Hex codes win unless the text is plainly a Lospec link.
    const colors = text.includes("lospec.com") ? [] : parseColorList(text);
    if (colors.length >= 2) {
      onChange({ name: "Pasted palette", colors, roles: autoMapRoles(colors) });
      setStatus({ kind: "idle" });
      setActiveRole(null);
      setInput("");
      return;
    }

    const slug = parseLospecSlug(text);
    if (!slug) {
      setStatus({ kind: "error", message: "Paste a Lospec link or name, or at least two hex codes." });
      return;
    }

    setStatus({ kind: "loading" });
    try {
      const loaded = await fetchLospecPalette(slug);
      onChange({ ...loaded, roles: autoMapRoles(loaded.colors) });
      setStatus({ kind: "idle" });
      setActiveRole(null);
      setInput("");
    } catch {
      setStatus({ kind: "error", message: LOSPEC_UNREACHABLE });
    }
  };

  const assign = (role: PaletteRole, color: string) => {
    if (!palette) return;
    onChange({ ...palette, roles: { ...palette.roles, [role]: color } });
  };

  const activeLabel = PALETTE_ROLES.find((role) => role.id === activeRole)?.label;

  return (
    <fieldset className="settings-panel__group">
      <legend className="settings-panel__legend">Your own palette</legend>
      <form className="custom-palette__import" onSubmit={handleImport}>
        <label className="custom-palette__label" htmlFor="custom-palette-input">
          Lospec link, palette name or hex codes
        </label>
        <div className="custom-palette__import-row">
          <input
            id="custom-palette-input"
            className="custom-palette__input"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="lospec.com/palette-list/sweetie-16"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button className="custom-palette__button" type="submit" disabled={status.kind === "loading"}>
            {status.kind === "loading" ? "Loading…" : "Import"}
          </button>
        </div>
        {status.kind === "error" && (
          <p className="custom-palette__error" role="alert">
            {status.message}
          </p>
        )}
      </form>

      {palette && (
        <div className="custom-palette__editor">
          <div className="custom-palette__heading">
            <span className="custom-palette__name">{palette.name}</span>
            {palette.author && <span className="settings-panel__palette-author">by {palette.author}</span>}
            {palette.sourceUrl && (
              <a className="custom-palette__source" href={palette.sourceUrl} target="_blank" rel="noreferrer">
                View on Lospec
              </a>
            )}
          </div>

          <p className="settings-panel__note">
            Pick a role, then the colour it should use. Riff adjusts text shades so everything stays readable.
          </p>

          <ul className="custom-palette__roles" aria-label="Colour roles">
            {PALETTE_ROLES.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  className="custom-palette__role"
                  aria-pressed={activeRole === role.id}
                  onClick={() => setActiveRole(activeRole === role.id ? null : role.id)}
                >
                  <span
                    className="custom-palette__role-swatch"
                    style={{ background: palette.roles[role.id] }}
                    aria-hidden="true"
                  />
                  <span className="custom-palette__role-label">{role.label}</span>
                  <span className="custom-palette__role-hint">{role.hint}</span>
                </button>
              </li>
            ))}
          </ul>

          {activeRole && (
            <div className="custom-palette__picker" role="radiogroup" aria-label={`Colour for ${activeLabel}`}>
              {palette.colors.map((color) => (
                <label key={color} className="custom-palette__chip" style={{ background: color }}>
                  <input
                    type="radio"
                    name="custom-palette-colour"
                    value={color}
                    aria-label={color}
                    checked={palette.roles[activeRole] === color}
                    onChange={() => assign(activeRole, color)}
                  />
                </label>
              ))}
            </div>
          )}

          <button
            type="button"
            className="custom-palette__button custom-palette__button--quiet"
            onClick={() => onChange({ ...palette, roles: autoMapRoles(palette.colors) })}
          >
            Auto-map again
          </button>
        </div>
      )}
    </fieldset>
  );
}
