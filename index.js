import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced } from "../../../../script.js";

const extensionName = "optimized-mobile-layout";
const extensionFolderPath = `scripts/extensions/third-party/optimized-mobile-layout`;

const defaultSettings = {
    enabled: false,
    fontSize: '16px',
    lineHeight: '1.6',
    avatarSize: '56px',
    nameSize: '1.15em'
};

function applyTextSettings(fontSize, lineHeight) {
    document.documentElement.style.setProperty('--ccl-font-size', fontSize);
    document.documentElement.style.setProperty('--ccl-line-height', lineHeight);
}

function applyAvatarSize(size) {
    document.documentElement.style.setProperty('--ccl-avatar-size', size);
}

function applyNameSize(size) {
    document.documentElement.style.setProperty('--ccl-name-size', size);
}

function restructureMessage(mesEl) {
    const $mes = $(mesEl);
    if ($mes.hasClass('ccl-processed')) return;

    // ⚠️ Ignora mensagens do sistema e da tela de boas-vindas
    if ($mes.hasClass('smallSysMes')) return;
    if ($mes.attr('is_system') === 'true') return;

    const $avatarWrapper = $mes.find('> .mesAvatarWrapper');
    const $mesBlock      = $mes.find('> .mes_block');
    const $swipeRight    = $mes.find('> .swipeRightBlock');
    const $swipeLeft     = $mes.find('> .swipe_left');
    if (!$avatarWrapper.length || !$mesBlock.length) return;

    const $cardHeader = $('<div class="ccl-card-header"></div>');
    const $avatarCol  = $('<div class="ccl-avatar-col"></div>');
    $avatarCol.append($avatarWrapper.find('.avatar'));

    const $metaRow = $('<div class="ccl-meta-row"></div>');
    $metaRow.append(
        $avatarWrapper.find('.mesIDDisplay'),
        $avatarWrapper.find('.mes_timer'),
        $avatarWrapper.find('.tokenCounterDisplay')
    );

    const $nameRow = $('<div class="ccl-name-row"></div>');
    $nameRow.append($mesBlock.find('> .ch_name'));

    const $infoCol = $('<div class="ccl-info-col"></div>');
    $infoCol.append($metaRow, $nameRow);
    $cardHeader.append($avatarCol, $infoCol);
    $avatarWrapper.hide();
    $mesBlock.prepend($cardHeader);

    if ($swipeLeft.length && $swipeRight.length) {
        const $counter  = $swipeRight.find('.swipes-counter');
        const $btnRight = $swipeRight.find('.swipe_right');
        $swipeRight.empty();
        $swipeRight.append($swipeLeft);
        $swipeRight.append($counter);
        $swipeRight.append($btnRight);
        $swipeRight.addClass('ccl-swipe-bar');
    }

    $mes.addClass('ccl-processed');
}

function restoreMessage(mesEl) {
    const $mes = $(mesEl);
    if (!$mes.hasClass('ccl-processed')) return;

    const $cardHeader    = $mes.find('> .mes_block > .ccl-card-header');
    const $avatarWrapper = $mes.find('> .mesAvatarWrapper');
    const $mesBlock      = $mes.find('> .mes_block');
    const $swipeRight    = $mes.find('.swipeRightBlock');
    const $swipeLeft     = $swipeRight.find('.swipe_left');

    $avatarWrapper.prepend($cardHeader.find('.avatar'));
    $avatarWrapper.append(
        $cardHeader.find('.mesIDDisplay'),
        $cardHeader.find('.mes_timer'),
        $cardHeader.find('.tokenCounterDisplay')
    );
    $mesBlock.prepend($cardHeader.find('.ch_name'));
    $cardHeader.remove();

    if ($swipeLeft.length) $mesBlock.before($swipeLeft);
    $swipeRight.removeClass('ccl-swipe-bar');
    $avatarWrapper.show();
    $mes.removeClass('ccl-processed');
}

let observer = null;

function applyLayout(enabled) {
    if (enabled) {
        $('body').addClass('ccl-active');
        $('#chat .mes').each(function () { restructureMessage(this); });
        observer = new MutationObserver((mutations) => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if ($(node).hasClass('mes')) restructureMessage(node);
                });
            });
        });
        const chat = document.getElementById('chat');
        if (chat) observer.observe(chat, { childList: true });
    } else {
        $('body').removeClass('ccl-active');
        if (observer) { observer.disconnect(); observer = null; }
        $('#chat .mes.ccl-processed').each(function () { restoreMessage(this); });
    }
}

function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    const s = extension_settings[extensionName];

    $('#ccl_enabled').prop('checked', s.enabled);
    $('#ccl_font_size').val(s.fontSize);
    $('#ccl_line_height').val(s.lineHeight);
    $('#ccl_avatar_size').val(s.avatarSize);
    $('#ccl_name_size').val(s.nameSize);

    applyTextSettings(s.fontSize, s.lineHeight);
    applyAvatarSize(s.avatarSize);
    applyNameSize(s.nameSize);
    applyLayout(s.enabled);
}

function onEnabledChange(event) {
    extension_settings[extensionName].enabled = Boolean($(event.target).prop('checked'));
    saveSettingsDebounced();
    applyLayout(extension_settings[extensionName].enabled);
}

function onFontSizeChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;
    extension_settings[extensionName].fontSize = val;
    applyTextSettings(val, extension_settings[extensionName].lineHeight);
    saveSettingsDebounced();
}

function onLineHeightChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;
    extension_settings[extensionName].lineHeight = val;
    applyTextSettings(extension_settings[extensionName].fontSize, val);
    saveSettingsDebounced();
}

function onAvatarSizeChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;
    extension_settings[extensionName].avatarSize = val;
    applyAvatarSize(val);
    saveSettingsDebounced();
}

function onNameSizeChange(event) {
    const val = $(event.target).val().trim();
    if (!val) return;
    extension_settings[extensionName].nameSize = val;
    applyNameSize(val);
    saveSettingsDebounced();
}

jQuery(async () => {
    console.log(`[${extensionName}] Loading...`);
    try {
        const html = await $.get(`${extensionFolderPath}/settings.html`);
        $('#extensions_settings2').append(html);

        $('#ccl_enabled').on('change', onEnabledChange);
        $('#ccl_font_size').on('change', onFontSizeChange);
        $('#ccl_line_height').on('change', onLineHeightChange);
        $('#ccl_avatar_size').on('change', onAvatarSizeChange);
        $('#ccl_name_size').on('change', onNameSizeChange);

        loadSettings();
        console.log(`[${extensionName}] ✅ Loaded`);
    } catch (e) {
        console.error(`[${extensionName}] ❌`, e);
    }
});
