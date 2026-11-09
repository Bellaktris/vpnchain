# vpnchain

A chained proxy for one browser, on macOS or Linux:

```
browser -> sing-box -> a node (CDN with ECH, or Reality) -> WireGuard -> your exit
```

The exit is a WireGuard peer with an address of your own. The hop before it
is what the local network sees, and it is chosen to survive censorship:
ordinary TLS through a CDN whose server names ECH hides, or Reality to a
provider's node or one you run. A pilot keeps the chain on a working node
without being asked, and a dashboard shows what the chain and the browser
actually do.

## What is here

| Path | Installed as | What it is |
| :- | :- | :- |
| `bin/vpnchain` | `~/bin/vpnchain` | The command, and its manual: the header comment documents every verb, mode and setting |
| `.local/libexec/vpnchain/vpnchain-pilot` | `~/.local/libexec/vpnchain/` | Picks and replaces nodes through sing-box's Clash API; rotates between Reality nodes |
| `.local/libexec/vpnchain/vpnchain-statusd` | `~/.local/libexec/vpnchain/` | Serves the dashboard and the host-side status it cannot see itself |
| `.local/share/vpnchain/dashboard.html` | `~/.local/share/vpnchain/` | The dashboard page |
| `server/` | not installed | A Reality node of your own: config templates, firewall, and the friend-link script |

The tree mirrors `$HOME`, so it is a GNU Stow package; `.stow-local-ignore`
keeps this README and `server/` out of `$HOME`. The programs find each other
from their real location, so running `bin/vpnchain` straight from a checkout
works too.

## Install

As part of [Bellaktris/.files](https://github.com/Bellaktris/.files), where
it is the `vpnchain` submodule and an opt-in package:

```
./install main git fonts vpnchain
```

Standalone:

```
git clone https://github.com/Bellaktris/vpnchain ~/src/vpnchain
stow -d ~/src -t ~ vpnchain
```

Needs `sing-box`, `python3` and `curl`; the browsers it pins default to
Google Chrome and Mullvad Browser. The zsh completion lives in the prezto
fork that `.files` uses (`modules/completion/completions/_vpnchain`).

## First run

```
vpnchain setup              # asks for what the env file lacks
vpnchain start chained      # or chained-reality, or direct
vpnchain browser
```

`setup` writes `~/.config/vpnchain/env`, the one place for everything
site-specific; nothing personal lives in this repo. It asks for the
subscription (or an upstream proxy), the WireGuard credentials - or imports
them from the provider's `.conf` - and the exit address.

## Modes

- `chained`: through the provider's CDN nodes, those whose names ECH hides
  whenever any answers.
- `chained-reality`: through Reality nodes only, your own among them, for
  networks that block or throttle CDNs, DoH and ECH. The pilot moves between
  them every 20-60 minutes so that no one address carries the whole day.
- `direct`: WireGuard straight to the peer. Simplest, and plainly a VPN on
  the wire.

`vpnchain` with no arguments lists the verbs; the header of `bin/vpnchain`
explains each.
