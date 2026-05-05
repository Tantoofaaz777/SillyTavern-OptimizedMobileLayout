import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";
import { Popup } from "../../../popup.js";

const extensionName = "SillyTavern-OptimizedMobileLayout";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false,
    avatarBorder: true,
    fontSize: 15,
    lineHeight: 1.5,
    avatarSize: 50,
    nameSize: 15,
};

const observerConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "is_system", "is_user"],
};

const sliderConfigs = {
    fontSize: { slider: "#ccl_font_size", counter: "#ccl_font_size_counter", min: 12, max: 28, step: 1, decimals: 0 },
    nameSize: { slider: "#ccl_name_size", counter: "#ccl_name_size_counter", min: 14, max: 36, step: 1, decimals: 0 },
    avatarSize: { slider: "#ccl_avatar_size", counter: "#ccl_avatar_size_counter", min: 28, max: 96, step: 2, decimals: 0 },
    lineHeight: { slider: "#ccl_line_height", counter: "#ccl_line_height_counter", min: 1, max: 2.2, step: 0.1, decimals: 1 },
};

let observer = null;

function createPresetId() {
    if (typeof crypto?.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value, fallback, min, max, decimals = 0) {
    const parsed = Number.parseFloat(value);
    const safeValue = Number.isFinite(parsed) ? parsed : fallback;
    const clamped = clamp(safeValue, min, max);
    return Number(clamped.toFixed(decimals));
}

function formatSliderValue(value, decimals) {
    return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

function applyTextSettings(fontSize, lineHeight) {
    document.documentElement.style.setProperty("--ccl-font-size", `${fontSize}px`);
    document.documentElement.style.setProperty("--ccl-line-height", String(lineHeight));
}

function applyAvatarSize(size) {
    document.documentElement.style.setProperty("--ccl-avatar-size", `${size}px`);
}

function applyNameSize(size) {
    document.documentElement.style.setProperty("--ccl-name-size", `${size}px`);
}

function applyAvatarBorder(enabled) {
    $("body").toggleClass("ccl-avatar-border", enabled);
}

function shouldSkipMessage($mes) {
    return $mes.hasClass("smallSysMes") || $mes.attr("ch_name") === "SillyTavern System";
}

function getMessageParts($mes) {
    return {
        $avatarWrapper: $mes.find("> .mesAvatarWrapper"),
        $mesBlock: $mes.find("> .mes_block"),
        $swipeRight: $mes.find("> .swipeRightBlock"),
        $swipeLeft: $mes.find("> .swipe_left"),
    };
}

function restructureSwipeBar($swipeLeft, $swipeRight) {
    if (!$swipeLeft.length || !$swipeRight.length) return;

    const $counter = $swipeRight.find(".swipes-counter");
    const $btnRight = $swipeRight.find(".swipe_right");

    $swipeRight.empty();
    $swipeRight.append($swipeLeft, $counter, $btnRight);
    $swipeRight.addClass("ccl-swipe-bar");
}

function restoreSwipeBar($mesBlock, $swipeRight) {
    const $swipeLeft = $swipeRight.find(".swipe_left");

    if ($swipeLeft.length) {
        $mesBlock.before($swipeLeft);
    }

    $swipeRight.removeClass("ccl-swipe-bar");
}

function restructureMessage(mesEl) {
    const $mes = $(mesEl);
    if ($mes.hasClass("ccl-processed") || shouldSkipMessage($mes)) return;

    const { $avatarWrapper, $mesBlock, $swipeRight, $swipeLeft } = getMessageParts($mes);
    if (!$avatarWrapper.length || !$mesBlock.length) return;

    const $cardHeader = $('<div class="ccl-card-header"></div>');
    const $avatarCol = $('<div class="ccl-avatar-col"></div>');
    const $metaRow = $('<div class="ccl-meta-row"></div>');
    const $nameRow = $('<div class="ccl-name-row"></div>');
    const $infoCol = $('<div class="ccl-info-col"></div>');

    $avatarCol.append($avatarWrapper.find(".avatar"));
    $metaRow.append(
        $avatarWrapper.find(".mesIDDisplay"),
        $avatarWrapper.find(".mes_timer"),
        $avatarWrapper.find(".tokenCounterDisplay"),
    );
    $nameRow.append($mesBlock.find("> .ch_name"));
    $infoCol.append($metaRow, $nameRow);
    $cardHeader.append($avatarCol, $infoCol);

    $avatarWrapper.hide();
    $mesBlock.prepend($cardHeader);

    restructureSwipeBar($swipeLeft, $swipeRight);
    $mes.addClass("ccl-processed");
}

function restoreMessage(mesEl) {
    const $mes = $(mesEl);
    if (!$mes.hasClass("ccl-processed")) return;

    const { $avatarWrapper, $mesBlock, $swipeRight } = getMessageParts($mes);
    const $cardHeader = $mes.find("> .mes_block > .ccl-card-header");

    if (!$cardHeader.length || !$avatarWrapper.length || !$mesBlock.length) {
        $mes.removeClass("ccl-processed");
        return;
    }

    $avatarWrapper.prepend($cardHeader.find(".avatar"));
    $avatarWrapper.append(
        $cardHeader.find(".mesIDDisplay"),
        $cardHeader.find(".mes_timer"),
        $cardHeader.find(".tokenCounterDisplay"),
    );
    $mesBlock.prepend($cardHeader.find(".ch_name"));
    $cardHeader.remove();

    restoreSwipeBar($mesBlock, $swipeRight);
    $avatarWrapper.show();
    $mes.removeClass("ccl-processed");
}

function refreshMessage(mesEl) {
    const $mes = $(mesEl);
    if (!$mes.length) return;

    if ($mes.hasClass("ccl-processed")) {
        restoreMessage($mes[0]);
    }

    if (!shouldSkipMessage($mes)) {
        restructureMessage($mes[0]);
    }
}

function collectMessagesToRefresh(mutations) {
    const messages = new Set();

    for (const mutation of mutations) {
        const targetMes = mutation.target instanceof Element
            ? mutation.target.closest(".mes")
            : null;

        if (targetMes) {
            messages.add(targetMes);
        }

        for (const node of mutation.addedNodes) {
            if (!(node instanceof Element)) continue;

            if (node.classList.contains("mes")) {
                messages.add(node);
                continue;
            }

            const parentMes = node.closest(".mes");
            if (parentMes) {
                messages.add(parentMes);
            }
        }
    }

    return messages;
}

function startObserver() {
    const chat = document.getElementById("chat");
    if (!chat) return;

    stopObserver();

    observer = new MutationObserver((mutations) => {
        if (!$("body").hasClass("ccl-active")) return;

        const messagesToRefresh = collectMessagesToRefresh(mutations);
        if (!messagesToRefresh.size) return;

        observer.disconnect();
        messagesToRefresh.forEach((mes) => refreshMessage(mes));
        observer.observe(chat, observerConfig);
    });

    observer.observe(chat, observerConfig);
}

function stopObserver() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
}

function applyLayout(enabled) {
    if (enabled) {
        $("body").addClass("ccl-active");
        $("#chat .mes").each(function () {
            refreshMessage(this);
        });
        startObserver();
        return;
    }

    $("body").removeClass("ccl-active");
    stopObserver();
    $("#chat .mes.ccl-processed").each(function () {
        restoreMessage(this);
    });
}

function ensureSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};

    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const settings = extension_settings[extensionName];
    settings.fontSize = normalizeNumber(settings.fontSize, defaultSettings.fontSize, 12, 28, 0);
    settings.nameSize = normalizeNumber(settings.nameSize, defaultSettings.nameSize, 14, 36, 0);
    settings.avatarSize = normalizeNumber(settings.avatarSize, defaultSettings.avatarSize, 28, 96, 0);
    settings.lineHeight = normalizeNumber(settings.lineHeight, defaultSettings.lineHeight, 1, 2.2, 1);
    settings.avatarBorder = settings.avatarBorder ?? defaultSettings.avatarBorder;
    settings.presets = Array.isArray(settings.presets) && settings.presets.length
        ? settings.presets.map((preset, index) => normalizePreset(preset, index === 0 ? "Default" : `Preset ${index + 1}`))
        : [
            normalizePreset({
                id: createPresetId(),
                name: "Default",
                ...getPresetPayload(settings),
            }, "Default"),
        ];

    const selectedPreset = settings.presets.find((preset) => preset.id === settings.selectedPresetId) ?? settings.presets[0];
    settings.selectedPresetId = selectedPreset.id;

    return settings;
}

