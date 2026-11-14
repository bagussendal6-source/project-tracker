import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

async function boot() {
  // Outside Electron (npm run ui), preview the UI with the CLI's saved analyses.
  if (import.meta.env.DEV && !window.api) window.api = (await import("./dev/mockApi.ts")).mockApi;
  // In the desktop app the sidebar uses native macOS vibrancy instead of a flat color.
  if (navigator.userAgent.includes("Electron")) document.documentElement.classList.add("vibrant");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
boot();
