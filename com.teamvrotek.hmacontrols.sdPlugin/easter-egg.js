// A brief tongue peek after two to ten uninterrupted minutes without a mask.
export function createTongueEasterEgg(random = Math.random) {
    let due = null, started = null;
    const schedule = now => now + 120000 + Math.max(0, Math.min(1, random())) * 480000;
    return {
        update(now, eligible) {
            if (!eligible) { due = null; started = null; return 0; }
            if (due === null) { due = schedule(now); return 0; }
            if (started === null && now >= due) started = now;
            if (started === null) return 0;
            const elapsed = now - started;
            if (elapsed >= 1100) { started = null; due = schedule(now); return 0; }
            if (elapsed < 180) return elapsed / 180;
            if (elapsed < 850) return 1;
            return (1100 - elapsed) / 250;
        },
    };
}
