(() => {
  const EXACT_USER_KEYS = new Set([
    'rerun.accounts',
    'np.selected.accountId',
    'np.pendingLibraryUploads',
    'np.ads.tab',
  ]);
  const PREFIX_USER_KEYS = [
    'np.streamSchedule.',
    'np.mainVideoCleared.',
    'npLiveConnectAccordion:',
  ];
  const LEGACY_PREFIX = 'np.legacy.';
  const WEB_USER_KEY = 'np.web.active.username';
  const LEGACY_USER_KEY = 'np.active.username';
  const rawStorage = window.localStorage;
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;
  const nativeKey = Storage.prototype.key;
  const nativeClear = Storage.prototype.clear;

  function cleanUser(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  }

  function readRaw(storage, key) {
    return nativeGetItem.call(storage instanceof Storage ? storage : rawStorage, key);
  }

  function writeRaw(storage, key, value) {
    return nativeSetItem.call(storage instanceof Storage ? storage : rawStorage, key, value);
  }

  function removeRaw(storage, key) {
    return nativeRemoveItem.call(storage instanceof Storage ? storage : rawStorage, key);
  }

  function activeUser() {
    const webUser = readRaw(rawStorage, WEB_USER_KEY);
    const legacyUser = readRaw(rawStorage, LEGACY_USER_KEY);
    const user = cleanUser(window.__npActiveUsername || webUser || legacyUser || '');
    if (user && !webUser) writeRaw(rawStorage, WEB_USER_KEY, user);
    return user;
  }

  function setActiveUser(value) {
    const user = cleanUser(value);
    window.__npActiveUsername = user;
    if (user) writeRaw(rawStorage, WEB_USER_KEY, user);
    else removeRaw(rawStorage, WEB_USER_KEY);
    return user;
  }

  function isUserKey(key) {
    const name = String(key || '');
    return EXACT_USER_KEYS.has(name) || PREFIX_USER_KEYS.some((prefix) => name.startsWith(prefix));
  }

  function scopedKey(key) {
    const name = String(key || '');
    if (!isUserKey(name)) return name;
    const user = activeUser();
    return `${user ? `np.user.${user}.` : LEGACY_PREFIX}${name}`;
  }

  function isScopedStorage(storage) {
    return storage instanceof Storage;
  }

  Storage.prototype.getItem = function getItem(key) {
    return nativeGetItem.call(this, isScopedStorage(this) ? scopedKey(key) : key);
  };

  Storage.prototype.setItem = function setItem(key, value) {
    return nativeSetItem.call(this, isScopedStorage(this) ? scopedKey(key) : key, value);
  };

  Storage.prototype.removeItem = function removeItem(key) {
    return nativeRemoveItem.call(this, isScopedStorage(this) ? scopedKey(key) : key);
  };

  Storage.prototype.key = function key(index) {
    return nativeKey.call(this instanceof Storage ? this : rawStorage, index);
  };

  Storage.prototype.clear = function clear() {
    return nativeClear.call(this instanceof Storage ? this : rawStorage);
  };

  function usernameFromStatus(status) {
    if (!status || !status.licensed) return '';
    return status.username || status.user || status.displayName || '';
  }

  function wrapRerun(api) {
    if (!api || api.__npUserScopeWrapped) return api;
    const originalLogin = api.licenseLogin?.bind(api);
    const originalStatus = api.getLicenseStatus?.bind(api);
    const originalLogout = api.licenseLogout?.bind(api);

    if (originalLogin) {
      api.licenseLogin = async (...args) => {
        const result = await originalLogin(...args);
        if (result?.licensed) setActiveUser(usernameFromStatus(result));
        return result;
      };
    }

    if (originalStatus) {
      api.getLicenseStatus = async (...args) => {
        const result = await originalStatus(...args);
        if (result?.licensed) setActiveUser(usernameFromStatus(result));
        else if (result && result.licensed === false) setActiveUser('');
        return result;
      };
    }

    if (originalLogout) {
      api.licenseLogout = async (...args) => {
        try {
          return await originalLogout(...args);
        } finally {
          setActiveUser('');
          if (!window.__npSessionReloading) {
            window.__npSessionReloading = true;
            window.setTimeout(() => location.replace(location.pathname + location.search + location.hash), 80);
          }
        }
      };
    }

    Object.defineProperty(api, '__npUserScopeWrapped', { value: true });
    return api;
  }

  window.npSetActiveUser = setActiveUser;

  if (window.rerun) {
    wrapRerun(window.rerun);
  } else {
    Object.defineProperty(window, 'rerun', {
      configurable: true,
      get() {
        return this.__npRerun;
      },
      set(value) {
        this.__npRerun = wrapRerun(value);
      },
    });
  }
})();
