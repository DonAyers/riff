import { PALETTES, type PaletteId } from "../lib/palettes";
import type { ThemeMode, ThemeSource } from "../hooks/useThemePreference";
import "./SettingsPanel.css";

export type ThemeChoice = "system" | ThemeMode;

interface SettingsPanelProps {
  palette: PaletteId;
  onPaletteChange: (palette: PaletteId) => void;
  theme: ThemeMode;
  themeSource: ThemeSource;
  onThemeChange: (choice: ThemeChoice) => void;
}

const THEME_CHOICES: readonly { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "Match system" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function SettingsPanel({
  palette,
  onPaletteChange,
  theme,
  themeSource,
  onThemeChange,
}: SettingsPanelProps) {
  const themeChoice: ThemeChoice = themeSource === "system" ? "system" : theme;

  return (
    <div className="settings-panel">
      <fieldset className="settings-panel__group">
        <legend className="settings-panel__legend">Mode</legend>
        <div className="settings-panel__modes">
          {THEME_CHOICES.map(({ id, label }) => (
            <label key={id} className="settings-panel__mode">
              <input
                type="radio"
                name="theme-mode"
                value={id}
                checked={themeChoice === id}
                onChange={() => onThemeChange(id)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings-panel__group">
        <legend className="settings-panel__legend">Palette</legend>
        <div className="settings-panel__palettes">
          {PALETTES.map((option) => (
            <label key={option.id} className="settings-panel__palette">
              <input
                type="radio"
                name="palette"
                value={option.id}
                checked={palette === option.id}
                onChange={() => onPaletteChange(option.id)}
              />
              <span className="settings-panel__swatches" aria-hidden="true">
                {option.swatches.map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="settings-panel__palette-name">{option.name}</span>
              <span className="settings-panel__palette-author">by {option.author}</span>
            </label>
          ))}
        </div>
        <p className="settings-panel__note">
          Palettes come from <a href="https://lospec.com/palette-list" target="_blank" rel="noreferrer">Lospec</a>.
          Your choice is saved on this device.
        </p>
      </fieldset>
    </div>
  );
}
