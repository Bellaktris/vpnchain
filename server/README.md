# A Reality node of your own

What runs on a small VPS that serves as a Reality node for `chained-reality`
mode, and for a few friends. Debian 13; any VPS with a public IPv4 will do.

To the network it is a small web server: 80 and 443 open, ping answered,
everything else refused. Port 443 is sing-box's Reality inbound, which hands
anyone without credentials to the real nginx site behind it, on the
server's own hostname and with a real certificate - so an active probe finds
exactly the site the server claims to be. SSH is not exposed at all: it
arrives inside the Reality inbound, to sshd on loopback
(`vpnchain ssh-reality`).

`files/` mirrors `/`. Copied as they are, except the three templates, whose
`@PLACEHOLDERS@` are filled in below.

| File | Purpose |
| :- | :- |
| `etc/sing-box/config.json.template` | The Reality inbound. Friends may use anything but BitTorrent, and nothing on the server's own addresses; your own user (`owner-mux`, multiplexed) is not inspected |
| `etc/nginx/sites-available/{cover,default}` | The cover site on loopback for Reality to hand probes to; port 80 for ACME and a redirect |
| `etc/nftables.conf` | 80 and 443 only, every other port refused |
| `etc/ssh/sshd_config.d/10-keys-only.conf` | Keys only, and loopback only |
| `etc/apt/apt.conf.d/51unattended-sagernet` | Unattended upgrades include sing-box |
| `usr/local/sbin/sing-box-guard`, `etc/apt/apt.conf.d/52sing-box-guard`, `etc/systemd/system/sing-box.service.d/guard.conf`, `etc/update-motd.d/60-sing-box-guard` | The service runs a known-good copy of sing-box; an upgrade is taken only once it accepts the live config and stays up, and a refusal is shown at login |
| `usr/local/sbin/vpnchain-friend` | `add`, `link`, `remove`, `list` friends, printing `vless://` links for v2rayA and the like |

## Setting one up

As root, with the VPS's hostname (its provider-assigned one serves well: the
Reality server name then matches the address's reverse DNS) in `HOST`:

```
apt install nginx certbot nftables unattended-upgrades
# sing-box from SagerNet's apt repository: https://sing-box.sagernet.org/installation/package-manager/

cp -r files/etc files/usr /                 # from a checkout of this directory
ln -sf /etc/nginx/sites-available/cover /etc/nginx/sites-enabled/cover

sed -i "s/@HOST@/$HOST/g" /etc/nginx/sites-available/cover /etc/nginx/sites-available/default
systemctl reload nginx
certbot certonly --webroot -w /var/www/html -d "$HOST" --deploy-hook "systemctl reload nginx"

sing-box generate reality-keypair         # PrivateKey and PublicKey
sing-box generate uuid                    # your own user
sing-box generate rand --hex 8            # its short ID
```

Keep the public key where `vpnchain-friend` reads it, and fill in the config:

```
printf 'PUBLIC=%s\n' "<PublicKey>" > /etc/sing-box/reality.secret; chmod 600 /etc/sing-box/reality.secret
sed -e "s/@HOST@/$HOST/" -e "s/@REALITY_PRIVATE_KEY@/<PrivateKey>/" \
    -e "s/@OWNER_UUID@/<uuid>/" -e "s/@OWNER_SHORT_ID@/<short id>/" \
    -e "s/@IPV4@/<the server's IPv4>/" -e "s|@IPV6_PREFIX@|<its IPv6 /64, or ::2/128 if none>|" \
    /etc/sing-box/config.json.template > /etc/sing-box/config.json
sing-box check -C /etc/sing-box && /usr/local/sbin/sing-box-guard
systemctl daemon-reload && systemctl enable --now sing-box
```

Then, on the client, add the node to `~/.config/vpnchain/own-nodes.json`
(the fields are described above `OWN_NODES_FILE` in `bin/vpnchain`), with
`"multiplex": true` and `"ssh_key"`, and check `vpnchain ssh-reality` works
**before** the step that closes SSH to the world - the provider's web
console is the way back in otherwise:

```
systemctl enable --now nftables           # 80 and 443 only from here on
systemctl restart ssh                     # sshd now listens on loopback only
```

## Friends

```
vpnchain-friend add alice      # prints a vless:// link to send
vpnchain-friend remove alice
```

Their traffic leaves from this server's address, which is also yours: give
the links to people you trust with it.
