#!/bin/bash
# Vercel Ignored Build Step: exit 0 = skip this build, exit 1 = build.
# Compares against the last commit Vercel built on this branch (VERCEL_GIT_PREVIOUS_SHA), so
# multi-commit pushes and merges are judged on the whole change. If no usable base exists
# (new branch with no origin/main, force-push, shallow clone), it builds.
B="${VERCEL_GIT_PREVIOUS_SHA:-$(git merge-base HEAD origin/main 2>/dev/null)}"
[ -n "$B" ] && [ "$B" != "$(git rev-parse HEAD)" ] && git cat-file -e "$B^{commit}" 2>/dev/null || exit 1
git diff --quiet "$B" HEAD -- . ":(exclude)*.md" ":(exclude)docs"
