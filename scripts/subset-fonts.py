"""Makes the EB Garamond files Binders carries for the pages (src/export/fonts/eb-garamond-*.woff2) from the family's
static TrueType files (SIL Open Font License; the notice is beside the files).

    python3 scripts/subset-fonts.py <folder with the .ttf files>     needs: pip install fonttools brotli

EB Garamond ONLY. Its licence declares no Reserved Font Name, so a cut-down file may keep the family's name. Source
Serif 4's reserves "Source": a subset is a Modified Version and may not be called Source Serif, so that family is
carried as Adobe's own files, untouched (scripts/source-serif-fonts.mjs). Before adding a typeface here, read the
first lines of its licence: "with Reserved Font Name" means it can't be cut down and keep its name.

Static files, never the variable ones: Chromium embeds a variable font in a PDF as Type 3 (docs/dev/export.md).
Kept: Latin, Latin-1, Latin Extended-A, the few of Extended-B that Romanian needs, Vietnamese, punctuation, the
currency signs, and the features a book uses (kerning, ligatures, small capitals, old-style and lining figures)."""
import os
import sys
from fontTools import subset

RANGES = "U+0020-007E,U+00A0-017F,U+01A0-01A1,U+01AF-01B0,U+0218-021B,U+02BB-02BC,U+02C6-02C7,U+02D8-02DD,U+2002-2015,U+2018-2022,U+2026,U+2030,U+2032-2033,U+2039-203A,U+2042,U+2044,U+20AC,U+2116,U+2122,U+2212,U+1EA0-1EF9"
FEATURES = "kern,liga,clig,calt,ccmp,locl,mark,mkmk,smcp,c2sc,onum,lnum,pnum,tnum"
FILES = {
    "EBGaramond-Regular": "eb-garamond-regular", "EBGaramond-Italic": "eb-garamond-italic",
    "EBGaramond-Bold": "eb-garamond-bold", "EBGaramond-BoldItalic": "eb-garamond-bold-italic",
}

source = sys.argv[1]
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "export", "fonts")
os.makedirs(out, exist_ok=True)
for name, made in FILES.items():
    target = os.path.join(out, made + ".woff2")
    subset.main([os.path.join(source, name + ".ttf"), "--unicodes=" + RANGES, "--layout-features=" + FEATURES,
                 "--flavor=woff2", "--no-hinting", "--desubroutinize", "--output-file=" + target])
    print(made, os.path.getsize(target))
