import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Moshe",
  description: "Restaurant shift execution, accountability, delegation and handoff.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Moshe",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS's "Add to Home Screen" specifically looks for apple-touch-icon --
    // it doesn't read manifest.json icons -- so without this it falls back
    // to a generated icon instead of the real one.
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f1f52",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              function register() {
                navigator.serviceWorker.register('/sw.js').catch(function () {});
              }
              if (document.readyState === 'complete') {
                register();
              } else {
                window.addEventListener('load', register);
              }
            }
          `}
        </Script>
      </body>
    </html>
  );
}
