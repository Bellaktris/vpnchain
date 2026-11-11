// Sends a top-level navigation to any wrapper in rules.js to unwrap.html
// instead, with the wrapped link as its fragment, before a request is made -
// so the tracker is never contacted, not even to be refused.
//
// The page's address carries a per-session ID (use_dynamic_url), which no web
// page can guess and probe for, so the rules are written afresh at every
// browser start as well as at install.
import { RULES } from "./rules.js";

async function register() {
    const page = chrome.runtime.getURL("unwrap.html");
    const old = await chrome.declarativeNetRequest.getDynamicRules();
    const rules = [];
    for (const [i, r] of RULES.entries()) {
        const ok = await chrome.declarativeNetRequest.isRegexSupported({ regex: r.filter + ".*" });
        if (!ok.isSupported) {
            console.warn(`link-unwrap: ${r.name}: filter rejected (${ok.reason})`);
            continue;
        }
        rules.push({
            id: i + 1,
            priority: 1,
            action: { type: "redirect", redirect: { regexSubstitution: page + "#\\0" } },
            condition: { regexFilter: r.filter + ".*", resourceTypes: ["main_frame"] },
        });
    }
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: old.map((r) => r.id),
        addRules: rules,
    });
}

chrome.runtime.onInstalled.addListener(register);
chrome.runtime.onStartup.addListener(register);
