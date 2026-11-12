// The explanation for a browser launched without the pinned proxy, and the
// two ways out short of relaunching: check again, or lift the block by hand.
const $ = (id) => document.getElementById(id);

function show({ state, why }) {
    for (const id of ["off", "forced", "on"]) $(id).hidden = true;
    const shown = state === "on" || state === "forced" ? state : "off";
    $(shown).hidden = false;
    $("title").textContent = state === "on" ? "On the chain" : "This browser is not on the chain";
    $("title").className = state === "on" ? "" : "bad";
    if (why) {
        $("why").textContent = why;
        $("why").hidden = false;
    }
}

$("recheck").addEventListener("click", async () => show(await chrome.runtime.sendMessage("recheck")));
$("force").addEventListener("click", async () => show(await chrome.runtime.sendMessage("force")));
show(await chrome.runtime.sendMessage("state"));
