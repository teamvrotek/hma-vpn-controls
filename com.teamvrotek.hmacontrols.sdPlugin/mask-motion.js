const REMOVE_MS = 400;
const ADD_MS = 550;
const BARE_MS = 120;

// Keep one accessory in the scene. A replacement can only start after it is fully removed.
export function createMaskMotion(initialMask, initialProgress = 0) {
    let mask = initialMask, progress = initialProgress, targetMask = initialMask;
    let worn = initialProgress === 1, tween = null, bareSince = -Infinity;

    function animate(to, now) {
        tween = { from: progress, to, start: now, duration: (to ? ADD_MS : REMOVE_MS) * Math.abs(to - progress) };
    }

    function frame(now) {
        if (tween) {
            const amount = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
            const eased = 1 - (1 - amount) ** 3;
            progress = tween.from + (tween.to - tween.from) * eased;
            if (amount === 1) {
                progress = tween.to;
                if (!progress) bareSince = tween.start + tween.duration;
                tween = null;
            }
        }
        if (progress === 0 && tween?.to === 1 && (!worn || mask !== targetMask)) tween = null;
        if ((!worn || mask !== targetMask) && progress > 0) {
            if (tween?.to !== 0) animate(0, now);
        } else if (!tween && progress === 0 && worn && now >= bareSince + BARE_MS) {
            mask = targetMask;
            animate(1, now);
        }
        return { mask, progress, animating: Boolean(tween) || (worn && progress === 0) };
    }

    return {
        target(nextMask, shouldWear, now, immediate = false) {
            frame(now);
            targetMask = nextMask;
            worn = shouldWear;
            if (immediate) {
                mask = nextMask; progress = shouldWear ? 1 : 0; tween = null; bareSince = now;
            }
            return frame(now);
        },
        frame,
    };
}
