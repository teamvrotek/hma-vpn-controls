// Original donkey artwork in the same cream and charcoal palette as Caffeine tracker.
import { FLAGS } from "./flags.js";
import { DEFAULT_MASK, renderMask } from "./masks.js";

const BG = "#101111";
const CREAM = "#F5EDDE";
const MUTED = "#77776F";
const BUSY = new Set(["connecting", "disconnecting", "reconnecting"]);
const STATES = new Set(["off", "on", ...BUSY, "error", "unknown"]);

const clamp = (value, fallback = 0) => Number.isFinite(Number(value))
    ? Math.max(0, Math.min(1, Number(value))) : fallback;
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[char]));

function donkey() {
    return `<g data-art="donkey">
        <path d="M44 67C33 52 26 23 33 13C42 1 57 17 61 48L59 63Z" fill="${CREAM}"/>
        <path d="M43 47C38 34 36 20 39 19C44 19 49 32 51 47Z" fill="${BG}"/>
        <path d="M83 48C87 19 99 4 108 12C118 21 109 50 101 67L84 63Z" fill="${CREAM}"/>
        <path d="M94 47C97 32 102 20 106 19C109 22 103 39 100 47Z" fill="${BG}"/>
        <path d="M42 53C46 43 58 40 72 40C88 40 100 44 103 57L109 82C114 99 101 117 73 119C45 118 30 103 35 83Z" fill="${CREAM}"/>
        <path d="M61 42L60 34L71 39L78 31L80 40L90 37L85 49L78 45L71 51L67 44Z" fill="${BG}"/>
        <ellipse cx="55" cy="67" rx="4" ry="6" fill="${BG}"/>
        <ellipse cx="89" cy="67" rx="4" ry="6" fill="${BG}"/>
        <path d="M51 83C59 79 86 79 94 83C100 86 104 94 102 103C98 115 47 115 42 103C40 94 45 86 51 83Z" fill="${CREAM}" stroke="${BG}" stroke-width="4"/>
        <ellipse cx="57" cy="94" rx="3.2" ry="4.5" transform="rotate(-22 57 94)" fill="${BG}"/>
        <ellipse cx="87" cy="94" rx="3.2" ry="4.5" transform="rotate(22 87 94)" fill="${BG}"/>
        <path d="M63 105Q72 109 81 105" fill="none" stroke="${BG}" stroke-width="3.5" stroke-linecap="round"/>
    </g>`;
}

function countryFlag(code) {
    if (!code) return "";
    const body = FLAGS[code.toLowerCase()];
    return `<g data-country="${code}">
        <rect x="56" y="118" width="32" height="25" rx="3" fill="${BG}"/>
        ${body
            ? `<defs><clipPath id="key-country-clip"><rect x="58" y="120" width="28" height="21"/></clipPath></defs><g clip-path="url(#key-country-clip)"><g transform="translate(58 120) scale(.04375)">${body}</g></g>`
            : `<text x="72" y="137" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" fill="${CREAM}">${code}</text>`}
    </g>`;
}

function statusCue(status, phase, busy) {
    if (busy || BUSY.has(status)) {
        const turn = ((Number(phase) || 0) % 1) * 360;
        return `<g data-cue="busy"><circle cx="15" cy="126" r="7" fill="none" stroke="${MUTED}" stroke-width="3" opacity=".3"/><path d="M15 119A7 7 0 0 1 22 126" fill="none" stroke="${CREAM}" stroke-width="3" stroke-linecap="round" transform="rotate(${turn.toFixed(1)} 15 126)"/></g>`;
    }
    if (status === "error") {
        return `<g data-cue="error"><circle cx="15" cy="126" r="10" fill="#FF7D78"/><path d="M15 120V127M15 131V131.2" stroke="${BG}" stroke-width="3" stroke-linecap="round"/></g>`;
    }
    if (status === "unknown") {
        return `<g data-cue="unknown"><circle cx="15" cy="126" r="10" fill="${MUTED}"/><text x="15" y="132" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700" fill="${BG}">?</text></g>`;
    }
    return "";
}

function tongue(progress) {
    const amount = clamp(progress);
    if (amount <= 0) return "";
    const eased = amount * amount * (3 - 2 * amount);
    return `<g data-art="tongue" data-tongue-progress="${amount.toFixed(3)}" transform="translate(72 107) scale(1 ${eased.toFixed(3)}) translate(-72 -107)" opacity="${Math.min(1, amount * 4).toFixed(3)}">
        <path d="M66.5 106.5Q72 109 77.5 106.5V115.5Q77.5 122 72 122Q66.5 122 66.5 115.5Z" fill="#CF6A65" stroke="${BG}" stroke-width="2.3" stroke-linejoin="round"/>
        <path d="M72 109.5V115" fill="none" stroke="${BG}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
    </g>`;
}

/**
 * Draw one key. progress is the accessory position, 0 removed and 1 worn.
 * Animate on only after HMA confirms connection. phase is a looping 0..1 busy cue.
 * countryCode is the selected country while off, and the confirmed country while on.
 * Reconnecting accepts the current mask's removal position, then stays unmasked at 0.
 * tongueProgress reveals a small tongue only after the disconnected mask is fully removed.
 * busy shows progress during preparation without changing the known connection state.
 */
export function renderKey(options = {}) {
    const status = STATES.has(options.status) ? options.status : "unknown";
    const code = /^[a-z]{2}$/i.test(options.countryCode || "") ? options.countryCode.toUpperCase() : "";
    const showFlag = options.showFlag !== false;
    const hasFlag = showFlag && Boolean(code);
    const wornByDefault = status === "on" || status === "disconnecting";
    const allowedProgress = wornByDefault || status === "off" || status === "reconnecting";
    const progress = allowedProgress ? clamp(options.progress ?? (wornByDefault ? 1 : 0)) : 0;
    const hold = clamp(options.holdProgress);
    const title = `HMA ${status}${code ? `, ${code}` : ""}`;
    const holdCue = hold > 0 ? `<rect x="8" y="3" width="${(128 * hold).toFixed(2)}" height="3" rx="1.5" fill="${CREAM}" opacity=".7"/>` : "";
    const characterTransform = hasFlag ? "translate(11.52 3) scale(.84)" : "translate(0 8)";
    const mask = options.mask || DEFAULT_MASK;
    const accessory = renderMask(mask, progress);
    const expression = status === "off" && progress === 0 ? tongue(options.tongueProgress) : "";
    const character = `<g data-layout="${hasFlag ? "flag" : "centered"}" transform="${characterTransform}">${donkey()}${expression}${accessory}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144" role="img" aria-label="${escapeXml(title)}"><title>${escapeXml(title)}</title><rect width="144" height="144" fill="${BG}"/>${character}${hasFlag ? countryFlag(code) : ""}${statusCue(status, options.phase, options.busy === true)}${holdCue}</svg>`;
}

export function renderButton(options = {}) {
    return `data:image/svg+xml,${encodeURIComponent(renderKey(options))}`;
}
