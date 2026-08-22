"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Language } from "@/lib/types";

/** Opens an attached image in a full-screen in-app modal instead of
 * `target="_blank"`, which leaves no close/back affordance inside the PWA's
 * in-app browser. Falls back to a plain "open in new tab" link if the file
 * fails to load as an image (e.g. a PDF was uploaded through a mixed-type
 * evidence field). */
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
  const [failed, setFailed] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex flex-col bg-black/90"
            onClick={() => setOpen(false)}
          >
            <div className="flex justify-end p-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={lang === "es" ? "Cerrar" : "Close"}
                className="tap-target flex h-10 w-10 min-h-0 min-w-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white"
              >
                ✕
              </button>
            </div>
            {failed ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" onClick={(e) => e.stopPropagation()}>
                <p className="text-sm text-white/80">
                  {lang === "es" ? "No se pudo mostrar como imagen." : "Couldn't display this as an image."}
                </p>
                <a href={href} target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent underline">
                  {lang === "es" ? "Abrir archivo en una pestaña nueva" : "Open file in new tab"}
                </a>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={href}
                alt={label}
                onError={() => setFailed(true)}
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
