import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import App from "./App";
import './globals.css';

// WebView2 ships a browser page menu (Back, Refresh, Save as, Print, Inspect)
// that has nothing to do with an editor. Suppressing the default here leaves
// the app's own right-click menus untouched — those are React handlers and
// still run on the same event.
window.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
