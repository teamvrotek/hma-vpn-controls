(() => {
    'use strict';

    const element = (id) => document.getElementById(id);
    const isPreview = new URLSearchParams(window.location.search).get('preview') === 'true';
    const longPressOptions = new Set(['reconnect', 'next-country', 'none']);
    let socket;
    let context;
    let actionUuid = 'com.teamvrotek.hmacontrols.control';
    let settings = { mask: 'random', showFlag: true, longPress: 'reconnect', countries: [] };
    let pendingSave = null;
    let confirmedSettings = '';
    let settingsReady = false;
    let connected = false;
    let lastData = {};
    let availableCountries = [];
    let lastCountryCatalog = '';
    let lastCountryOrder = '';
    let errorMessage = '';
    let countryDraftDirty = false;
    let masks = [];
    let lastMaskCatalog = '';
    let renderPreviewButton;
    let sampleRandomMask = 'sunglasses';

    const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

    function normalizeSettings(value = {}) {
        if (!isRecord(value)) value = {};
        return {
            mask: typeof value.mask === 'string' && /^[a-z][a-z0-9-]*$/.test(value.mask) ? value.mask : 'random',
            showFlag: value.showFlag !== false,
            longPress: longPressOptions.has(value.longPress) ? value.longPress : 'reconnect',
            countries: Array.isArray(value.countries)
                ? [...new Set(value.countries.filter((code) => typeof code === 'string').map((code) => code.trim().toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))].slice(0, 32)
                : []
        };
    }

    function send(event, payload) {
        if (socket?.readyState !== WebSocket.OPEN) return false;
        try {
            socket.send(JSON.stringify({ event, context, ...(event === 'sendToPlugin' ? { action: actionUuid } : {}), payload }));
            return true;
        } catch {
            return false;
        }
    }

    function sendToPlugin(type) {
        if (isPreview) return;
        send('sendToPlugin', { type });
    }

    function saveSettings() {
        settingsReady = true;
        settings = normalizeSettings(settings);
        flushSettings();
        renderSettings();
        if (isPreview && renderPreviewButton) {
            lastData.preview = renderPreviewButton({
                status: 'on', countryCode: 'EE', showFlag: settings.showFlag,
                mask: settings.mask === 'random' ? sampleRandomMask : settings.mask
            });
            renderStatus();
        }
    }

    function flushSettings() {
        const serialized = JSON.stringify(settings);
        if (isPreview || pendingSave || serialized === confirmedSettings) return;
        if (send('setSettings', settings)) {
            pendingSave = serialized;
            // Read back the saved value even when Stream Deck does not echo it to the sender.
            send('getSettings');
        }
    }

    function receiveSettings(value) {
        if (!isRecord(value)) return;
        const incoming = normalizeSettings(value);
        const serialized = JSON.stringify(incoming);
        if (pendingSave) {
            if (serialized === pendingSave) {
                confirmedSettings = serialized;
                pendingSave = null;
                // Keep newer local edits visible and save their latest combined value next.
                flushSettings();
                return;
            }
            if (serialized === confirmedSettings) return;
        }
        // An unrelated authoritative value is an external change that superseded the save.
        pendingSave = null;
        settings = incoming;
        confirmedSettings = serialized;
        settingsReady = true;
    }

    function countryFlag(code) {
        if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return '';
        return String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0)));
    }

    function countryLabel(code) {
        const country = availableCountries.find((item) => item.code === code);
        return `${countryFlag(code)} ${country?.name || code}`.trim();
    }

    function setCountryError(message) {
        element('country-error').textContent = message;
        element('country-error').hidden = !message;
        element('country-codes').setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    function validateCountries(codes) {
        if (codes.length > 32) return 'Choose up to 32 countries.';
        if (codes.some((code) => !/^[A-Z]{2}$/.test(code))) return 'Use two-letter country codes separated by commas.';
        if (availableCountries.length) {
            const unknown = codes.filter((code) => !availableCountries.some((country) => country.code === code));
            if (unknown.length) return `Not in HMA's recent locations: ${unknown.join(', ')}. Connect to each country in HMA first.`;
        }
        if (settings.longPress === 'next-country' && codes.length < 2) return 'Add at least two countries to cycle between them.';
        return '';
    }

    function renderSettings() {
        const enabled = isPreview || (connected && settingsReady);
        const nextCountrySupported = lastData.capabilities?.nextCountry === true;
        element('mask').disabled = !enabled || !masks.length;
        element('mask').value = settings.mask;
        element('show-flag').disabled = !enabled;
        element('show-flag').checked = settings.showFlag;
        element('long-press').disabled = !enabled;
        element('next-country-option').disabled = !nextCountrySupported;
        element('long-press').value = settings.longPress;
        const isCountryMode = settings.longPress === 'next-country';
        element('country-settings').hidden = !isCountryMode;
        element('country-codes').disabled = !enabled || !nextCountrySupported;
        element('available-countries').disabled = !enabled || !nextCountrySupported || !availableCountries.length;
        element('add-country').disabled = element('available-countries').disabled || !element('available-countries').value;

        const unsupported = !nextCountrySupported && settingsReady && lastData.errorCode !== 'APP_NOT_INSTALLED';
        element('country-support').hidden = !unsupported;
        element('country-support').textContent = isCountryMode
            ? 'Next country is saved for this key, but country switching is unavailable in HMA right now. Your setting is kept. Open HMA to check it, or choose another long press action.'
            : "Next country is unavailable until HMA's recent locations can be read.";

        if (document.activeElement !== element('country-codes') && !countryDraftDirty) {
            element('country-codes').value = settings.countries.join(', ');
            setCountryError(isCountryMode && nextCountrySupported ? validateCountries(settings.countries) : '');
        }
        const labels = settings.countries.map(countryLabel);
        const serializedOrder = JSON.stringify(labels);
        if (serializedOrder !== lastCountryOrder) {
            lastCountryOrder = serializedOrder;
            element('country-order').replaceChildren(...labels.map((label) => {
                const item = document.createElement('li');
                item.textContent = label;
                return item;
            }));
        }
    }

    function renderStatus() {
        const status = isRecord(lastData.status) ? lastData.status : {};
        const state = typeof status.state === 'string' ? status.state.toLowerCase() : 'unknown';
        const titles = {
            connected: 'Connected', disconnected: 'Off', connecting: 'Connecting…',
            disconnecting: 'Turning off…', reconnecting: 'Changing identity…',
            switching: 'Changing country…', checking: 'Checking HMA',
            unavailable: 'HMA unavailable', error: 'Check HMA', unknown: 'Checking HMA'
        };
        const appMissing = lastData.errorCode === 'APP_NOT_INSTALLED';
        const message = appMissing ? 'Install HMA to use this key.' : errorMessage || (typeof lastData.message === 'string' ? lastData.message : '');
        const permissionNeeded = !appMissing && /accessibility|automation|not.?authorized/i.test(`${state} ${message}`);
        const operationTitle = lastData.busy && (lastData.operation === 'reconnect' ? 'Changing identity…'
            : lastData.operation === 'next-country' ? 'Changing country…' : '');
        element('status-title').textContent = appMissing ? 'HMA not installed' : permissionNeeded ? 'Permission needed' : operationTitle || titles[state] || 'Check HMA';
        const code = typeof status.countryCode === 'string' ? status.countryCode.toUpperCase() : '';
        const countryName = typeof status.countryName === 'string' ? status.countryName : '';
        element('status-location').textContent = appMissing ? '' : countryName || code
            ? `${countryFlag(code)} ${countryName || code}`.trim()
            : state === 'connected' ? 'VPN is on' : state === 'disconnected' ? 'VPN is off' : 'Waiting for connection status';
        element('status-ip').textContent = !appMissing && state === 'connected' && typeof status.virtualIp === 'string' ? status.virtualIp : '';
        element('message').textContent = message;
        element('message').hidden = !message;
        element('message').classList.toggle('error', Boolean(errorMessage) || state === 'error');

        if (typeof lastData.preview === 'string' && lastData.preview) {
            const preview = lastData.preview;
            if (/^data:image\/(svg\+xml|png|webp|jpeg)[;,]/i.test(preview) || /^\.\.\/imgs\//.test(preview)) {
                element('key-preview').src = preview;
                element('key-preview').hidden = false;
                element('preview-loading').hidden = true;
            }
        }

        const normal = state === 'connected' || state === 'disconnected';
        const countryUnavailable = settings.longPress === 'next-country' && lastData.capabilities?.nextCountry !== true;
        const controlUnavailable = state === 'connected' ? lastData.capabilities?.disconnect === false : lastData.capabilities?.connect === false;
        const needsAction = !isPreview && (appMissing || Boolean(errorMessage) || permissionNeeded || (!lastData.busy && (!normal || controlUnavailable || countryUnavailable)));
        element('help-actions').hidden = !needsAction;
        element('get-hma').hidden = !needsAction || !appMissing;
        element('open-hma').hidden = !needsAction || appMissing;
        element('refresh-status').hidden = !needsAction;
        element('open-accessibility').hidden = !needsAction || !permissionNeeded;
        for (const id of ['get-hma', 'open-hma', 'open-accessibility', 'refresh-status']) {
            element(id).disabled = !connected || Boolean(lastData.busy);
        }
    }

    function updateCountries(countries) {
        if (!Array.isArray(countries)) return;
        availableCountries = countries.filter((country) => isRecord(country) && typeof country.code === 'string' && /^[A-Za-z]{2}$/.test(country.code) && typeof country.name === 'string')
            .map((country) => ({ code: country.code.toUpperCase(), name: country.name }));
        const serialized = JSON.stringify(availableCountries);
        if (serialized === lastCountryCatalog) return;
        lastCountryCatalog = serialized;
        const select = element('available-countries');
        const selected = select.value;
        select.replaceChildren(new Option('Choose a recent country to add', ''), ...availableCountries.map((country) => new Option(countryLabel(country.code), country.code)));
        if (availableCountries.some((country) => country.code === selected)) select.value = selected;
    }

    function updateMasks(catalog) {
        if (!Array.isArray(catalog)) return;
        const seen = new Set(['random']);
        masks = catalog.filter((mask) => {
            if (!mask || typeof mask.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(mask.id) || typeof mask.label !== 'string' || seen.has(mask.id)) return false;
            seen.add(mask.id);
            return true;
        }).map(({ id, label }) => ({ id, label }));
        const serialized = JSON.stringify(masks);
        if (serialized === lastMaskCatalog) return;
        lastMaskCatalog = serialized;
        element('mask').replaceChildren(new Option('Random', 'random'), ...masks.map((mask) => new Option(mask.label, mask.id)));
    }

    function receiveStatus(data) {
        if (!isRecord(data)) return;
        lastData = { ...lastData, ...data };
        errorMessage = '';
        // Animation/status snapshots can lag behind the settings event stream.
        if (isPreview || !settingsReady) receiveSettings(data.settings);
        updateMasks(data.masks);
        updateCountries(data.countries);
        renderSettings();
        renderStatus();
    }

    window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, info, actionInfo) => {
        if (isPreview) return;
        context = uuid;
        pendingSave = null;
        confirmedSettings = '';
        try {
            const action = JSON.parse(actionInfo);
            if (!isRecord(action)) throw new Error('Invalid action information');
            if (typeof action.action === 'string') actionUuid = action.action;
            settings = normalizeSettings(action.payload?.settings);
            confirmedSettings = JSON.stringify(settings);
            settingsReady = true;
        } catch {
            settingsReady = false;
        }
        socket = new WebSocket(`ws://127.0.0.1:${port}`);
        socket.addEventListener('open', () => {
            connected = true;
            socket.send(JSON.stringify({ event: registerEvent, uuid }));
            send('getSettings');
            sendToPlugin('getStatus');
            renderSettings();
            renderStatus();
        });
        socket.addEventListener('message', (event) => {
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (!isRecord(message)) return;
            if (message.event === 'sendToPropertyInspector') {
                const payload = isRecord(message.payload) ? message.payload : {};
                if (payload.type === 'statusUpdate') receiveStatus(payload.data);
                if (payload.type === 'error') {
                    errorMessage = typeof payload.message === 'string' && payload.message ? payload.message : 'HMA could not complete this action.';
                    renderStatus();
                }
            }
            if (message.event === 'didReceiveSettings') {
                receiveSettings(message.payload?.settings);
                renderSettings();
                renderStatus();
            }
        });
        const disconnect = () => {
            connected = false;
            renderSettings();
            renderStatus();
        };
        socket.addEventListener('close', disconnect);
        socket.addEventListener('error', disconnect);
    };

    element('mask').addEventListener('change', () => {
        settings.mask = element('mask').value;
        saveSettings();
    });
    element('show-flag').addEventListener('change', () => {
        settings.showFlag = element('show-flag').checked;
        saveSettings();
    });
    element('long-press').addEventListener('change', () => {
        settings.longPress = element('long-press').value;
        saveSettings();
        renderStatus();
    });
    element('country-codes').addEventListener('input', () => { countryDraftDirty = true; });
    element('country-codes').addEventListener('change', () => {
        const codes = [...new Set(element('country-codes').value.split(',').map((code) => code.trim().toUpperCase()).filter(Boolean))];
        const validation = validateCountries(codes);
        setCountryError(validation);
        if (codes.length > 32 || codes.some((code) => !/^[A-Z]{2}$/.test(code)) || (availableCountries.length && codes.some((code) => !availableCountries.some((country) => country.code === code)))) return;
        settings.countries = codes;
        countryDraftDirty = false;
        saveSettings();
    });
    element('available-countries').addEventListener('change', renderSettings);
    element('add-country').addEventListener('click', () => {
        const code = element('available-countries').value;
        if (!code || settings.countries.includes(code)) return;
        if (settings.countries.length >= 32) { setCountryError('Choose up to 32 countries.'); return; }
        settings.countries.push(code);
        countryDraftDirty = false;
        element('available-countries').value = '';
        saveSettings();
    });
    element('get-hma').addEventListener('click', () => sendToPlugin('getHma'));
    element('open-hma').addEventListener('click', () => sendToPlugin('openHma'));
    element('open-accessibility').addEventListener('click', () => sendToPlugin('openAccessibility'));
    element('refresh-status').addEventListener('click', () => sendToPlugin('refreshStatus'));
    document.querySelectorAll('.footer a').forEach((link) => {
        link.addEventListener('click', (event) => {
            if (send('openUrl', { url: link.href })) event.preventDefault();
        });
    });

    if (isPreview) {
        connected = true;
        settingsReady = true;
        element('preview-badge').hidden = false;
        element('preview-label').textContent = 'Sample key';
        element('key-preview').alt = 'Sample Stream Deck key preview';
        Promise.all([import('../renderer.js'), import('../masks.js')]).then(([renderer, catalog]) => {
            renderPreviewButton = renderer.renderButton;
            sampleRandomMask = catalog.MASKS[Math.floor(Math.random() * catalog.MASKS.length)]?.id || 'sunglasses';
            receiveStatus({
                settings: { mask: 'random', showFlag: true, longPress: 'reconnect', countries: ['EE', 'FI', 'SE'] },
                status: { state: 'connected', countryCode: 'EE', countryName: 'Estonia', virtualIp: '' },
                capabilities: { connect: true, disconnect: true, reconnect: true, countries: true, nextCountry: true },
                masks: catalog.MASKS,
                countries: [{ code: 'EE', name: 'Estonia' }, { code: 'FI', name: 'Finland' }, { code: 'SE', name: 'Sweden' }, { code: 'DE', name: 'Germany' }, { code: 'US', name: 'United States' }],
                message: '', preview: renderPreviewButton({ status: 'on', countryCode: 'EE', showFlag: true, mask: sampleRandomMask }), busy: false
            });
        }).catch(() => {
            element('preview-loading').textContent = 'Preview unavailable';
        });
    }
})();
