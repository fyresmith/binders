#!/bin/sh
# Setting up a fresh Linux machine (a cloud session's sandbox, a CI runner) to build and test Binders.
# The build, lint and unit tests need only Node and `npm ci`. The end-to-end tests drive a real Obsidian, which this
# fetches and unpacks without installing it; `tests/e2e/driver.mjs` starts it headless (docs/dev/development.md).
#
#   sh scripts/cloud-setup.sh          # then: . ./.cloud-env  (or copy its two lines into the environment)
#
# Proven in a Claude Code cloud sandbox on 2026-10-06 (Ubuntu, running as root, no display): no libraries were missing,
# and the one thing that had to change was --no-sandbox, which tests/e2e/driver.mjs now passes when run as root.
set -e
OBSIDIAN_VERSION="${OBSIDIAN_VERSION:-1.13.7}"
TOOLS="${BINDERS_E2E_HOME:-$HOME/.cache/binders-e2e}"
DIR="$TOOLS/obsidian-$OBSIDIAN_VERSION"

npm ci

if [ ! -x "$DIR/obsidian" ]; then
	mkdir -p "$TOOLS"
	cd "$TOOLS"
	curl -fsSLO "https://github.com/obsidianmd/obsidian-releases/releases/download/v$OBSIDIAN_VERSION/Obsidian-$OBSIDIAN_VERSION.AppImage"
	chmod +x "Obsidian-$OBSIDIAN_VERSION.AppImage"
	# (unpacked, not run: an AppImage needs FUSE to run as it is, and a sandbox usually has none)
	"./Obsidian-$OBSIDIAN_VERSION.AppImage" --appimage-extract >/dev/null
	rm -rf "$DIR" && mv squashfs-root "$DIR" && rm "Obsidian-$OBSIDIAN_VERSION.AppImage"
	cd - >/dev/null
fi

# Electron's own libraries: present on a desktop, often missing in a bare image. Listed, not installed, unless we can.
MISSING=$(ldd "$DIR/obsidian" 2>/dev/null | awk '/not found/ { print $1 }' | tr '\n' ' ')
if [ -n "$MISSING" ]; then
	echo "Obsidian's Electron is missing libraries: $MISSING"
	if command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" = 0 ]; then
		apt-get update -qq && apt-get install -y -qq libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libasound2t64 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 || echo "Install them by hand (the names above are Ubuntu 24.04's)."
	else
		echo "Install them (on Ubuntu 24.04: libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libasound2t64 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2)."
	fi
fi

# EPUBCheck for the export tests (uses the system's Java if there is one).
sh scripts/get-epubcheck.sh || echo "EPUBCheck was not fetched: the export tests will say it was not run."

cat > .cloud-env <<ENV
export OBSIDIAN_ELECTRON="$DIR/obsidian"
export OBSIDIAN_ASAR="$DIR/resources/app.asar"
ENV
echo "Done. Next:  . ./.cloud-env && npm run build && npm run e2e -- --specs tests/e2e/specs.mjs,tests/e2e/specs-driver.mjs"
