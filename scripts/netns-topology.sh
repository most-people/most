#!/usr/bin/env bash
# Isolated test network for scripts/relay-churn.js (Linux, root).
#
#   netns-topology.sh up <lan|cone|symmetric|mixed> <slots> [netem args]
#   netns-topology.sh down <slots>
#
# Namespace "mw" holds a bridge that plays the internet (20.20.0.0/24, no
# route to the host). The DHT bootstrap runs in "bs" (20.20.0.2). Node slot i
# runs in "n<i>":
#   lan        n<i> sits on the bridge itself (20.20.0.<10+i>)
#   cone       n<i> (192.168.<i>.2) is behind router r<i>, MASQUERADE
#   symmetric  same, MASQUERADE --random-fully (port per destination)
#   mixed      cone, except the last slot, which is symmetric (a phone on
#              a carrier NAT downloading from home seeds)
# Optional netem args (e.g. "loss 2% delay 40ms 20ms") apply on each node's
# uplink. iptables rules exist only inside the r<i> namespaces.
set -euo pipefail

action=$1

attach() { # attach <ns> <ifname> <ip/cidr>: veth from <ns> to the bridge
  local ns=$1 ifname=$2 addr=$3
  ip link add "$ifname" type veth peer name "w-$ifname"
  ip link set "$ifname" netns "$ns"
  ip link set "w-$ifname" netns mw
  ip -n mw link set "w-$ifname" master br0 up
  ip -n "$ns" addr add "$addr" dev "$ifname"
  ip -n "$ns" link set "$ifname" up
}

down() {
  local slots=$1
  for ns in mw bs $(seq -f 'n%g' 0 $((slots - 1))) $(seq -f 'r%g' 0 $((slots - 1))); do
    ip netns del "$ns" 2>/dev/null || true
  done
}

if [ "$action" = down ]; then
  down "$2"
  exit 0
fi

mode=$2
slots=$3
netem=${4:-}
down "$slots"

ip netns add mw
ip -n mw link set lo up
ip -n mw link add br0 type bridge
ip -n mw link set br0 up

ip netns add bs
ip -n bs link set lo up
attach bs bs0 20.20.0.2/24

for i in $(seq 0 $((slots - 1))); do
  ip netns add "n$i"
  ip -n "n$i" link set lo up
  if [ "$mode" = lan ]; then
    attach "n$i" "n${i}w" "20.20.0.$((10 + i))/24"
    uplink_ns="n$i" uplink="n${i}w"
  else
    ip netns add "r$i"
    ip -n "r$i" link set lo up
    attach "r$i" "r${i}w" "20.20.0.$((10 + i))/24"
    ip link add "r${i}l" type veth peer name "n${i}l"
    ip link set "r${i}l" netns "r$i"
    ip link set "n${i}l" netns "n$i"
    ip -n "r$i" addr add "192.168.$i.1/24" dev "r${i}l"
    ip -n "r$i" link set "r${i}l" up
    ip -n "n$i" addr add "192.168.$i.2/24" dev "n${i}l"
    ip -n "n$i" link set "n${i}l" up
    ip -n "n$i" route add default via "192.168.$i.1"
    ip netns exec "r$i" sysctl -qw net.ipv4.ip_forward=1
    random=""
    if [ "$mode" = symmetric ] || { [ "$mode" = mixed ] && [ "$i" -eq $((slots - 1)) ]; }; then
      random="--random-fully"
    fi
    ip netns exec "r$i" iptables -t nat -A POSTROUTING -o "r${i}w" -j MASQUERADE $random
    # Drop unsolicited inbound like a home router. Without this, a peer's
    # early punch packet is committed as an inbound conntrack entry, and our
    # own outbound packet to that peer then gets a different source port.
    ip netns exec "r$i" iptables -A INPUT -i "r${i}w" -m conntrack --ctstate NEW -j DROP
    uplink_ns="r$i" uplink="r${i}w"
  fi
  if [ -n "$netem" ]; then
    # shellcheck disable=SC2086
    ip netns exec "$uplink_ns" tc qdisc add dev "$uplink" root netem $netem
  fi
done
