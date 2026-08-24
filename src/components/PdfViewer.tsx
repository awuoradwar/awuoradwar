"use client";

import { useEffect, useRef, useState } from "react";
import { Language } from "@/lib/types";

/** Renders every page of a PDF as a stack of canvases inside a normal
 * scrollable div, instead of embedding the file in an <iframe> and leaving
 * paging/zooming to whatever PDF plugin the device happens to have. Mobile
 * WebKit's iframe-embedded PDF viewer only ever reliably shows page one and
 * doesn't scale to the screen -- this renders every page ourselves so
 * scrolling through the whole document and fitting the phone's width both
 * just work, on any browser. */
export default function PdfViewer({ src, lang }: { src: string; lang: Language }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        const doc = await pdfjs.getDocument({ url: src }).promise;
        if (cancelled) return;

        const width = container.clientWidth || 360;
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          if (cancelled) return;
          const unscaledViewport = page.getViewport({ scale: 1 });
          const scale = width / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "mx-auto block max-w-full shadow-sm";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("PdfViewer failed to render", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (container) container.innerHTML = "";
    };
  }, [src]);

  return (
    // h-full, not flex-1/min-h-0 -- this div's immediate parent (the wrapper
    // in AttachmentViewerLink) is a plain block, not itself display:flex, so
    // flex-sizing classes here are no-ops: with them, this div silently grew
    // to its full multi-page content height instead of being clipped to the
    // wrapper's already-correctly-computed space, leaving every page past
    // the first rendered but positioned off past the viewport edge with no
    // way to scroll to it. h-full fills exactly the wrapper's real height
    // (a percentage height resolves fine there since flex already gave the
    // wrapper a definite one), and overflow-y-auto then genuinely engages.
    <div className="h-full overflow-y-auto bg-white/5">
      {status === "loading" && <p className="p-6 text-center text-sm text-white/70">{lang === "es" ? "Cargando…" : "Loading…"}</p>}
      {status === "error" && (
        <p className="p-6 text-center text-sm text-white/70">
          {lang === "es" ? "No se pudo mostrar el documento aquí." : "Couldn't display the document here."}
        </p>
      )}
      <div ref={containerRef} className="flex flex-col items-center gap-3 p-3" />
    </div>
  );
}
