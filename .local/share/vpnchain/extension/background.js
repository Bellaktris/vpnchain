// Four jobs, all for the pinned browser:
//
//   - fail closed: pages stay blocked until the native host confirms this
//     browser was launched with the pinned proxy
//   - unwrap: tracker links that carry their destination open it directly
//   - status: the toolbar icon shows the chain's state, from the status server
//   - explain: a page the chain refuses says why, instead of a bare error
//
// plus the incognito shortcut. What the extension cannot see from inside the
// browser - its own command line, the sing-box config, the incognito browser -
// it asks the native host, which 'vpnchain browser' registers for this
// extension's ID alone, which the manifest's key fixes. A web page cannot reach
// it the way it could a loopback port.
import { RULES } from "./rules.js";

const HOST = "vpnchain";

// The block is a dynamic rule, which the browser keeps across restarts, so it
// is in force before session restore loads a single tab - a check made at
// startup would always be too late for those. What lifts it is a session rule,
// which the browser drops at every restart, so every launch starts blocked
// and has to be confirmed afresh. Same priority: allow beats block, and the
// unwrap redirects sit above both.
//
// Loopback stays open: it bypasses the proxy in either case, so it exposes
// nothing, and it is where the dashboard and the status server live. The
// browser's own traffic - sync, updates, Safe Browsing - is not the
// extension's to block, and goes direct in an unproxied launch regardless.
const BLOCK_ID = 1000;
const ALLOW_ID = 1;
const BLOCK_RULE = {
    id: BLOCK_ID,
    priority: 1,
    action: { type: "block" },
    condition: { excludedRequestDomains: ["localhost", "127.0.0.1"] },
};
const ALLOW_RULE = { id: ALLOW_ID, priority: 1, action: { type: "allow" }, condition: {} };

// Sends a top-level navigation to any wrapper in rules.js to unwrap.html
// instead, with the wrapped link as its fragment, before a request is made -
// so the tracker is never contacted, not even to be refused.
//
// The page's address carries a per-session ID (use_dynamic_url), which no web
// page can guess and probe for, so the rules are written afresh at every
// browser start as well as at install.
async function register() {
    const page = chrome.runtime.getURL("unwrap.html");
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    const rules = [BLOCK_RULE];
    for (const [i, r] of RULES.entries()) {
        const ok = await chrome.declarativeNetRequest.isRegexSupported({ regex: r.filter + ".*" });
        if (!ok.isSupported) {
            console.warn(`vpnchain: ${r.name}: filter rejected (${ok.reason})`);
            continue;
        }
        rules.push({
            id: i + 2,
            priority: 2,
            action: { type: "redirect", redirect: { regexSubstitution: page + "#\\0" } },
            condition: { regexFilter: r.filter + ".*", resourceTypes: ["main_frame"] },
        });
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: old.map((r) => r.id),
        addRules: rules,
    });
}

async function ask(message) {
    try {
        return await chrome.runtime.sendNativeMessage(HOST, message);
    } catch (e) {
        return { ok: false, error: `native host unreachable (run 'vpnchain setup'): ${e.message}` };
    }
}

// --- fail closed -------------------------------------------------------------

// The state lives in session storage, which a restarted service worker can
// read and a restarted browser cannot: "on" (confirmed), "forced" (lifted by
// hand), "off", or nothing yet.
const session = {
    get: async (k, d) => (await chrome.storage.session.get(k))[k] ?? d,
    set: (k, v) => chrome.storage.session.set({ [k]: v }),
};

async function lifted() {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    return rules.some((r) => r.id === ALLOW_ID);
}

async function lift(state) {
    if (!(await lifted())) {
        await chrome.declarativeNetRequest.updateSessionRules({ addRules: [ALLOW_RULE] });
    }
    await session.set("state", state);
    // Tabs restored while the block was in force show its error; load them
    // again now there is nothing to block them.
    for (const id of await session.get("blockedTabs", [])) {
        chrome.tabs.reload(id).catch(() => {});
    }
    await session.set("blockedTabs", []);
    refreshStatus();
}

