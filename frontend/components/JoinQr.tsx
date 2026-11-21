"use client";

// A QR code that opens /join on a phone. Drawn in the browser, so it always
// points at the site it is shown on. Set NEXT_PUBLIC_SITE_URL to point it
// somewhere else (a phone can't open "localhost").
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function JoinQr() {
  const [drawn, setDrawn] = useState<{ url: string; svg: string } | null>(null);

  useEffect(() => {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const url = `${origin.replace(/\/$/, "")}/join`;
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then(
      (svg) => {
        if (live) setDrawn({ url, svg });
      },
    );
    return () => {
      live = false;
    };
  }, []);

  if (!drawn) {
    return (
      <div className="mx-auto h-[190px] w-[190px] animate-pulse rounded-lg bg-slate-100" />
    );
  }
  return (
    <div
      role="img"
      aria-label={`QR code for ${drawn.url}`}
      className="mx-auto h-[190px] w-[190px] [&>svg]:size-full"
      // The SVG comes from the qrcode package and our own URL, never from user input.
      dangerouslySetInnerHTML={{ __html: drawn.svg }}
    />
  );
}
