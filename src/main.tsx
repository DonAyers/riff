import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { initializePalettePreference } from "./hooks/usePalettePreference";
import { initializeThemePreference } from "./hooks/useThemePreference";
import { buildLabel } from "./lib/buildInfo";
import "./styles/fonts";
import "./styles/tokens.css";
import "./styles/palettes.css";
import "./styles/index.css";

registerSW({ immediate: true });
initializePalettePreference();
initializeThemePreference();

console.info(`Riff build ${buildLabel}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