// One at a time: startup and a waking service worker both ask, and two
// answers in flight would explain the same thing twice.
let verifying = null;
function verify() {
    verifying ??= check().finally(() => { verifying = null; });
    return verifying;
}

async function check() {
    if (await lifted()) return;
    const reply = await ask({ action: "proxied" });
    if (reply.ok && reply.statusPort) await session.set("statusPort", reply.statusPort);
    if (reply.ok && reply.proxied) {
        await lift("on");
        return;
    }
    await session.set("state", "off");
    await session.set("why", reply.ok ? "" : reply.error);
    refreshStatus();
    // Once per session, so a browser opened from the Dock says why nothing
    // loads rather than leaving a window of blocked tabs to puzzle over.
    if (!(await session.get("explained", false))) {
        await session.set("explained", true);
        chrome.tabs.create({ url: chrome.runtime.getURL("unproxied.html") });
    }
}

// --- status ------------------------------------------------------------------

// The state is drawn into the icon rather than shown as a badge: Chrome's
// badge is a pill across the bottom of the icon that cannot be moved, and
// covers it. So the letter sits small in the top left and the state is a dot
// in the bottom right; the tooltip carries the words.
const STATUS = {
    off:     { color: "#d70015", mark: "bar" },
    bad:     { color: "#d70015", mark: "!" },
    warn:    { color: "#b25000", mark: "~" },
    ok:      { color: "#248a3d", mark: "" },
    unknown: { color: "#6e6e73", mark: "?" },
};

function icon(level) {
    const { color, mark } = STATUS[level];
    const images = {};
    for (const size of [16, 32]) {
        const c = new OffscreenCanvas(size, size);
        const g = c.getContext("2d");
        const box = size * 0.62;
        g.fillStyle = "#5f6368";
        g.beginPath();
        g.roundRect(0, 0, box, box, box * 0.22);
        g.fill();
        g.fillStyle = "#fff";
        g.font = `bold ${Math.round(box * 0.8)}px -apple-system, BlinkMacSystemFont, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("v", box / 2, box * 0.44);

        // Cut out a ring around the dot, so it reads as separate from the
        // letter's corner on any toolbar colour.
        const r = size * 0.25, x = size - r, y = size - r;
        g.globalCompositeOperation = "destination-out";
        g.beginPath();
        g.arc(x, y, r + size * 0.06, 0, 2 * Math.PI);
        g.fill();
        g.globalCompositeOperation = "source-over";
        g.fillStyle = color;
        g.beginPath();
        g.arc(x, y, r, 0, 2 * Math.PI);
        g.fill();
        g.fillStyle = "#fff";
        if (mark === "bar") {
            g.fillRect(x - r * 0.55, y - r * 0.16, r * 1.1, r * 0.32);
        } else if (mark && size >= 32) {
            // At 16px a glyph in a 4px dot is noise; the colour says enough.
            g.font = `bold ${Math.round(r * 1.5)}px -apple-system, BlinkMacSystemFont, sans-serif`;
            g.fillText(mark, x, y + r * 0.08);
        }
        images[size] = g.getImageData(0, 0, size, size);
    }
    return chrome.action.setIcon({ imageData: images });
}

function judge(s) {
    const lines = [];
    const sb = s.singbox || {}, up = s.upstream || {}, ex = s.exits || {};
    lines.push(`mode: ${s.mode || "unknown"}${s.home ? " (home)" : ""}`);
    if (up.node) lines.push(`node: ${up.node}`);
    lines.push(`exit: ${ex.pinned || "none"}`);
    if (ex.incognito) lines.push(`incognito exit: ${ex.incognito}`);
    let level = "ok";
    if (!sb.running) { level = "bad"; lines.unshift("sing-box is not running"); }
    else if (!sb.pinnedListening) { level = "bad"; lines.unshift("the pinned port is not listening"); }
    else if (!ex.pinned) { level = "bad"; lines.unshift("no exit - the chain is down"); }
    else if (ex.expected && ex.pinned !== ex.expected) { level = "bad"; lines.unshift("exit is NOT the expected address"); }
    else if (up.outage || up.trouble) { level = "warn"; lines.unshift("the upstream is in trouble"); }
    return { level, lines };
}

async function refreshStatus() {
    const state = await session.get("state");
    let level, lines;
    if (state === "on") {
        try {
            const port = await session.get("statusPort", 8787);
            const r = await fetch(`http://127.0.0.1:${port}/status.json`, { cache: "no-store" });
            ({ level, lines } = judge(await r.json()));
        } catch {
            level = "unknown";
            lines = ["status server not reachable"];
        }
    } else if (state === "forced") {
        level = "off";
        lines = ["NOT on the chain - unblocked by hand for this session"];
    } else {
        level = "off";
        lines = ["NOT on the chain - pages are blocked"];
    }
    await icon(level);
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: ["vpnchain", ...lines].join("\n") });
}