function updateSliderUI(settingKey, value) {
    const config = sliderConfigs[settingKey];
    if (!config) return;

    const formatted = formatSliderValue(value, config.decimals);
    $(config.slider).val(formatted);
    $(config.counter).val(formatted);
}

function applyAllSettings(settings) {
    applyTextSettings(settings.fontSize, settings.lineHeight);
    applyAvatarSize(settings.avatarSize);
    applyNameSize(settings.nameSize);
    applyAvatarBorder(settings.avatarBorder);
}

function getPresetPayload(source) {
    return {
        fontSize: source.fontSize,
        nameSize: source.nameSize,
        avatarSize: source.avatarSize,
        lineHeight: source.lineHeight,
    };
}

function normalizePreset(preset, fallbackName = "Default") {
    return {
        id: preset?.id || createPresetId(),
        name: String(preset?.name || fallbackName).trim() || fallbackName,
        fontSize: normalizeNumber(preset?.fontSize, defaultSettings.fontSize, 12, 28, 0),
        nameSize: normalizeNumber(preset?.nameSize, defaultSettings.nameSize, 14, 36, 0),
        avatarSize: normalizeNumber(preset?.avatarSize, defaultSettings.avatarSize, 28, 96, 0),
        lineHeight: normalizeNumber(preset?.lineHeight, defaultSettings.lineHeight, 1, 2.2, 1),
    };
}

