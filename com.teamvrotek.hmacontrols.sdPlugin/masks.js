// Original SVG accessories for the HMA VPN Controls donkey. All artwork uses one palette.
const MASK_BG = "#101111";
const MASK_CREAM = "#F5EDDE";

export const DEFAULT_MASK = "sunglasses";
export const MASKS = Object.freeze([
    { id: "sunglasses", label: "Sunglasses" },
    { id: "snow-goggles", label: "Snow goggles" },
    { id: "surgical-mask", label: "Surgical mask" },
    { id: "welders-mask", label: "Welder's mask" },
    { id: "anonymous-mask", label: "Anonymous mask" },
    { id: "ski-mask", label: "Ski mask" },
    { id: "masquerade-mask", label: "Masquerade mask" },
    { id: "aviators-cigar", label: "Aviators and cigar" },
    { id: "vr-headset", label: "VR headset" },
    { id: "jet-fighter-helmet", label: "Jet fighter helmet" },
    { id: "gimp-mask", label: "Gimp mask" },
    { id: "motocross-helmet", label: "Motocross helmet" },
    { id: "scuba-mask", label: "Scuba mask" },
].map(mask => Object.freeze(mask)));

const maskFrame = (shape, width = 3.5) => `<path d="${shape}" fill="${MASK_BG}" stroke="${MASK_BG}" stroke-width="8" stroke-linejoin="round"/><path d="${shape}" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="${width}" stroke-linejoin="round"/>`;
const maskShine = (x = 46, y = 60) => `<path d="M${x} ${y + 12}L${x + 7} ${y}M${x + 5} ${y + 13}L${x + 12} ${y + 1}" fill="none" stroke="${MASK_CREAM}" stroke-width="2.8" stroke-linecap="round"/>`;
const maskEyes = `<ellipse cx="55" cy="67" rx="4" ry="6" fill="${MASK_BG}"/><ellipse cx="89" cy="67" rx="4" ry="6" fill="${MASK_BG}"/>`;
const maskGoggleShape = "M40 52Q72 44 104 52Q111 54 109 67L106 79Q104 87 94 88L86 87Q82 85 77 77Q72 71 67 77Q62 85 58 87L50 88Q40 87 38 79L35 65Q33 55 40 52Z";

