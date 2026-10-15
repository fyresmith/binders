#!/usr/bin/env bash
# LibreOffice saves each source (make.mjs) as the formats the import reads, and as the .docx that is the tests' oracle.
# Run from the project's folder, with LibreOffice installed (soffice).
set -euo pipefail
here=tests/fixtures/import/libreoffice
for book in salt-road numbered; do
	soffice --headless --convert-to odt --outdir "$here" "$here/source/$book.fodt" >/dev/null
	soffice --headless --convert-to fodt --outdir "$here" "$here/$book.odt" >/dev/null
	soffice --headless --convert-to "rtf:Rich Text Format" --outdir "$here" "$here/$book.odt" >/dev/null
	soffice --headless --convert-to "docx:MS Word 2007 XML" --outdir "$here" "$here/$book.odt" >/dev/null
	mv "$here/$book.docx" "$here/$book.oracle.docx"
done
