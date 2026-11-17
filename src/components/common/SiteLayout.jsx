/**
 * The site is a single full-screen 3D experience, so the template's Lenis
 * smooth-scroll (a permanent requestAnimationFrame loop), ScrollTrigger and
 * the placeholder Header/Footer are intentionally left out — they would cost
 * frames on low-end devices for no visible benefit. The components still exist
 * in this folder if you add scrolling pages later.
 */
export default function SiteLayout({ children }) {
  return children;
}
