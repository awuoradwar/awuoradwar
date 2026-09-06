"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regenerateProceduresLinkAction } from "@/app/actions/procedureActions";
import { Language } from "@/lib/types";
import { btnOutline } from "./forms/FormShell";

export default function ProceduresLinkCard({ link, qrDataUrl, lang }: { link: string | null; qrDataUrl: string | null; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const es = lang === "es";

  function regenerate() {
    const confirmMsg = es
      ? "Esto reemplaza el enlace actual -- cualquier código QR impreso o marcador guardado deja de funcionar de inmediato. ¿Continuar?"
      : "This replaces the current link -- any printed QR code or saved bookmark stops working immediately. Continue?";
    if (link && !confirm(confirmMsg)) return;
    startTransition(async () => {
      await regenerateProceduresLinkAction();
      router.refresh();
    });
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently (permissions, non-HTTPS context)
      // -- the link is still visible on screen to copy by hand.
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a server-generated data: URI, not an optimizable remote image
        <img src={qrDataUrl} alt={es ? "Código QR para la lista de procedimientos" : "QR code for the procedures checklist"} className="h-48 w-48 rounded-xl border border-border" />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">{es ? "Todavía no hay un enlace generado." : "No link generated yet."}</p>
      )}
      {link && <p className="w-full break-all rounded-lg bg-card-subtle px-3 py-2 text-xs text-muted">{link}</p>}
      <div className="flex items-center gap-2">
        {link && (
          <button type="button" onClick={copyLink} className={btnOutline}>
            {copied ? (es ? "Copiado ✓" : "Copied ✓") : es ? "Copiar enlace" : "Copy link"}
          </button>
        )}
        <button type="button" disabled={pending} onClick={regenerate} className={btnOutline}>
          {pending ? "…" : link ? (es ? "Regenerar" : "Regenerate") : es ? "Generar enlace" : "Generate link"}
        </button>
      </div>
      {link && (
        <p className="text-xs text-muted">
          {es ? "Imprime el código QR para cada estación, o comparte el enlace por mensaje." : "Print the QR code for each station, or text/share the link."}
        </p>
      )}
    </div>
  );
}