// Created only when missing: recreating it at every service worker start
// would push the next refresh back each time.
chrome.alarms.get("status").then((a) => a || chrome.alarms.create("status", { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "status") refreshStatus(); });

// The dashboard when on the chain, the explanation when not.
chrome.action.onClicked.addListener(async () => {
    if ((await session.get("state")) === "on") {
        const port = await session.get("statusPort", 8787);
        chrome.tabs.create({ url: `http://127.0.0.1:${port}/` });
    } else {
        chrome.tabs.create({ url: chrome.runtime.getURL("unproxied.html") });
    }
    refreshStatus();
});

// --- explain -----------------------------------------------------------------

// Errors that are not the chain refusing anything.
const NOT_REFUSALS = new Set(["net::ERR_ABORTED", "net::ERR_BLOCKED_BY_CLIENT"]);

chrome.webNavigation.onErrorOccurred.addListener(async (d) => {
    if (d.frameId !== 0 || !/^https?:/.test(d.url)) return;
    if (d.error === "net::ERR_BLOCKED_BY_CLIENT" && !(await lifted())) {
        const ids = await session.get("blockedTabs", []);
        if (!ids.includes(d.tabId)) await session.set("blockedTabs", [...ids, d.tabId]);
        return;
    }
    if (NOT_REFUSALS.has(d.error) || (await session.get("state")) !== "on") return;

    // Once per tab and address: Back from the explanation lands on the
    // failed address again, and explaining it again would be a trap.
    const key = `${d.tabId} ${d.url}`;
    const seen = await session.get("explainedUrls", []);
    if (seen.includes(key)) return;

    const reply = await ask({ action: "classify", host: new URL(d.url).hostname });
    if (!reply.ok || !reply.refused) return;
    const tab = await chrome.tabs.get(d.tabId).catch(() => null);
    if (!tab || tab.url !== d.url) return;
    await session.set("explainedUrls", [...seen.slice(-200), key]);
    const why = new URLSearchParams({ url: d.url, ...reply });
    chrome.tabs.update(d.tabId, { url: chrome.runtime.getURL("blocked.html") + "#" + why });
});

// --- pages -------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return;
    if (msg === "state") {
        Promise.all([session.get("state"), session.get("why", "")])
            .then(([state, why]) => respond({ state, why }));
        return true;
    }
    if (msg === "recheck") {
        verify().then(() => session.get("state")).then((state) => respond({ state }));
        return true;
    }
    if (msg === "force") {
        lift("forced").then(() => respond({ state: "forced" }));
        return true;
    }
});

// --- incognito shortcut -------------------------------------------------------

// The incognito shortcut, which the browser's own incognito mode no longer
// answers (vpnchain disables it), opens the incognito browser instead.
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== "incognito") return;
    const reply = await ask({ action: "incognito" });
    if (!reply.ok) console.warn(`vpnchain: ${reply.error}`);
});

chrome.runtime.onInstalled.addListener(() => register().then(verify));
chrome.runtime.onStartup.addListener(() => register().then(verify));
// A service worker restarted mid-session finds the answer already in place.
verify();
