#!/bin/sh
# EPUBCheck for the tests: the validator every ebook store names. A dev-time tool only, never part of the plugin:
# it is unpacked into a folder outside the repository (BINDERS_TOOLS, or ~/.cache/binders-tools) and
# tests/export-epub.test.ts runs it on every EPUB it makes when it is there. It needs Java: the system's own if
# there is one, else a runtime (about 45 MB) is unpacked beside it.
#
#   npm run get-epubcheck
set -e
VERSION=5.2.1
TOOLS="${BINDERS_TOOLS:-$HOME/.cache/binders-tools}"
mkdir -p "$TOOLS"
cd "$TOOLS"
if [ ! -f epubcheck/epubcheck.jar ]; then
	echo "Fetching EPUBCheck $VERSION into $TOOLS/epubcheck"
	curl -fsSL -o epubcheck.zip "https://github.com/w3c/epubcheck/releases/download/v$VERSION/epubcheck-$VERSION.zip"
	unzip -q epubcheck.zip
	rm -rf epubcheck
	mv "epubcheck-$VERSION" epubcheck
	rm epubcheck.zip
fi
if ! command -v java >/dev/null 2>&1 && [ ! -x jre/bin/java ] && [ ! -x jre/Contents/Home/bin/java ]; then
	case "$(uname -s)" in Darwin) OS=mac ;; *) OS=linux ;; esac
	case "$(uname -m)" in arm64 | aarch64) ARCH=aarch64 ;; *) ARCH=x64 ;; esac
	echo "No Java here: fetching a runtime into $TOOLS/jre"
	curl -fsSL -o jre.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/$OS/$ARCH/jre/hotspot/normal/eclipse"
	rm -rf jre
	mkdir jre
	tar -xzf jre.tar.gz -C jre --strip-components=1
	rm jre.tar.gz
fi
echo "EPUBCheck is in $TOOLS. The export tests will use it."
