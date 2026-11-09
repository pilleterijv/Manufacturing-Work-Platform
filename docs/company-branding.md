# Company styling and logo handover

The orange/white presentation reference drives the shared theme across sign-in, navigation, dashboards, task forms, tables, evidence workflows and offline/install surfaces. White is the main canvas; orange identifies navigation and actions; neutral charcoal is used for text and borders. The old green surfaces and decorative Floorwork mark/hero illustration are removed. Red still identifies negative/error states, with explicit text labels.

Palette:

| Use | Color |
| --- | --- |
| Bright brand accent / browser theme | `#E85208` |
| Action orange with readable white text | `#B83C00` |
| Orange panels / gradient end | `#CF4605` |
| White | `#FFFFFF` |
| Soft white canvas | `#FAF9F7` |
| Main neutral text | `#29343C` |
| Muted neutral text | `#65717A` |

White text on `#B83C00` is approximately 5.7:1 contrast; white on `#CF4605` is approximately 4.6:1. Bright `#E85208` is used for accents rather than small white-text controls. This is a focused color check, not a full accessibility certification.

## Original logo still required

`public/company-logo.svg` currently contains a **temporary typed PHARMAVITE wordmark**, not the approved company emblem. An original SVG or transparent PNG was requested because the slide contains a small raster logo and is not a clean source asset. The logo has not been invented, traced or AI-regenerated.

Replace the temporary asset with the company's approved SVG, preserving the full logo and its viewBox. If the supplied original is PNG instead, update `app/components/company-brand.tsx` to use that local file and adapt the icon export input. Review the logo's required clear space and minimum sizes with company brand guidelines.

`CompanyBrand` is the single visible brand component at sign-in and in the workspace. `scripts/render-brand-icons.cjs` deterministically exports app/Apple icons from the local SVG onto white backgrounds. Run `node scripts/render-brand-icons.cjs` in the build workspace after replacing the source logo, then rebuild and verify desktop/iPad layouts. An installed PWA may require an icon refresh or reinstall through IT to replace cached home-screen artwork.

No externally hosted logo/fonts are loaded at runtime. The stylesheet uses installed Segoe UI/Arial fonts and all branding assets are local. The color values are sampled/approximated from the reference; company-approved brand tokens and logo artwork take precedence.

Screenshots: [orange/white gallery](screenshots/orange-white). Company deployment steps: [ordered rollout guide](company-rollout-step-by-step.md).