function getSelectedPreset(settings) {
    return settings.presets.find((preset) => preset.id === settings.selectedPresetId) ?? settings.presets[0] ?? null;
}

function updatePresetControls(settings) {
    const $select = $("#ccl_presets");
    const selectedPreset = getSelectedPreset(settings);

    $select.empty();

    settings.presets.forEach((preset) => {
        $select.append(
            $("<option></option>")
                .val(preset.id)
                .text(preset.name),
        );
    });

    if (selectedPreset) {
        $select.val(selectedPreset.id);
    }

    $("#ccl_preset_delete").toggleClass("disabled", settings.presets.length <= 1);
}

function updateAllSliderUI(settings) {
    updateSliderUI("fontSize", settings.fontSize);
    updateSliderUI("nameSize", settings.nameSize);
    updateSliderUI("avatarSize", settings.avatarSize);
    updateSliderUI("lineHeight", settings.lineHeight);
}

function applySettingsValues(values) {
    const settings = ensureSettings();
    settings.fontSize = normalizeNumber(values.fontSize, settings.fontSize, 12, 28, 0);
    settings.nameSize = normalizeNumber(values.nameSize, settings.nameSize, 14, 36, 0);
    settings.avatarSize = normalizeNumber(values.avatarSize, settings.avatarSize, 28, 96, 0);
    settings.lineHeight = normalizeNumber(values.lineHeight, settings.lineHeight, 1, 2.2, 1);

    updateAllSliderUI(settings);
    applyAllSettings(settings);
}

function loadSettings() {
    const settings = ensureSettings();

    $("#ccl_enabled").prop("checked", settings.enabled);
    $("#ccl_avatar_border").prop("checked", settings.avatarBorder);
    updatePresetControls(settings);
    applySettingsValues(settings);
    applyLayout(settings.enabled);
}

function bindSliderSetting(settingKey, onApply) {
    const config = sliderConfigs[settingKey];
    const $slider = $(config.slider);
    const $counter = $(config.counter);

    const commitValue = (rawValue) => {
        const settings = ensureSettings();
        const normalized = normalizeNumber(rawValue, settings[settingKey], config.min, config.max, config.decimals);
        settings[settingKey] = normalized;
        updateSliderUI(settingKey, normalized);
        onApply(normalized, settings);
        saveSettingsDebounced();
    };

    $slider.on("input change", function () {
        commitValue($(this).val());
    });

    $counter.on("change blur", function () {
        commitValue($(this).val());
    });

    $counter.on("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            $(this).trigger("blur");
        }
    });
}

function onEnabledChange(event) {
    const settings = ensureSettings();
    settings.enabled = Boolean($(event.target).prop("checked"));
    saveSettingsDebounced();
    applyLayout(settings.enabled);
}

function onAvatarBorderChange(event) {
    const settings = ensureSettings();
    settings.avatarBorder = Boolean($(event.target).prop("checked"));
    applyAvatarBorder(settings.avatarBorder);
    saveSettingsDebounced();
}

