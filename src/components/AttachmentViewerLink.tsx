"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Language } from "@/lib/types";
import PdfViewer from "./PdfViewer";

/** Opens an attachment in a full-screen in-app modal instead of
 * `target="_blank"`, which leaves no close/back affordance inside the PWA --
 * once a `target="_blank"` link opens (image, PDF, whatever the browser
 * does with it), there's nothing to tap to get back to the app. Tries an
 * image first, since that's what most attachments here are; if that fails
 * to load (e.g. a PDF was uploaded through a mixed-type field, or this link
 * points at a document rather than a photo), falls back to an iframe --
 * still inside this same closeable modal, never a new tab, so the ✕ button
 * is always the way out regardless of what kind of file it turns out to
 * be. */
export default function AttachmentViewerLink({
  href,
  label,
  lang,
  className,
}: {
  href: string;
  label: string;
  lang: Language;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open &&
        createPortal(
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={() => setOpen(false)}>
            <div className="flex items-center justify-between gap-2 p-3" onClick={(e) => e.stopPropagation()}>
              <a href={href} target="_blank" rel="noreferrer" className="text-sm font-semibold text-white/70 underline">
                {lang === "es" ? "Abrir en pestaña nueva" : "Open in new tab"}
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={lang === "es" ? "Cerrar" : "Close"}
                className="tap-target flex h-10 w-10 min-h-0 min-w-0 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white"
              >
                ✕
              </button>
            </div>
            {imageFailed ? (
              <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
                <PdfViewer src={href} lang={lang} />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={href}
                alt={label}
                onError={() => setImageFailed(true)}
                onClick={(e) => e.stopPropagation()}
                className="m-auto max-h-full max-w-full object-contain"
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
}
