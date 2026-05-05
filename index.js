import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "SillyTavern-OptimizedMobileLayout";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    enabled: false,
    fontSize: "16px",
    lineHeight: "1.6",
    avatarSize: "56px",
    nameSize: "1.15em",
    userHeaderRight: false,
};

const observerConfig = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "is_system", "is_user"],
};

let observer = null;

function applyTextSettings(fontSize, lineHeight) {
    document.documentElement.style.setProperty("--ccl-font-size", fontSize);
    document.documentElement.style.setProperty("--ccl-line-height", lineHeight);
}

function applyAvatarSize(size) {
    document.documentElement.style.setProperty("--ccl-avatar-size", size);
}

function applyNameSize(size) {
    document.documentElement.style.setProperty("--ccl-name-size", size);
}

function applyUserHeaderAlignment(enabled) {
    $("body").toggleClass("ccl-user-header-right", enabled);
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

    return extension_settings[extensionName];
}

function loadSettings() {
    const settings = ensureSettings();

    $("#ccl_enabled").prop("checked", settings.enabled);
    $("#ccl_font_size").val(settings.fontSize);
    $("#ccl_line_height").val(settings.lineHeight);
    $("#ccl_avatar_size").val(settings.avatarSize);
    $("#ccl_name_size").val(settings.nameSize);
    $("#ccl_user_header_right").prop("checked", settings.userHeaderRight);

    applyTextSettings(settings.fontSize, settings.lineHeight);
    applyAvatarSize(settings.avatarSize);
    applyNameSize(settings.nameSize);
    applyUserHeaderAlignment(settings.userHeaderRight);
    applyLayout(settings.enabled);
}

function onEnabledChange(event) {
    const settings = ensureSettings();
    settings.enabled = Boolean($(event.target).prop("checked"));
    saveSettingsDebounced();
    applyLayout(settings.enabled);
}

function onFontSizeChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;

    const settings = ensureSettings();
    settings.fontSize = val;
    applyTextSettings(val, settings.lineHeight);
    saveSettingsDebounced();
}

function onLineHeightChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;

    const settings = ensureSettings();
    settings.lineHeight = val;
    applyTextSettings(settings.fontSize, val);
    saveSettingsDebounced();
}

function onAvatarSizeChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;

    const settings = ensureSettings();
    settings.avatarSize = val;
    applyAvatarSize(val);
    saveSettingsDebounced();
}

function onNameSizeChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;

    const settings = ensureSettings();
    settings.nameSize = val;
    applyNameSize(val);
    saveSettingsDebounced();
}

function onUserHeaderRightChange(event) {
    const settings = ensureSettings();
    settings.userHeaderRight = Boolean($(event.target).prop("checked"));
    applyUserHeaderAlignment(settings.userHeaderRight);
    saveSettingsDebounced();
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);

    try {
        const html = await $.get(`${extensionFolderPath}/settings.html`);
        $("#extensions_settings2").append(html);

        $("#ccl_enabled").on("change", onEnabledChange);
        $("#ccl_font_size").on("change", onFontSizeChange);
        $("#ccl_line_height").on("change", onLineHeightChange);
        $("#ccl_avatar_size").on("change", onAvatarSizeChange);
        $("#ccl_name_size").on("change", onNameSizeChange);
        $("#ccl_user_header_right").on("change", onUserHeaderRightChange);

        loadSettings();
        console.log(`[${extensionName}] Loaded`);
    } catch (e) {
        console.error(`[${extensionName}] Failed to load`, e);
    }
});