const MASK_ART = Object.freeze({
    sunglasses: {
        motion: "down",
        svg: `<path d="M38 60L45 62M99 62L106 60M66 64Q72 60 78 64" fill="none" stroke="${MASK_BG}" stroke-width="5" stroke-linecap="round"/>
            <path d="M42 58Q54 56 68 60L67 72Q66 81 55 82Q44 81 43 72Z" fill="${MASK_BG}"/>
            <path d="M76 60Q90 56 102 58L101 72Q100 81 89 82Q78 81 77 72Z" fill="${MASK_BG}"/>
            <path d="M47 62L57 61L47 71ZM82 63L93 61L82 73Z" fill="${MASK_CREAM}" opacity=".42"/>`,
    },
    "snow-goggles": {
        motion: "down",
        svg: `<path d="M31 57H113V73H31Z" fill="${MASK_BG}"/>${maskFrame(maskGoggleShape)}${maskShine(45, 57)}`,
    },
    "surgical-mask": {
        motion: "up",
        svg: `<path d="M39 78Q31 85 43 103M105 78Q113 85 102 103" fill="none" stroke="${MASK_BG}" stroke-width="5"/>
            <path d="M39 83Q72 89 105 83L103 107Q72 130 41 107Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M47 92Q72 98 97 92M48 102Q72 109 96 102M54 113Q72 118 90 113" fill="none" stroke="${MASK_BG}" stroke-width="3.2" stroke-linecap="round"/>
            <path d="M35 59H30V69H35M109 59H114V69H109" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="3"/>
            <path d="M39 54Q57 49 67 55Q72 58 77 55Q90 49 105 54Q112 56 109 72Q107 82 94 83Q82 82 76 73Q72 68 68 73Q62 82 50 83Q37 82 35 72Q32 57 39 54Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="4"/>
            ${maskEyes}`,
    },
    "welders-mask": {
        motion: "flip",
        svg: `${maskFrame("M43 42Q72 36 101 42Q111 45 111 57L108 102Q105 122 72 123Q39 122 36 102L33 57Q33 45 43 42Z")}
            <rect x="31" y="55" width="6" height="13" rx="3" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.5"/>
            <rect x="107" y="55" width="6" height="13" rx="3" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.5"/>
            <rect x="47" y="63" width="50" height="20" rx="1.5" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="3.5"/>`,
    },
    "anonymous-mask": {
        motion: "up",
        svg: `<path d="M42 49Q72 36 102 49L107 80Q104 102 72 127Q40 102 37 80Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M45 59Q55 51 63 60M81 60Q89 51 100 59" fill="none" stroke="${MASK_BG}" stroke-width="4.5" stroke-linecap="round"/>
            <path d="M43 69Q54 61 65 69Q55 77 43 69ZM79 69Q90 61 101 69Q89 77 79 69Z" fill="${MASK_BG}"/>
            <path d="M72 69L66 84Q72 88 78 84" fill="none" stroke="${MASK_BG}" stroke-width="2.5" stroke-linecap="round"/>
            <path d="M43 86Q54 97 65 89Q71 82 72 88Q73 82 79 89Q90 97 101 86Q95 104 78 96L72 92L66 96Q49 104 43 86Z" fill="${MASK_BG}"/>
            <path d="M62 104H82L76 111Q78 119 72 124Q66 119 68 111Z" fill="${MASK_BG}"/>
            <path d="M44 93L54 107L48 103ZM100 93L90 107L96 103Z" fill="${MASK_BG}"/>`,
    },
    "ski-mask": {
        motion: "hood",
        svg: `${maskFrame("M45 45Q72 32 99 45Q113 55 113 81Q112 96 103 109L103 122Q72 134 41 122L41 109Q30 95 31 79Q31 56 45 45Z", 3)}
            <path d="M58 40L57 52M70 38V51M82 39L84 52M93 42L97 54" fill="none" stroke="${MASK_CREAM}" stroke-width="1.8"/>
            <ellipse cx="53" cy="69" rx="10.5" ry="12" fill="${MASK_CREAM}"/><ellipse cx="91" cy="69" rx="10.5" ry="12" fill="${MASK_CREAM}"/>
            <ellipse cx="53" cy="69" rx="4.5" ry="6.5" fill="${MASK_BG}"/><ellipse cx="91" cy="69" rx="4.5" ry="6.5" fill="${MASK_BG}"/>
            <ellipse cx="72" cy="103" rx="29" ry="18" fill="${MASK_CREAM}"/>
            <ellipse cx="72" cy="103" rx="26" ry="15" fill="none" stroke="${MASK_BG}" stroke-width="2"/>
            <ellipse cx="58" cy="99" rx="3" ry="4" fill="${MASK_BG}"/><ellipse cx="86" cy="99" rx="3" ry="4" fill="${MASK_BG}"/>
            <path d="M63 110Q72 114 81 110" fill="none" stroke="${MASK_BG}" stroke-width="3.2" stroke-linecap="round"/>`,
    },
    "masquerade-mask": {
        motion: "up",
        svg: `${maskFrame("M28 46Q48 57 62 51Q67 50 72 60Q78 50 84 51Q101 57 116 46Q116 75 104 85Q85 92 72 78Q59 92 40 85Q28 75 28 46Z", 3)}
            <path d="M39 65Q52 54 65 68Q52 83 39 65ZM79 68Q92 54 105 65Q92 83 79 68Z" fill="${MASK_CREAM}"/>
            <ellipse cx="54" cy="67" rx="4" ry="6" fill="${MASK_BG}"/><ellipse cx="90" cy="67" rx="4" ry="6" fill="${MASK_BG}"/>
            <path d="M34 56Q43 49 46 58M98 58Q103 49 110 56" fill="none" stroke="${MASK_CREAM}" stroke-width="1.8"/>
            <g fill="${MASK_CREAM}"><circle cx="36" cy="70" r="1.8"/><circle cx="42" cy="78" r="1.8"/><circle cx="53" cy="79" r="1.8"/><circle cx="58" cy="57" r="1.8"/><circle cx="72" cy="69" r="1.8"/><circle cx="86" cy="57" r="1.8"/><circle cx="91" cy="79" r="1.8"/><circle cx="102" cy="78" r="1.8"/><circle cx="108" cy="70" r="1.8"/></g>`,
    },
    "aviators-cigar": {
        motion: "down",
        svg: `<path d="M31 62H38M106 62H113M63 55Q72 51 81 55M39 51Q72 45 105 51" fill="none" stroke="${MASK_BG}" stroke-width="5" stroke-linecap="round"/>
            ${maskFrame("M39 54Q51 47 63 53Q70 57 65 68Q57 84 48 84Q36 84 34 68Q32 58 39 54Z", 2.8)}
            ${maskFrame("M81 53Q93 47 105 54Q112 58 110 68Q108 84 96 84Q87 84 79 68Q74 57 81 53Z", 2.8)}
            ${maskShine(40, 56)}${maskShine(85, 56)}
            <path d="M85 103L117 113Q121 114 124 108Q127 102 123 100L92 91Q86 91 83 96Q81 101 85 103Z" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.5"/>
            <ellipse cx="121" cy="107" rx="4.5" ry="7" transform="rotate(20 121 107)" fill="${MASK_CREAM}"/>
            <path d="M90 94Q86 98 88 103M99 97Q95 101 97 106" fill="none" stroke="${MASK_CREAM}" stroke-width="1.7"/>
            <path d="M126 93C116 83 132 79 126 68C138 80 124 83 129 89Z" fill="${MASK_CREAM}"/>`,
    },
    "vr-headset": {
        motion: "down",
        svg: `<path d="M28 56H116V73H28Z" fill="${MASK_BG}"/>
            ${maskFrame("M42 48Q73 44 103 49Q112 52 112 69Q112 85 100 87Q73 83 43 87Q29 86 29 69Q29 52 42 48Z", 4)}
            <path d="M36 52Q73 46 106 53" fill="none" stroke="${MASK_CREAM}" stroke-width="1.8"/>
            <rect x="113" y="57" width="5" height="15" rx="2.5" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.5"/>
            ${maskShine(42, 57)}`,
    },
    "jet-fighter-helmet": {
        motion: "down",
        svg: `<path d="M29 62Q30 30 71 30Q113 30 116 63L110 107Q100 126 72 128Q43 127 33 107Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="4"/>
            <path d="M53 32L60 52M88 32L83 52M32 60Q73 44 113 60" fill="none" stroke="${MASK_BG}" stroke-width="3.5"/>
            <path d="M27 61H35V72H27ZM109 61H117V72H109Z" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2"/>
            ${maskFrame(maskGoggleShape, 3.5)}${maskShine(45, 57)}
            <path d="M64 89Q72 78 80 89L89 110L81 124Q72 134 63 124L55 110Z" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="3"/>
            <circle cx="72" cy="109" r="12" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="3"/>
            <path d="M82 119C107 139 131 119 120 99" fill="none" stroke="${MASK_BG}" stroke-width="13" stroke-linecap="round"/>
            <path d="M82 119C107 139 131 119 120 99" fill="none" stroke="${MASK_CREAM}" stroke-width="9" stroke-linecap="round"/>
            <path d="M86 116L82 125M94 120L91 130M103 122L102 132M112 119L115 128M118 114L126 119M119 106L129 108M116 99L126 97" fill="none" stroke="${MASK_BG}" stroke-width="3"/>`,
    },
    "gimp-mask": {
        motion: "hood",
        svg: `${maskFrame("M45 44Q72 33 100 44Q116 55 113 83C113 108 94 125 72 126C49 125 31 108 31 84Q27 55 45 44Z", 3)}
            <path d="M65 39V36Q72 31 79 36V39M72 43V88" fill="none" stroke="${MASK_CREAM}" stroke-width="1.8" stroke-dasharray="4 3"/>
            <ellipse cx="53" cy="69" rx="10.5" ry="12" fill="${MASK_CREAM}"/><ellipse cx="91" cy="69" rx="10.5" ry="12" fill="${MASK_CREAM}"/>
            <ellipse cx="53" cy="69" rx="4.5" ry="6.5" fill="${MASK_BG}"/><ellipse cx="91" cy="69" rx="4.5" ry="6.5" fill="${MASK_BG}"/>
            <rect x="45" y="93" width="54" height="23" rx="11.5" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.8"/>
            <path d="M50 104H94M52 100V108M58 100V108M64 100V108M70 100V108M76 100V108M82 100V108M88 100V108" fill="none" stroke="${MASK_CREAM}" stroke-width="2"/>
            <rect x="91" y="102" width="5" height="14" rx="2.5" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.5"/>`,
    },
    "motocross-helmet": {
        motion: "down",
        svg: `<path d="M35 55Q40 35 72 31Q104 35 110 55L112 92Q109 115 73 130Q39 118 33 95Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="4"/>
            <path d="M23 50L53 32Q72 27 92 32L121 50L98 49Q72 40 46 49Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="3.5" stroke-linejoin="round"/>
            <path d="M39 44L50 37L46 43L55 43ZM105 44L94 37L98 43L89 43ZM66 32L63 42H82L78 32Z" fill="${MASK_BG}"/>
            ${maskFrame(maskGoggleShape, 3.5)}${maskShine(45, 57)}
            <path d="M35 86L52 96L72 87L92 96L109 86L106 105L73 129L40 106Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="3.5" stroke-linejoin="round"/>
            <path d="M43 98L55 104L55 113L45 106ZM101 98L89 104L89 113L99 106ZM64 102L70 98V122L63 118V112H67V108H63ZM80 102L74 98V122L81 118V112H77V108H81Z" fill="${MASK_BG}"/>`,
    },
    "scuba-mask": {
        motion: "up",
        svg: `<path d="M35 57H29V70H35M109 57H115V70H109" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2.8"/>
            <path d="M41 51Q58 47 68 52Q72 55 76 52Q87 47 104 51Q111 53 109 71Q107 84 95 85Q83 85 77 74Q72 67 67 74Q61 85 49 85Q36 84 35 71Q32 54 41 51Z" fill="${MASK_CREAM}" stroke="${MASK_BG}" stroke-width="6"/>
            <path d="M41 51Q58 47 68 52Q72 55 76 52Q87 47 104 51Q111 53 109 71Q107 84 95 85Q83 85 77 74Q72 67 67 74Q61 85 49 85Q36 84 35 71Q32 54 41 51Z" fill="none" stroke="${MASK_CREAM}" stroke-width="2.3"/>
            ${maskEyes}
            <path d="M72 75L64 88Q72 93 80 88Z" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="2"/>
            <path d="M85 112C113 125 121 106 108 98" fill="none" stroke="${MASK_BG}" stroke-width="13" stroke-linecap="round"/>
            <path d="M85 112C113 125 121 106 108 98" fill="none" stroke="${MASK_CREAM}" stroke-width="8" stroke-linecap="round"/>
            <circle cx="72" cy="109" r="17" fill="${MASK_BG}" stroke="${MASK_CREAM}" stroke-width="3.5"/>
            <path d="M63 102H81M61 109H83M63 116H81" fill="none" stroke="${MASK_CREAM}" stroke-width="2.8" stroke-linecap="round"/>
            <circle cx="122" cy="87" r="3.3" fill="none" stroke="${MASK_CREAM}" stroke-width="2"/><circle cx="128" cy="76" r="2.3" fill="none" stroke="${MASK_CREAM}" stroke-width="1.8"/>`,
    },
});

