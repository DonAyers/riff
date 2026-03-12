import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { buildLabel } from "./lib/buildInfo";
import "./styles/tokens.css";
import "./styles/index.css";

registerSW({ immediate: true });

console.info(`Riff build ${buildLabel}`);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
