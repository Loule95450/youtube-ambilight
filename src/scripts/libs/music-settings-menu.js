import { on, off, setTimeout, wrapErrorHandler } from './generic';
import { storage } from './storage';
import SettingsConfig from './settings-config';

const SAVE_DELAY = 300;

// A selection of the shared YouTube player settings that are relevant on
// YouTube Music
const menuSettingNames = [
  'enabled',
  'spread',
  'blur2',
  'brightness',
  'contrast',
  'saturation',
  'frameBlending',
  'frameBlendingSmoothness',
  'detectHorizontalBarSizeEnabled',
  'detectVerticalBarSizeEnabled',
];

const getSettingConfig = (name) =>
  SettingsConfig.find((setting) => setting.name === name);

const createElem = (tagName, className, textContent) => {
  const elem = document.createElement(tagName);
  if (className) elem.className = className;
  if (textContent !== undefined) elem.textContent = textContent;
  return elem;
};

const createIcon = () => {
  const xmlns = 'http://www.w3.org/2000/svg';
  const svgElem = document.createElementNS(xmlns, 'svg');
  svgElem.setAttributeNS(null, 'viewBox', '0 0 24 24');
  svgElem.setAttributeNS(null, 'width', '24');
  svgElem.setAttributeNS(null, 'height', '24');
  svgElem.setAttributeNS(null, 'aria-hidden', 'true');
  svgElem.setAttributeNS(null, 'focusable', 'false');

  // A screen with light rays around it
  const pathElem = document.createElementNS(xmlns, 'path');
  pathElem.setAttributeNS(null, 'fill', 'currentColor');
  pathElem.setAttributeNS(
    null,
    'd',
    'M8 8h8a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm1 2v4h6v-4H9ZM11 2h2v3h-2V2Zm0 17h2v3h-2v-3ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM4.22 5.64l1.42-1.42 2.12 2.12-1.42 1.42-2.12-2.12Zm12.02 12.02 1.42-1.42 2.12 2.12-1.42 1.42-2.12-2.12Zm-12.02 0 2.12-2.12 1.42 1.42-2.12 2.12-1.42-1.42ZM16.24 6.34l2.12-2.12 1.42 1.42-2.12 2.12-1.42-1.42Z'
  );
  svgElem.appendChild(pathElem);
  return svgElem;
};

// A settings menu for the ambient light in the player bar of YouTube Music.
// The settings are stored with the same keys as the settings of the YouTube
// player, so they are shared between youtube.com and music.youtube.com
export default class MusicSettingsMenu {
  isOpen = false;
  saveTimeouts = {};

  constructor(ambientlight, appElem) {
    this.ambientlight = ambientlight;
    this.appElem = appElem;

    this.initButton();
    this.initMenu();
    this.update();
  }

  initButton() {
    this.buttonElem = createElem('button', 'ytal-music-button');
    this.buttonElem.type = 'button';
    this.buttonElem.title = 'Ambient light';
    this.buttonElem.setAttribute('aria-label', 'Ambient light settings');
    this.buttonElem.setAttribute('aria-haspopup', 'dialog');
    this.buttonElem.setAttribute('aria-expanded', 'false');
    this.buttonElem.appendChild(createIcon());

    on(this.buttonElem, 'click', (event) => {
      event.stopPropagation();
      this.toggle();
    });

    this.insertButton();

    // The player bar can be created later, re-rendered or replaced by
    // YouTube Music depending on the layout and the size of the window
    this.appObserver = new MutationObserver(
      wrapErrorHandler(function onAppMutation() {
        if (this.buttonElem.isConnected) return;
        this.insertButton();
      }.bind(this), true)
    );
    this.appObserver.observe(this.appElem, {
      childList: true,
      subtree: true,
    });
  }

  insertButton() {
    // The player bar at the bottom of the window. In small windows a
    // different player bar (#top-player-bar) is shown in the player page
    const playerBarSelector = 'ytmusic-player-bar:not(#top-player-bar)';

    // The layout of the player bar differs between versions of YouTube
    // Music, so try to find the right controls from specific to generic
    const buttonsElem = this.appElem.querySelector(
      `${playerBarSelector} .right-controls-buttons`
    );
    if (buttonsElem) {
      const expandButtonElem = buttonsElem.querySelector(
        ':scope > .expand-button'
      );
      buttonsElem.insertBefore(this.buttonElem, expandButtonElem);
      return;
    }

    // The redesigned player bar (ytmusic-miniplayer)
    const rightSectionElem = this.appElem.querySelector(
      'ytmusic-miniplayer .ytMusicMiniPlayerRightSection'
    );
    if (rightSectionElem) {
      const volumeWrapperElem = rightSectionElem.querySelector(
        ':scope > .ytMusicMiniPlayerVolumeWrapper'
      );
      rightSectionElem.insertBefore(this.buttonElem, volumeWrapperElem);
      return;
    }

    const volumeElem = this.appElem.querySelector(
      `${playerBarSelector} .volume`
    );
    if (volumeElem?.parentElement) {
      volumeElem.parentElement.insertBefore(this.buttonElem, volumeElem);
      return;
    }

    const rightControlsElem = this.appElem.querySelector(
      `${playerBarSelector} .right-controls`
    );
    rightControlsElem?.appendChild(this.buttonElem);
  }

