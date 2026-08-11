# Photos go here

The site's rotating galleries look for images in this folder. The filenames are
already wired up in `index.html` (see the `IMAGES` object near the bottom).
**Any image that isn't present is silently skipped** and a branded gradient
shows instead — so the site never looks broken. Add as many or as few as you like.

## Fastest way to populate (recommended)

1. In Google Drive, open **"Site Photos (CURATED)"** (the `t1…t48.jpg` event shots).
2. Select all → **Download** (Drive zips them).
3. Unzip and drop the `t*.jpg` files straight into this folder.
4. Add a portrait as **`portrait.jpg`** (4:5 / vertical works best).

That's it — commit & redeploy and the real photos take over the gradients.

## Filenames the site currently expects

| Where            | Files |
|------------------|-------|
| Hero rotation    | `t1, t9, t14, t20, t28, t34, t47` (.jpg) |
| ZMM Events card  | `t2, t11, t25, t29` |
| Night School card| `t4, t16, t22, t38` |
| Collegiate card  | `t6, t18, t30, t41` |
| S.O.S card       | `t8, t13, t24` |
| About portrait   | `portrait.jpg` |

Want different photos in a spot? Either rename your file to match, or edit the
`IMAGES` arrays in `index.html` to point at your filenames. Order = rotation order.

## Tips
- Keep each file roughly **under ~400 KB** (the curated set already is) for fast loads.
- Landscape shots work best for the hero and venture cards; a vertical shot for the portrait.
