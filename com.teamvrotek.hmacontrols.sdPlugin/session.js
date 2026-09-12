import { HOLD_MS, normalizeSettings, pressIntent } from "./config.js";

const UNKNOWN = { state: "unknown", countryCode: null, countryName: null, virtualIp: null };
const NO_CAPABILITIES = { connect: false, disconnect: false, reconnect: false, countries: false, nextCountry: false };
const STATES = new Set(["connected", "disconnected", "connecting", "disconnecting", "unknown"]);
const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const countryCode = value => typeof value === "string" && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : null;
const errorMessage = (error, fallback) => typeof error?.message === "string" && error.message ? error.message : fallback;

function cleanStatus(status) {
    status = record(status);
    return {
        state: STATES.has(status.state) ? status.state : "unknown",
        countryCode: countryCode(status.countryCode),
        countryName: typeof status.countryName === "string" ? status.countryName.slice(0, 100) : null,
        virtualIp: typeof status.virtualIp === "string" ? status.virtualIp.slice(0, 64) : null,
    };
}

export function createSession(bridge, onChange = () => {}) {
    let status = { ...UNKNOWN }, capabilities = { ...NO_CAPABILITIES };
    let message = "Reading HMA status…", errorCode = null, busy = false, operation = null, completion = null, completionId = 0;
    let countries = [], epoch = 0, polling = null, loadingCountries = null, lastCountry = null;
    const snapshot = () => ({ status: { ...status }, capabilities: { ...capabilities },
        message, errorCode, busy, operation, completion: completion && { ...completion }, countries: countries.map(country => ({ ...country })) });
    const changed = () => onChange(snapshot());

    function apply(response) {
        response = record(response);
        const ok = response.ok === true;
        status = cleanStatus(response.status);
        if (["connected", "disconnected"].includes(status.state) && status.countryCode) lastCountry = status.countryCode;
        capabilities = Object.fromEntries(Object.keys(NO_CAPABILITIES).map(key => [key, response.capabilities?.[key] === true]));
        message = ok ? "" : errorMessage(response.error, "HMA could not complete the action.");
        errorCode = !ok && typeof response.error?.code === "string" ? response.error.code : null;
        const result = record(response.result);
        const catalog = Array.isArray(result.countries) ? result.countries : response.countries;
        if (Array.isArray(catalog)) {
            countries = catalog.flatMap(item => {
                item = record(item);
                const code = countryCode(item.code);
                return code && typeof item.name === "string" ? [{ code, name: item.name.slice(0, 100) }] : [];
            });
        }
        return ok;
    }

    function failed(error) {
        status = { ...UNKNOWN };
        capabilities = { ...NO_CAPABILITIES };
        message = errorMessage(error, "Could not read HMA.");
        errorCode = null;
    }

    async function refresh() {
        if (busy || loadingCountries) return snapshot();
        if (polling) return polling;
        const generation = epoch;
        polling = (async () => {
            try {
                const response = await bridge.invoke("status");
                if (epoch === generation && !busy) { apply(response); changed(); }
            } catch (error) {
                if (epoch === generation && !busy) { failed(error); changed(); }
            } finally { polling = null; }
            return snapshot();
        })();
        return polling;
    }

    async function loadCountries() {
        if (countries.length || busy || !capabilities.countries) return snapshot();
        if (loadingCountries) return loadingCountries;
        const generation = ++epoch;
        loadingCountries = (async () => {
            try {
                const response = await bridge.invoke("countries");
                if (epoch === generation && !busy) { apply(response); changed(); }
            } catch (error) {
                if (epoch === generation && !busy) { message = errorMessage(error, "Could not read HMA's recent locations."); changed(); }
            } finally { loadingCountries = null; }
            return snapshot();
        })();
        return loadingCountries;
    }

    async function press(duration, input) {
        const settings = normalizeSettings(input);
        if (duration >= HOLD_MS && settings.longPress === "none") return { ok: true };
        if (busy || loadingCountries) return { ok: false, message: "HMA is already working. Wait a moment." };
        busy = true;
        ++epoch;
        message = "";
        errorCode = null;
        changed();
        try {
            // Re-read before deciding on/off, including changes made directly in HMA.
            const fresh = await bridge.invoke("prepare");
            if (!apply(fresh)) return { ok: false, message };
            const intent = pressIntent(duration, settings, status, capabilities);
            if (intent.error) { message = intent.error; return { ok: false, message }; }
            if (!intent.command) return { ok: true };
            operation = intent.command;
            changed();
            const options = { countries: intent.countries };
            // A closed HMA window may hide the off-state selection. Retain only a country actually read from HMA.
            if (intent.command === "next-country" && status.state === "disconnected" && !status.countryCode && lastCountry) {
                options.currentCountry = lastCountry;
            }
            const response = await bridge.invoke(intent.command, options);
            const ok = apply(response);
            completion = { id: ++completionId, command: intent.command, ok };
            if (ok && intent.command === "reconnect") {
                const didChange = response.result?.ipChanged;
                message = didChange === true ? "Identity changed. New IP assigned."
                    : didChange === false ? "HMA returned the same IP."
                        : "Connected again. HMA did not expose the IP to verify a change.";
            }
            if (ok && intent.command === "next-country") message = `Connected to ${status.countryName || status.countryCode || "the next country"}.`;
            return { ok, message };
        } catch (error) {
            if (operation) completion = { id: ++completionId, command: operation, ok: false };
            failed(error);
            return { ok: false, message };
        } finally {
            operation = null;
            busy = false;
            changed();
        }
    }

    return { snapshot, refresh, loadCountries, press };
}
