// Link wrappers the tracker blocklist refuses whose destination travels in
// the link itself, so it can be read off without asking the tracker. Each
// rule is a filter - RE2 for declarativeNetRequest, and plain enough to be
// the same regex in JavaScript - and a decode() from the wrapped link to the
// destination, or null when this particular link carries none.
//
// Opaque wrappers (t.co, Constant Contact's rs6.net, Klaviyo's klclick,
// HubSpot, SendGrid) hold only an ID that the tracker's own server looks up,
// so there is nothing to decode: they have no rule and stay blocked.
//
// Two rules match on the shape of the link rather than the host, because
// both services serve it from their customers' own domains: Amazon SES
// (awstrack.me, click.redditmail.com) and Customer.io.

const isHttp = (s) => /^https?:\/\//i.test(s);

// The first named query parameter that is present.
function param(url, ...names) {
    const q = new URL(url).searchParams;
    for (const n of names) {
        const v = q.get(n);
        if (v) return v;
    }
    return null;
}

// Some wrappers drop the scheme from the destination.
function withScheme(s) {
    if (!s) return null;
    if (isHttp(s)) return s;
    return "https://" + s.replace(/^\/\//, "");
}

// A base64url token holding JSON, zlib-compressed by some services (Mailgun's
// start "eJ", the base64 of a zlib header). The destination is taken from the
// first of `keys` present, else the first http(s) string anywhere in it.
async function tokenUrl(token, keys) {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    let bytes = Uint8Array.from(atob(b64 + "===".slice((b64.length + 3) % 4)),
                                (c) => c.charCodeAt(0));
    if (bytes[0] === 0x78) {
        const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
        bytes = new Uint8Array(await new Response(s).arrayBuffer());
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    for (const k of keys) {
        if (typeof data[k] === "string" && isHttp(data[k])) return data[k];
    }
    const seen = [data];
    while (seen.length) {
        const v = seen.shift();
        if (typeof v === "string" && isHttp(v)) return v;
        if (v && typeof v === "object") seen.push(...Object.values(v));
    }
    return null;
}

export const RULES = [
    {   // Postmark: /3s/<host and path, percent-encoded>/... ; 3ns is plain http.
        name: "Postmark",
        filter: "^https?://track\\.pstmrk\\.it/3n?s/",
        decode(url) {
            const seg = new URL(url).pathname.split("/");
            const dest = decodeURIComponent(seg[2] || "");
            if (!dest) return null;
            return isHttp(dest) ? dest : (seg[1] === "3ns" ? "http://" : "https://") + dest;
        },
    },
    {   // Amazon SES: /L0/ or /CL0/<URL, percent-encoded>/1/...
        name: "Amazon SES",
        filter: "^https?://[^/]+/C?L0/https?(:|%3[Aa])",
        decode(url) {
            const m = new URL(url).pathname.match(/\/C?L0\/([^/]+)/);
            return m ? decodeURIComponent(m[1]) : null;
        },
    },
    {   // DoubleClick: adurl=, or the destination after ";?" in /ddm/ links.
        name: "DoubleClick",
        filter: "^https?://ad\\.doubleclick\\.net/",
        decode(url) {
            const a = param(url, "adurl");
            if (a) return a;
            const i = url.indexOf(";?");
            return i >= 0 && isHttp(url.slice(i + 2)) ? url.slice(i + 2) : null;
        },
    },
    {
        name: "Rakuten (LinkShare)",
        filter: "^https?://click\\.linksynergy\\.com/",
        decode: (url) => param(url, "murl"),
    },
    {
        name: "Skimlinks",
        filter: "^https?://go\\.skimresources\\.com/",
        decode: (url) => param(url, "url"),
    },
    {
        name: "VigLink",
        filter: "^https?://redirect\\.viglink\\.com/",
        decode: (url) => param(url, "u", "url"),
    },
    {   // urllink= is the destination without its scheme.
        name: "ShareASale",
        filter: "^https?://(www\\.)?shareasale\\.com/r\\.cfm",
        decode: (url) => withScheme(param(url, "urllink")),
    },
    {   // CJ, all of its click domains - the blocklist catches only two, but
        // they are one tracker. url=, or /links/<id>/type/dlg/[sid/<x>/]<URL>.
        name: "CJ Affiliate",
        filter: "^https?://(www\\.)?(anrdoezrs\\.net|dpbolvw\\.net|jdoqocy\\.com|kqzyfj\\.com|tkqlhce\\.com)/",
        decode(url) {
            const u = param(url, "url");
            if (u) return u;
            const m = url.match(/\/type\/dlg\/(?:sid\/[^/]+\/)?(https?:\/\/.+)$/);
            return m ? m[1] : null;
        },
    },
    {   // Customer.io: /e/c/<base64url JSON>/<signature>; "eyJ" opens '{"'.
        name: "Customer.io",
        filter: "^https?://[^/]+/e/c/eyJ",
        decode(url) {
            const m = new URL(url).pathname.match(/^\/e\/c\/([A-Za-z0-9_-]+)/);
            return m ? tokenUrl(m[1], ["href", "url"]) : null;
        },
    },
    {   // Mailgun, on the email.<domain> host it is served from: /c/<token>.
        name: "Mailgun",
        filter: "^https?://email\\.[^/]+/c/eJ",
        decode(url) {
            const m = new URL(url).pathname.match(/^\/c\/([A-Za-z0-9_-]+)/);
            return m ? tokenUrl(m[1], ["url", "l", "r"]) : null;
        },
    },
    {   // Substack's own hop, where its Mailgun links lead: /redirect/2/<token>.
        name: "Substack",
        filter: "^https?://([a-z0-9-]+\\.)?substack\\.com/redirect/2/eyJ",
        decode(url) {
            const m = new URL(url).pathname.match(/^\/redirect\/2\/([A-Za-z0-9_-]+)/);
            return m ? tokenUrl(m[1], ["e", "url"]) : null;
        },
    },
];

// Follows wrappers inside wrappers, up to a few hops. Returns the destination,
// or null when a wrapper's link holds none. Only http(s) is ever returned, so
// a decoded javascript: or data: URL cannot be navigated to.
export async function unwrap(url) {
    for (let hop = 0; hop < 5; hop++) {
        const rule = RULES.find((r) => new RegExp(r.filter, "i").test(url));
        if (!rule) return url;
        let next = null;
        try { next = await rule.decode(url); } catch { next = null; }
        if (!next || !isHttp(next)) return null;
        url = next;
    }
    return null;
}