  initMenu() {
    this.menuElem = createElem('div', 'ytal-music-menu');
    this.menuElem.setAttribute('role', 'dialog');
    this.menuElem.setAttribute('aria-label', 'Ambient light settings');
    this.menuElem.hidden = true;

    const headerElem = createElem('div', 'ytal-music-menu__header');
    headerElem.appendChild(
      createElem('div', 'ytal-music-menu__title', 'Ambient light')
    );
    headerElem.appendChild(
      createElem(
        'div',
        'ytal-music-menu__subtitle',
        'Shared with the settings on youtube.com'
      )
    );
    this.menuElem.appendChild(headerElem);

    this.inputs = {};
    for (const name of menuSettingNames) {
      const setting = getSettingConfig(name);
      if (!setting) continue;

      this.menuElem.appendChild(
        setting.type === 'checkbox'
          ? this.createCheckbox(setting)
          : this.createRange(setting)
      );
    }

    // Prevent the clicks from reaching the player bar, which would open the
    // player page
    on(this.menuElem, 'click', (event) => event.stopPropagation());

    this.onDocumentClick = (event) => {
      if (
        this.menuElem.contains(event.target) ||
        this.buttonElem.contains(event.target)
      )
        return;
      this.close();
    };
    this.onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      this.close();
      this.buttonElem.focus();
    };
    this.onWindowResize = () => this.updatePosition();

    document.body.appendChild(this.menuElem);
  }

  createCheckbox(setting) {
    const id = `ytal-music-setting-${setting.name}`;
    const elem = createElem('label', 'ytal-music-menu__item');
    elem.htmlFor = id;

    elem.appendChild(
      createElem('span', 'ytal-music-menu__label', this.getLabel(setting))
    );

    const input = createElem('input', 'ytal-music-menu__switch');
    input.type = 'checkbox';
    input.id = id;
    input.setAttribute('role', 'switch');
    on(input, 'change', () => this.set(setting.name, input.checked));
    elem.appendChild(input);

    this.inputs[setting.name] = { input };
    return elem;
  }

  createRange(setting) {
    const id = `ytal-music-setting-${setting.name}`;
    const elem = createElem(
      'div',
      'ytal-music-menu__item ytal-music-menu__item--range'
    );

    const labelElem = createElem(
      'label',
      'ytal-music-menu__label',
      this.getLabel(setting)
    );
    labelElem.htmlFor = id;
    elem.appendChild(labelElem);

    const valueElem = createElem('output', 'ytal-music-menu__value');
    valueElem.htmlFor = id;
    elem.appendChild(valueElem);

    const input = createElem('input', 'ytal-music-menu__range');
    input.type = 'range';
    input.id = id;
    input.min = setting.min;
    input.max = setting.max;
    input.step = setting.step ?? 1;
    on(input, 'input', () => {
      const value = parseFloat(input.value);
      valueElem.textContent = `${value}%`;
      this.set(setting.name, value);
    });
    elem.appendChild(input);

    this.inputs[setting.name] = { input, valueElem };
    return elem;
  }

  getLabel(setting) {
    // Smooth motion only has an effect on music videos
    if (setting.name === 'frameBlending') return 'Smooth motion';
    if (setting.name === 'frameBlendingSmoothness')
      return 'Smooth motion strength';
    // Bars are only detected in music videos
    if (setting.name === 'detectHorizontalBarSizeEnabled')
      return 'Remove black bars in videos';
    if (setting.name === 'detectVerticalBarSizeEnabled')
      return 'Remove black sidebars in videos';
    return setting.label;
  }

  set(name, value) {
    this.ambientlight.updateSettings({ [name]: value });
    this.update();
    this.scheduleSave(name, value);
  }

  scheduleSave(name, value) {
    clearTimeout(this.saveTimeouts[name]);
    this.saveTimeouts[name] = setTimeout(async () => {
      delete this.saveTimeouts[name];
      // Store the default value as undefined, just like the YouTube player
      // settings do, so that a future change of the default is applied
      const isDefault = getSettingConfig(name)?.default === value;
      await storage.set(`setting-${name}`, isDefault ? undefined : value);
    }, SAVE_DELAY);
  }

  update() {
    const { settings } = this.ambientlight;

    this.buttonElem.classList.toggle(
      'ytal-music-button--enabled',
      !!settings.enabled
    );

    for (const [name, { input, valueElem }] of Object.entries(this.inputs)) {
      const value = settings[name];
      if (input.type === 'checkbox') {
        input.checked = !!value;
      } else {
        // Don't move the slider while it is being dragged
        if (document.activeElement !== input) input.value = value;
        valueElem.textContent = `${value}%`;
        input.disabled = !settings.enabled;
      }
    }

    const smoothnessInput = this.inputs.frameBlendingSmoothness?.input;
    if (smoothnessInput) {
      smoothnessInput.disabled = !settings.enabled || !settings.frameBlending;
    }
  }

  updatePosition() {
    if (!this.isOpen) return;

    const buttonRect = this.buttonElem.getBoundingClientRect();
    const barRect = (
      this.buttonElem.closest('ytmusic-player-bar, ytmusic-miniplayer') ??
      this.buttonElem
    ).getBoundingClientRect();
    const menuWidth = this.menuElem.offsetWidth;
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - menuWidth - 8,
        buttonRect.left + buttonRect.width / 2 - menuWidth / 2
      )
    );
    this.menuElem.style.left = `${left}px`;
    this.menuElem.style.bottom = `${window.innerHeight - barRect.top + 8}px`;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.isOpen) return;

    this.isOpen = true;
    this.update();
    this.menuElem.hidden = false;
    this.buttonElem.setAttribute('aria-expanded', 'true');
    this.updatePosition();

    on(document, 'click', this.onDocumentClick, { capture: true });
    on(document, 'keydown', this.onKeyDown);
    on(window, 'resize', this.onWindowResize);
  }

  close() {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.menuElem.hidden = true;
    this.buttonElem.setAttribute('aria-expanded', 'false');

    off(document, 'click', this.onDocumentClick);
    off(document, 'keydown', this.onKeyDown);
    off(window, 'resize', this.onWindowResize);
  }
}
