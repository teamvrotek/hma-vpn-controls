import { MASKS } from "./masks.js";

export const HOLD_MS = 700;
export const ACTION_UUID = "com.teamvrotek.hmacontrols.control";
const maskIds = new Set(MASKS.map(mask => mask.id));

export function normalizeSettings(input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input)) input = {};
    const longPress = ["reconnect", "next-country", "none"].includes(input.longPress) ? input.longPress : "reconnect";
    const values = Array.isArray(input.countries) ? input.countries : [];
    const countries = [...new Set(values.filter(value => typeof value === "string")
        .map(value => value.trim().toUpperCase()).filter(value => /^[A-Z]{2}$/.test(value)))].slice(0, 32);
    const mask = input.mask === "random" || maskIds.has(input.mask) ? input.mask : "random";
    return { longPress, countries, mask, showFlag: input.showFlag !== false };
}

export function chooseRandomMask(previous, random = Math.random) {
    const choices = MASKS.filter(mask => mask.id !== previous);
    return choices[Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))].id;
}

// Make one decision on release; a hold can never also trigger a tap.
export function pressIntent(duration, settings, status, capabilities = {}) {
    if (!["connected", "disconnected"].includes(status.state)) {
        return { error: "Wait until HMA reports whether the VPN is on or off." };
    }
    if (duration < HOLD_MS) {
        const command = status.state === "connected" ? "disconnect" : "connect";
        return capabilities[command] ? { command } : { error: "Open HMA and check its connection controls." };
    }
    if (settings.longPress === "none") return { command: null };
    if (settings.longPress === "reconnect") {
        const command = status.state === "connected" ? "reconnect" : "connect";
        return capabilities[command] ? { command } : { error: "HMA's connection control is not available right now." };
    }
    if (!capabilities.nextCountry) return { error: "Country switching is not available in HMA right now." };
    if (settings.countries.length < 2) return { error: "Choose at least two countries for rotation." };
    return { command: "next-country", countries: settings.countries };
}
