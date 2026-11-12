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
| `.local/libexec/vpnchain/vpnchain-native-host` | `~/.local/libexec/vpnchain/` | Started by Chrome for the extension: whether the browser has the pinned proxy, why the chain refuses a host, and the incognito shortcut |
| `.local/share/vpnchain/extension/` | `~/.local/share/vpnchain/` | The Chrome extension for the pinned browser - see [The extension](#the-extension) |
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

With the exit at home, give it a second WireGuard profile for the home route
(`HOME_WG_HOST`, `HOME_WG_PRIVATE_KEY`, `HOME_WG_ADDRESS`) and run
`vpnchain home learn` once from there. Behind the home router the pilot then
sends the pinned browser to the exit over the home network, in whichever
mode is set, and back onto the chain the moment the home network goes -
nothing needs switching by hand, and nothing is restarted. The home route
is WireGuard too, so a late switch stalls; it never leaks.

## The extension

`.local/share/vpnchain/extension` is a Chrome extension for the pinned
browser. Chrome no longer loads extensions from the command line, so load it
once by hand: `chrome://extensions`, Developer mode, Load unpacked,
`~/.local/share/vpnchain/extension`. What it cannot see from inside the
browser it asks a native messaging host, which `vpnchain browser` (and
`vpnchain setup`) registers for this extension's ID alone.

- **Fails closed.** The pinned browser takes its proxy from the command line,
  so one opened from the Dock or Spotlight browses on the real address. The
  extension blocks every page until the host confirms this browser was
  launched with the pinned proxy, and the block is in force before session
  restore loads a tab. A browser launched without it shows a page saying so,
  and a red dot with a bar on the toolbar icon. Loopback stays open, and the browser's own traffic
  (sync, updates, Safe Browsing) is not the extension's to block.
- **Shows the chain.** A dot on the toolbar icon, from the status server
  once a minute: green when on the chain, amber `~` when the upstream is in
  trouble, red `!` when the chain is down or the exit is not the expected
  address, grey `?` with no status server. Hover for the mode, node and
  exits; click for the dashboard.
- **Explains refusals.** A page the chain refuses - on the tracker list, or
  in a `KEEP_OUT_COUNTRIES` site list or domain - says which, instead of a
  bare connection error. By name only: a host refused by address range keeps
  the browser's error, since resolving it here would ask the local resolver.
- **Unwraps tracker links.** The tracker blocklist also refuses the
  click-tracking wrappers that email and affiliate links go through. Many
  carry the destination inside them, and the extension reads it off before
  any request is made. Wrappers whose links hold only an ID stay blocked;
  `rules.js` lists both kinds.
- **Takes the incognito shortcut** (Cmd-Shift-N, Ctrl-Shift-N on Linux),
  which the pinned browser no longer answers, and opens the incognito browser
  instead - or a new window in it, when it is already up. If Chrome keeps the
  key for itself, pick another at `chrome://extensions/shortcuts`.

`vpnchain` with no arguments lists the verbs; the header of `bin/vpnchain`
explains each.
