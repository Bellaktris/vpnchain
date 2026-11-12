// Why the chain refused a page, from what the native host found in the live
// sing-box config. The browser's own error would only say the connection
// failed, which is indistinguishable from the chain being down.
const $ = (id) => document.getElementById(id);
const why = new URLSearchParams(location.hash.slice(1));
const host = why.get("host");

// Country codes are lower case in the list names.
const COUNTRY = { ru: "Russia", cn: "China", ir: "Iran", by: "Belarus", kp: "North Korea" };
const country = (cc) => COUNTRY[cc] || cc.toUpperCase();

const b = (text) => Object.assign(document.createElement("strong"), { textContent: text });
const say = (el, ...parts) => el.replaceChildren(...parts.map((p) => typeof p === "string" ? document.createTextNode(p) : p));

$("url").textContent = why.get("url");
if (why.get("kind") === "tracker") {
    $("title").textContent = "Blocked tracker";
    say($("reason"), b(host), " is on the tracker blocklist, so the chain refuses every connection to it, from either browser.");
    say($("more"), "A link that goes through it and carries its destination opens that directly; one that carries only an ID stays blocked. The lists are set by BLOCKLIST_URL.");
} else if (why.get("kind") === "country") {
    $("title").textContent = "Kept out";
    const from = why.get("country") ? ["the ", b(country(why.get("country"))), " site list"]
                                    : ["the ", b("." + why.get("suffix").replace(/^\./, "")), " domain"];
    say($("reason"), b(host), " is in ", ...from, ", and the pinned browser refuses those countries' sites - visiting them from the pinned address ties it to them.");
    say($("more"), "Open it from a separate, unproxied browser. The countries are set by KEEP_OUT_COUNTRIES.");
} else {
    say($("reason"), "The chain's routing rules refuse ", b(host), ".");
}
// Back from here lands on the refused address, which fails again; two steps
// back is the page before it.
$("back").addEventListener("click", () => history.length > 2 ? history.go(-2) : history.back());
