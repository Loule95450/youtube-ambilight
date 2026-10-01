import { wrapErrorHandler } from './libs/generic';
import { storage } from './libs/storage';
import MusicSettingsMenu from './libs/music-settings-menu';
import MusicAmbientlight, {
  getDefaultMusicSettings,
  musicSettingNames,
} from './libs/music-ambientlight';

const storageNames = musicSettingNames.map((name) => `setting-${name}`);

const parseStoredSettings = (stored) =>
  Object.fromEntries(
    Object.entries(stored)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key.replace(/^setting-/, ''), value])
  );

const findPlayerElems = () => {
  const playerPageElem = document.querySelector('ytmusic-app ytmusic-player-page');
  const playerElem = playerPageElem?.querySelector('ytmusic-player#player');
  if (!playerElem) return;

  // The player bar is not required, because it is not available in every
  // layout of YouTube Music. The settings menu waits for it by itself.
  const appElem = playerPageElem.closest('ytmusic-app');
  return { appElem, playerPageElem, playerElem };
};

const waitForPlayerElems = () =>
  new Promise((resolve) => {
    const elems = findPlayerElems();
    if (elems) {
      resolve(elems);
      return;
    }

    const observer = new MutationObserver(
      wrapErrorHandler(function onMusicAppMutation() {
        const elems = findPlayerElems();
        if (!elems) return;

        observer.disconnect();
        resolve(elems);
      }, true)
    );
    observer.observe(document, { childList: true, subtree: true });
  });

wrapErrorHandler(async function loadMusicAmbientlight() {
  if (window.musicAmbientlight !== undefined) return;
  window.musicAmbientlight = false;

  const settings = {
    ...getDefaultMusicSettings(),
    ...parseStoredSettings((await storage.get(storageNames)) || {}),
  };

  const { appElem, playerPageElem, playerElem } = await waitForPlayerElems();
  const musicAmbientlight = new MusicAmbientlight(
    playerPageElem,
    playerElem,
    settings
  );
  window.musicAmbientlight = musicAmbientlight;
  const settingsMenu = new MusicSettingsMenu(musicAmbientlight, appElem);

  // Apply the changes made in the YouTube player settings
  storage.addListener(function musicSettingsListener(changes) {
    const changedNames = storageNames.filter((name) => name in changes);
    if (!changedNames.length) return;

    const defaults = getDefaultMusicSettings();
    const changedSettings = Object.fromEntries(
      changedNames.map((storageName) => {
        const name = storageName.replace(/^setting-/, '');
        const value = changes[storageName].newValue;
        return [name, value ?? defaults[name]];
      })
    );
    musicAmbientlight.updateSettings(changedSettings);
    settingsMenu.update();
  });
})();
