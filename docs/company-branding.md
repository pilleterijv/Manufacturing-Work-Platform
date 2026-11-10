# Company styling and logo handover

The orange/white presentation reference drives the shared theme across sign-in, navigation, dashboards, task forms, tables, evidence workflows and offline/install surfaces. White is the main canvas; orange identifies navigation and actions; neutral charcoal is used for text and borders. The old green surfaces and decorative Floorwork mark/hero illustration are removed. Red still identifies negative/error states, with explicit text labels.

Palette:

| Use | Color |
| --- | --- |
| Bright brand accent / browser theme | `#E85208` |
| Action orange with readable white text | `#B83C00` |
| Bright panel gradient end | `#E95D08` |
| White | `#FFFFFF` |
| Soft white canvas | `#FAF9F7` |
| Main neutral text | `#29343C` |
| Muted neutral text | `#65717A` |

White text on `#B83C00` is approximately 5.7:1 contrast. Bright orange presentation panels use large white text (approximately 3.7:1 on `#E85208`) and darker backplates for small labels. Small functional controls use the darker orange rather than bright-orange backgrounds. This is a focused color check, not a full accessibility certification.

## Neutral branding

The platform now uses a neutral Manufacturing Work Platform wordmark and contains no named company branding in its interface or app icons. `CompanyBrand` supplies the visible heading; `public/company-logo.svg` supplies the neutral app-icon artwork. The earlier temporary company-specific wordmark has been removed at the user's request. Historical screenshot folders document earlier versions; new captures show the current interface.

`node scripts/render-brand-icons.cjs` exports the local SVG onto white app/Apple icons. Rebuild after changing branding assets. Existing installed PWAs may need their icons refreshed/reinstalled through IT. Fonts and assets are local; no externally hosted branding resources load at runtime.

See the [company rollout guide](company-rollout-step-by-step.md) for hosting and operational ownership.
