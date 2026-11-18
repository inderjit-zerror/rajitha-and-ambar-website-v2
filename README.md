# Rajitha & Ambar — 3D wedding invitation

Next.js 16 (JSX) · Three.js · React Three Fiber · GLSL · GSAP

A photoreal cloth-bound folio floating in front of a big typographic hero.

1. **Loading screen.** The blessing image in an arch, the couple's names and a
   fine gold line that fills with the real loading progress. When everything
   is ready it drains away like liquid (full-screen WebGL shader).
2. **Book arrives.** It flies up from below the screen, makes one full 360°
   turn and settles in the centre, between the two halves of the title.
3. **Click To Open (flexing cover).** The cover lifts on its own hinge, the
   spine lets it fall open, and the board bends softly as it swings.
4. **Cards come in (painted in).** The left card, then the four event cards,
   appear like watercolour soaking into paper.
5. **Pick an event (liquid distortion).** The left card stays in place; its
   print turns liquid and flows into the chosen event's card. Click the card
   (or the Invitation tab) to flow back.

```bash
npm run dev        # http://localhost:3000
npm run build
```

## Interactions

| Input | What happens |
| --- | --- |
| Move the mouse | the book leans towards the cursor, foil lettering catches the light |
| Drag | rotate the book (full turns while closed, a gentle swing while open), with inertia |
| Click the book / button | open |
| Hover a pocket card | it peeks up · click to show that event on the left card |
| Click the left card, a tab, or `Esc` | back to the invitation · `Esc` again closes the book |
| `Enter` · `←` `→` · `1`–`4` | open · previous / next card · jump to an event |
| Phones | tap, swipe between the two panels, tabs at the bottom |

## Changing the artwork

Every printed surface is a mesh textured with one image.

1. Put the new file in `art/` with the same name (png / jpg / webp, any size —
   keep the proportions below).
2. `npm run textures` → optimised WebP in `public/textures/hd` + `/sd`, and a
   new version stamp so browsers pick the change up immediately.

| File | Shows | Size |
| --- | --- | --- |
| `art/cover.png` | front cover — light lettering automatically becomes embossed foil | 1100 × 1420 |
| `art/spine.png` | spine cloth + title (reads top → bottom) | 240 × 1424 |
| `art/invitation.png` | left card (default) | 1200 × 1616 |
| `art/pocket.png` | pocket, right panel | 1036 × 552 |
| `art/loader/blessing.png` | image on the loading screen (shown in an arch). A small file is upscaled and sharpened automatically; use the original high-resolution photo if you have it | ≥ 800 × 1000 |
| `art/events/<id>.png` | event card: its top half stands in the pocket (the top 240 px band is what you see), and the whole card is shown on the left when chosen | 1130 × 1500 |

Event names / order: `EVENTS` in `src/config/book.js`. The current images are
**placeholders** cut from the mockups (`npm run art:placeholders`); dates and
venues on the event cards are sample text.

## Font

One typeface everywhere: **Cormorant Garamond**, the serif of the book cover,
self-hosted in `src/fonts`. All CSS reads `var(--font-serif)`; to change the
typeface, change the files listed in `src/app/layout.js`.

## Where things are

```
src/config/book.js                  artwork, events, folio dimensions, colours
src/app/layout.js                   font
src/components/experience/
  InvitationExperience.jsx          page shell + big title (behind the canvas)
  Loader.jsx · Overlay.jsx · Cursor.jsx · experience.module.css
  Scene.jsx                         <Canvas>, adaptive pixel ratio
  three/materials.js                ALL shaders: veil, bend, paint, liquid
  three/World.jsx                   textures, lighting, loading veil, warm-up
  three/Book.jsx                    boards, spine, hinges, intro / open / close
  three/Cards.jsx                   left card, pocket, event cards
  three/CameraRig.jsx               framing per view
  three/Controls.jsx                lean, drag-rotate, swipe, keyboard
  three/state.js                    per-frame animation values (no React)
src/lib/device.js · textures.js     device tier · procedural linen / foil maps
scripts/                            texture pipeline
```

To retime or restyle an effect, look for its name in `three/materials.js`
(GLSL) and for the matching value in `three/state.js` (`veil`, `pose`,
`bend`, `left.paint`, `left.mix`), which the GSAP timelines in `Loader.jsx`,
`Book.jsx` and `Cards.jsx` animate.

## Performance notes

- **Shaders are patches on the physically-based material** (and on its depth
  material where the shape changes), so every effect is lit, reflected and
  shadowed correctly and costs nothing once it has finished: each one is
  skipped by a single uniform test (`uPaint < 1`, `uMix > 0`, …). The loading
  veil is switched off entirely after it has drained.
- **Device tier before the WebGL context exists** (GPU, cores, memory, mobile,
  save-data): pixel-ratio cap, MSAA, shadow-map size (2048 / 1024 / none),
  reflection size (128 / 64 / none), HD or SD textures. `PerformanceMonitor`
  then adjusts the pixel ratio live.
- **The shadow map is re-rendered only on frames where something moved.** The
  idle float and parallax move the camera, not the book.
- **No HDR download:** reflections come from a tiny environment rendered once
  from a few light panels. The backdrop shadow is a signed-distance function
  on one quad. Linen weave and the cover's foil / emboss maps are generated on
  the client from the artwork.
- Animation state lives outside React (`three/state.js`): animating never
  re-renders components. Geometries and materials are created once and disposed.
- Three.js is code-split (≈275 KB gz, loaded behind the loader); the page
  itself needs ≈200 KB gz. All artwork ≈450 KB (HD) / ≈190 KB (SD), cached for
  a year behind versioned URLs. Font ≈46 KB.
- Everything is compiled and uploaded behind the loader (`compileAsync`), so
  the first animated frame doesn't hitch. `prefers-reduced-motion` is
  respected; a plain-HTML invitation is shown if WebGL is unavailable.
