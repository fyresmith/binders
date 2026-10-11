#!/usr/bin/env bash
# Runs `npm run -s e2e -- "$@"` in the current directory, but only when one of a few machine-wide slots is free.
# For when several agents work at once: each runs its spec files through this, so the machine never has more than
# BINDERS_E2E_SLOTS Obsidians going (4 by default: the maintainer's cap, 2026-10-11, after six at once on 16 threads
# and 15 GB made the desktop lag). It may wait before it starts; that is it working.
#
#   bash <the project>/scripts/e2e-slot.sh --specs tests/e2e/specs-x.mjs --grep "words of the test"
#
# Run it in the foreground with a long time limit. The locks are in ~/.cache/binders-e2e/slots, the same for every
# worktree, and are let go when the run ends, however it ends.
slots="${BINDERS_E2E_SLOTS:-4}"
dir="${BINDERS_E2E_TMP:-$HOME/.cache/binders-e2e}/slots"
mkdir -p "$dir"
while true; do
	for i in $(seq 1 "$slots"); do
		exec {fd}>"$dir/slot-$i.lock"
		if flock -n "$fd"; then
			npm run -s e2e -- "$@"
			exit $?
		fi
		exec {fd}>&-
	done
	sleep $((5 + RANDOM % 10))
done
