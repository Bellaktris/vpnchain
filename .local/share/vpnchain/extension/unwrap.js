// Reads the wrapped link from the fragment, decodes it, and replaces this page
// with the destination, so Back skips both. Without a destination to find,
// it says why instead of leaving a bare connection error.
import { unwrap } from "./rules.js";

const wrapped = location.hash.slice(1);
const dest = wrapped ? await unwrap(wrapped) : null;

if (dest) {
    location.replace(dest);
} else {
    let host = "";
    try { host = new URL(wrapped).host; } catch { host = ""; }
    document.getElementById("host").textContent = host || "a tracker";
    document.getElementById("link").textContent = wrapped;
    document.getElementById("failed").hidden = false;
}
