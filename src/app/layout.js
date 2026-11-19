import localFont from "next/font/local";
import "../styles/globals.css";
import "../styles/fonts.css";
import SiteLayout from "@/components/common/SiteLayout";
import { createRootMetadata } from "@/lib/seo";

/* ─────────────────────────────── Font ────────────────────────────────
 * One typeface everywhere: EB Garamond, the classic book Garamond of the
 * cover title, the event tabs and the printed cards. 400 = the cover's
 * regular, 500 = the medium of the names and labels. Self-hosted WOFF2,
 * preloaded by next/font (no third-party request). All CSS reads
 * var(--font-serif), so changing the typeface means changing only the files
 * listed here (and art/fonts for the card artwork).
 *
 * The loading screen is the first thing painted, before the font has arrived.
 * "block" keeps text invisible until EB Garamond is ready (the files are small
 * and preloaded), so the loader never flashes another typeface. If the font
 * is very slow (> ~3 s) the fallback is a serif metric-matched to EB Garamond,
 * not next/font's default Arial.
 */
const serif = localFont({
  src: [
    { path: "../fonts/eb-garamond-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/eb-garamond-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-serif",
  display: "block",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14265c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={serif.variable}>
      <body suppressHydrationWarning>
        <SiteLayout>{children}</SiteLayout>
      </body>
    </html>
  );
}

export const metadata = createRootMetadata();
