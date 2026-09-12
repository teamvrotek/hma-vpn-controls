import { ACTION_UUID, HOLD_MS, normalizeSettings, chooseRandomMask } from "./config.js";
import { MASKS, DEFAULT_MASK } from "./masks.js";
import { renderButton } from "./renderer.js";
import { createSession } from "./session.js";
import { createMaskMotion } from "./mask-motion.js";
import { createTongueEasterEgg } from "./easter-egg.js";

const VISUAL_STATE = { connected: "on", disconnected: "off", connecting: "connecting", disconnecting: "disconnecting", unknown: "unknown" };
const TRANSITIONS = new Set(["connecting", "disconnecting"]);

export function registerControl(streamDeck, SingletonAction, bridge, openHma, random = Math.random) {
    const visible = new Map();
    const appearances = new Map();
    let connectionGeneration = 0, lastConnection = null, awaitingConnection = true, lastCompletion = 0, pendingIdentity = false;
    let data, lastInspector = "", previousState = "unknown";
    const session = createSession(bridge, snapshot => {
        const state = snapshot.status.state;
        const identityOperation = ["reconnect", "next-country"].includes(snapshot.operation);
        if (["disconnected", "connecting", "disconnecting"].includes(state) && !identityOperation) awaitingConnection = true;
        const completed = snapshot.completion?.id > lastCompletion ? snapshot.completion : null;
        if (completed) {
            lastCompletion = completed.id;
            pendingIdentity = completed.ok && ["reconnect", "next-country"].includes(completed.command);
        }
        const identity = { countryCode: snapshot.status.countryCode, virtualIp: snapshot.status.virtualIp };
        const identityChanged = lastConnection && Object.keys(identity).some(key => identity[key] && lastConnection[key] && identity[key] !== lastConnection[key]);
        const isConnected = state === "connected" && !snapshot.operation;
        const identityCompleted = isConnected && pendingIdentity;
        const newConnection = isConnected && (awaitingConnection || !lastConnection || identityChanged || identityCompleted);
        const firstConnection = newConnection && !lastConnection && previousState === "unknown";
        if (newConnection) {
            connectionGeneration++;
            lastConnection = identity;
            awaitingConnection = false;
            pendingIdentity = false;
        } else if (isConnected) {
            // Missing optional metadata is not evidence of a different connection.
            for (const key of Object.keys(identity)) if (identity[key]) lastConnection[key] = identity[key];
        }
        previousState = state;
        data = snapshot;
        for (const entry of visible.values()) syncAppearance(entry, firstConnection);
        render().catch(report);
    });
    data = session.snapshot();
    const report = error => streamDeck.logger.error("HMA VPN Controls:", error?.message || "Unknown error");

    function syncAppearance(entry, immediate = false) {
        const saved = appearances.get(entry.action.id);
        const isConnected = data.status.state === "connected" && !data.operation;
        const changed = saved?.setting !== entry.settings.mask;
        let mask = saved?.mask || null;
        if (entry.settings.mask !== "random") mask = entry.settings.mask;
        else if (isConnected && (changed || !mask || saved.generation !== connectionGeneration)) mask = chooseRandomMask(mask, random);
        appearances.set(entry.action.id, { setting: entry.settings.mask, mask,
            generation: isConnected ? connectionGeneration : changed && entry.settings.mask === "random" ? -1 : saved?.generation ?? -1 });
        entry.mask = mask || DEFAULT_MASK;
        entry.motion ??= createMaskMotion(entry.mask, isConnected ? 1 : 0);
        entry.motion.target(entry.mask, isConnected, Date.now(), immediate || data.status.state === "unknown");
        if (data.busy || data.status.state !== "disconnected") entry.tongue = 0;
    }

    function options(entry, now = Date.now()) {
        const operationState = { connect: "connecting", disconnect: "disconnecting", reconnect: "reconnecting", "next-country": "reconnecting" }[data.operation];
        const motion = entry.motion.frame(now);
        return { status: operationState || VISUAL_STATE[data.status.state] || "unknown", mask: motion.mask,
            progress: motion.progress, tongueProgress: entry.tongue || 0, showFlag: entry.settings.showFlag,
            countryCode: data.status.countryCode, phase: (now % 1400) / 1400, busy: data.busy,
            holdProgress: entry.down === null ? 0 : Math.min(1, (now - entry.down) / HOLD_MS) };
    }

    async function sendStatus(force = false) {
        const selected = streamDeck.ui.action;
        const entry = selected && visible.get(selected.id);
        if (!entry) return;
        const payload = { type: "statusUpdate", data: { ...data, settings: entry.settings, masks: MASKS,
            preview: renderButton(options(entry)) } };
        const serialized = JSON.stringify(payload);
        if (!force && lastInspector === serialized) return;
        lastInspector = serialized;
        await streamDeck.ui.sendToPropertyInspector(payload);
    }

    async function renderOne(entry) {
        if (entry.rendering) { entry.again = true; return; }
        entry.rendering = true;
        try {
            do {
                entry.again = false;
                if (visible.get(entry.action.id) !== entry) return;
                const image = renderButton(options(entry));
                if (image !== entry.image) { await entry.action.setImage(image); entry.image = image; }
            } while (entry.again);
        } finally { entry.rendering = false; }
    }

    async function render() {
        const results = await Promise.allSettled([...visible.values()].map(renderOne));
        for (const result of results) if (result.status === "rejected") report(result.reason);
        await sendStatus();
    }

    async function inspectorReady() {
        await session.refresh();
        await sendStatus(true);
        await session.loadCountries();
        await sendStatus(true);
    }

    class VpnControl extends SingletonAction {
        constructor() { super(); this.manifestId = ACTION_UUID; }
        async onWillAppear(ev) {
            const entry = { action: ev.action, settings: normalizeSettings(ev.payload.settings), down: null, image: "", rendering: false, tongue: 0, egg: createTongueEasterEgg() };
            visible.set(ev.action.id, entry);
            syncAppearance(entry);
            await render().catch(report);
            await session.refresh();
        }
        onWillDisappear(ev) { visible.delete(ev.action.id); }
        async onDidReceiveSettings(ev) {
            const entry = visible.get(ev.action.id);
            if (!entry) return;
            entry.settings = normalizeSettings(ev.payload.settings);
            entry.down = null;
            syncAppearance(entry);
            await render().catch(report);
        }
        async onPropertyInspectorDidAppear() { lastInspector = ""; await inspectorReady().catch(report); }
        onPropertyInspectorDidDisappear() { lastInspector = ""; }
        onKeyDown(ev) {
            const entry = visible.get(ev.action.id);
            if (entry && !data.busy && entry.down === null) entry.down = Date.now();
        }
        async onKeyUp(ev) {
            const entry = visible.get(ev.action.id);
            if (!entry || entry.down === null) return;
            const held = Date.now() - entry.down;
            entry.down = null;
            const result = await session.press(held, entry.settings);
            if (!result.ok) {
                await ev.action.showAlert().catch(report);
                if (streamDeck.ui.action?.id === ev.action.id) await streamDeck.ui.sendToPropertyInspector({ type: "error", message: result.message }).catch(report);
            }
            await render().catch(report);
        }
        async onSendToPlugin(ev) {
            try {
                switch (ev.payload?.type) {
                    case "getStatus": await inspectorReady(); break;
                    case "refreshStatus": await session.refresh(); await session.loadCountries(); await sendStatus(true); break;
                    case "openHma": await openHma(); await inspectorReady(); break;
                    case "getHma": await streamDeck.system.openUrl("https://www.hidemyass.com/en-us/download-vpn-mac"); break;
                    case "openAccessibility": await streamDeck.system.openUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"); break;
                }
            } catch (error) {
                report(error);
                await streamDeck.ui.sendToPropertyInspector({ type: "error", message: error.message }).catch(report);
            }
        }
    }
    streamDeck.actions.registerAction(new VpnControl());
    const animationTimer = setInterval(() => {
        const now = Date.now();
        let animate = data.busy || TRANSITIONS.has(data.status.state);
        for (const entry of visible.values()) {
            const motion = entry.motion.frame(now);
            const eligible = data.status.state === "disconnected" && !data.busy && entry.down === null && motion.progress === 0 && !motion.animating;
            const tongue = entry.egg.update(now, eligible);
            if (motion.animating || entry.wasAnimating || entry.down !== null || tongue !== entry.tongue) animate = true;
            entry.wasAnimating = motion.animating;
            entry.tongue = tongue;
        }
        if (visible.size && animate) render().catch(report);
    }, 65);
    const pollTimer = setInterval(() => { if (visible.size) session.refresh().catch(report); }, 3000);
    animationTimer.unref?.(); pollTimer.unref?.();
    return { session, visible, dispose() { clearInterval(animationTimer); clearInterval(pollTimer); visible.clear(); appearances.clear(); } };
}
