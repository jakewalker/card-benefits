/**
 * Web entry. Owned by Phase C (rewrite freely: router, sw registration, etc.).
 * Phase 0 placeholder just proves the toolchain runs.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <p style={{ fontFamily: "system-ui", padding: "2rem" }}>
      Card Benefits — scaffold OK (Phase C replaces this).
    </p>
  </StrictMode>,
);