/** Draw one accessory at its resolved position, from removed (0) to worn (1). */
export function renderMask(id = DEFAULT_MASK, progress = 1) {
    const maskId = Object.hasOwn(MASK_ART, id) ? id : DEFAULT_MASK;
    const mask = MASK_ART[maskId];
    const amount = Number.isFinite(Number(progress)) ? Math.max(0, Math.min(1, Number(progress))) : 0;
    if (amount <= 0) return "";
    const eased = 1 - Math.pow(1 - amount, 3);
    const opacity = Math.min(1, amount * 4).toFixed(3);
    let transform;
    if (mask.motion === "flip") {
        const scaleY = .08 + .92 * eased;
        transform = `translate(0 ${(42 * (1 - scaleY)).toFixed(2)}) scale(1 ${scaleY.toFixed(3)})`;
    } else if (mask.motion === "hood") {
        const scaleY = .58 + .42 * eased;
        transform = `translate(0 ${(-48 * (1 - eased)).toFixed(2)}) translate(72 38) scale(${(.92 + .08 * eased).toFixed(3)} ${scaleY.toFixed(3)}) translate(-72 -38)`;
    } else if (mask.motion === "up") {
        // Keep upward entry inside the key while the accessory opens into its full height.
        transform = `translate(0 ${(12 * (1 - eased)).toFixed(2)}) translate(72 82) scale(1 ${(.72 + .28 * eased).toFixed(3)}) translate(-72 -82)`;
    } else {
        transform = `translate(0 ${(-48 * (1 - eased)).toFixed(2)})`;
    }
    return `<g data-art="mask" data-mask="${maskId}" data-motion="${mask.motion}" transform="${transform}" opacity="${opacity}">${mask.svg}</g>`;
}