async function promptForPresetName(title, message, initialValue = "") {
    let promptMessage = message;
    let currentValue = initialValue;

    while (true) {
        const name = await Popup.show.input(title, promptMessage, currentValue);
        if (typeof name !== "string") {
            return null;
        }

        const trimmed = name.trim();
        if (trimmed.length) {
            return trimmed;
        }

        promptMessage = "Please enter a name for this preset.";
        currentValue = "";
    }
}

async function onPresetChange(event) {
    const settings = ensureSettings();
    const selectedId = String($(event.target).val() || "");
    const preset = settings.presets.find((item) => item.id === selectedId);

    if (!preset) return;

    settings.selectedPresetId = preset.id;
    applySettingsValues(preset);
    saveSettingsDebounced();
}

async function onCreatePreset() {
    const settings = ensureSettings();
    const name = await promptForPresetName("Create Layout Preset", "Enter a name for the new layout preset:");
    if (!name) return;

    const preset = {
        id: createPresetId(),
        name,
        ...getPresetPayload(settings),
    };

    settings.presets.push(normalizePreset(preset, name));
    settings.selectedPresetId = preset.id;
    updatePresetControls(settings);
    $("#ccl_presets").val(preset.id);
    saveSettingsDebounced();
    toastr.success("Layout preset saved");
}

function onSavePreset() {
    const settings = ensureSettings();
    const preset = getSelectedPreset(settings);
    if (!preset) return;

    Object.assign(preset, getPresetPayload(settings));
    saveSettingsDebounced();
    toastr.success("Layout preset updated");
}

async function onRenamePreset() {
    const settings = ensureSettings();
    const preset = getSelectedPreset(settings);
    if (!preset) return;

    const newName = await promptForPresetName("Rename Layout Preset", "Enter a new name for this layout preset:", preset.name);
    if (!newName) return;

    preset.name = newName;
    updatePresetControls(settings);
    saveSettingsDebounced();
}

async function onDeletePreset() {
    const settings = ensureSettings();
    if (settings.presets.length <= 1) return;

    const preset = getSelectedPreset(settings);
    if (!preset) return;

    const confirmed = await Popup.show.confirm(
        "Delete Layout Preset",
        `Are you sure you want to delete "${preset.name}"?`,
        { okButton: "Delete", cancelButton: "Cancel" },
    );

    if (!confirmed) return;

    const presetIndex = settings.presets.findIndex((item) => item.id === preset.id);
    if (presetIndex === -1) return;

    settings.presets.splice(presetIndex, 1);
    const nextPreset = settings.presets[Math.max(0, presetIndex - 1)] ?? settings.presets[0];
    settings.selectedPresetId = nextPreset.id;
    updatePresetControls(settings);
    applySettingsValues(nextPreset);
    saveSettingsDebounced();
    toastr.success("Layout preset deleted");
}

async function onResetDefaults() {
    const confirmed = await Popup.show.confirm(
        "Reset to Default",
        "This will restore the layout settings to the default values.",
        { okButton: "Reset", cancelButton: "Cancel" },
    );

    if (!confirmed) return;

    applySettingsValues(defaultSettings);
    saveSettingsDebounced();
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        const html = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(html);

        $("#ccl_enabled").on("change", onEnabledChange);
        $("#ccl_avatar_border").on("change", onAvatarBorderChange);
        $("#ccl_presets").on("change", onPresetChange);
        $("#ccl_preset_create").on("click", onCreatePreset);
        $("#ccl_preset_save").on("click", onSavePreset);
        $("#ccl_preset_rename").on("click", onRenamePreset);
        $("#ccl_preset_delete").on("click", onDeletePreset);
        $("#ccl_reset_defaults").on("click", onResetDefaults);

        bindSliderSetting("fontSize", (_value, settings) => {
            applyTextSettings(settings.fontSize, settings.lineHeight);
        });
        bindSliderSetting("nameSize", (value) => {
            applyNameSize(value);
        });
        bindSliderSetting("avatarSize", (value) => {
            applyAvatarSize(value);
        });
        bindSliderSetting("lineHeight", (_value, settings) => {
            applyTextSettings(settings.fontSize, settings.lineHeight);
        });

        loadSettings();
        console.log(`[${extensionName}] Loaded`);
    } catch (e) {
        console.error(`[${extensionName}] Failed to load`, e);
    }
});
