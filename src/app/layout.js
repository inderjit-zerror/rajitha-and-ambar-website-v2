import localFont from "next/font/local";
import "../styles/globals.css";
import "../styles/fonts.css";
import SiteLayout from "@/components/common/SiteLayout";
import { createRootMetadata } from "@/lib/seo";

/* ─────────────────────────────── Font ────────────────────────────────
 * One typeface everywhere: Cormorant Garamond, the serif of the book cover
 * and the printed cards. Self-hosted WOFF2, preloaded by next/font (no
 * third-party request). All CSS reads var(--font-serif), so changing the
 * typeface later means changing only the files listed here.
 */
const serif = localFont({
  src: [
    { path: "../fonts/cormorant-garamond-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/cormorant-garamond-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-serif",
  display: "swap",
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
