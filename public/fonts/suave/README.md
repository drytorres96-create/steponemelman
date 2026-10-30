# Suave typography for MyQBank

Self-hosted, unmodified WOFF2 files from the official Google Fonts CSS2 API,
retrieved on 2026-10-30. These fonts reproduce the typography in the user-supplied
Suave design reference while leaving MyQBank's color identity intact.

| Family | Style | CSS weight range | Files |
| --- | --- | --- | --- |
| Bricolage Grotesque | Upright, normal width | 200–800 | `bricolage-grotesque-latin.woff2`, `bricolage-grotesque-latin-ext.woff2` |
| Figtree | Upright | 300–900 | `figtree-latin.woff2`, `figtree-latin-ext.woff2` |

Bricolage Grotesque was requested with optical sizes 12–96 and normal width.
Use `font-optical-sizing: auto` for the display family. Each family's two subset
faces must have the same family, style, weight range, and `font-display: swap`,
with the distinct `unicode-range` values in `manifest.json`. The Latin subset
covers the English alphabet and Spanish accented letters, ñ, ü, ¿ and ¡. The
Latin Extended subset provides additional European characters.

The four files total 138,060 bytes. Only the applicable subsets download when
their characters are used. `manifest.json` records the exact upstream URLs,
SHA-256 checksums, byte sizes, weight declarations and Unicode ranges.

## Sources and attribution

- CSS API: <https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Figtree:wght@300..900&display=swap>
- Bricolage Grotesque: Copyright 2022 The Bricolage Grotesque Project Authors,
  <https://github.com/ateliertriay/bricolage>.
- Figtree: Copyright 2022 The Figtree Project Authors,
  <https://github.com/erikdkennedy/figtree>.
- License sources: <https://github.com/google/fonts/blob/main/ofl/bricolagegrotesque/OFL.txt>
  and <https://github.com/google/fonts/blob/main/ofl/figtree/OFL.txt>.

Both families are distributed under the SIL Open Font License 1.1. Their full,
unchanged license texts are included as `bricolage-grotesque-OFL.txt` and
`figtree-OFL.txt`. No font files were modified or subset locally.

Serve these files from `/fonts/suave/`. No Google Fonts request, external font
stylesheet, package dependency or CSP change is needed at runtime. The existing
`font-src 'self'` policy admits these same-origin assets.
