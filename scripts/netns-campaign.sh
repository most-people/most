#!/usr/bin/env bash
# F5 network-condition campaign (Linux, root). Writes one JSONL log per
# condition into <out-dir> and prints each summary.
#
#   scripts/netns-campaign.sh <out-dir> [rng-seed] [commit]
# RUNS overrides the 300 runs per condition; ONLY="mixed cone" limits the
# conditions run.
set -euo pipefail

cd "$(dirname "$0")/.."
out=$1
rng=${2:-20261116}
commit=${3:-}
runs=${RUNS:-300}
mkdir -p "$out"

run() { # run <name> <mode> <netem> <runs> <relay-churn args...>
  local name=$1 mode=$2 netem=$3 count=$4
  shift 4
  if [ -n "${ONLY:-}" ] && [[ " $ONLY " != *" $name "* ]]; then return; fi
  scripts/netns-topology.sh up "$mode" 7 "$netem"
  node scripts/relay-churn.js --netns "$mode" --netem "$netem" --runs "$count" \
    --rng "$rng" --commit "$commit" --out "$out/$name.jsonl" "$@"
  node scripts/relay-churn.js --summarize "$out/$name.jsonl" || true
}

run lan lan "" "$runs" --seeds 2
run cone cone "" "$runs" --seeds 2
run mixed mixed "" "$runs" --seeds 2 --downloader-slot 6
run mixed-relay mixed "" "$runs" --seeds 2 --downloader-slot 6 --relay
run cone-netem cone "loss 2% delay 40ms 20ms" "$runs" --seeds 2
# Both sides symmetric needs a relay, which is not configured by default;
# 30 runs are enough to show whether it works at all. With --relay a blind
# relay runs in "bs" and every node uses it.
run symmetric symmetric "" 30 --seeds 1
run symmetric-relay symmetric "" "$runs" --seeds 2 --relay

scripts/netns-topology.sh down 7
