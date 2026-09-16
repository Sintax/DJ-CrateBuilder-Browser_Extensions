/**
 * Minimal in-memory stand-in for the chrome.* APIs the extension uses.
 * Install before importing code under test; uninstall in afterEach.
 */
export function installFakeChrome() {
  const calls = { tabsUpdate: [] };
  const store = new Map();

  const asKeyList = (keys) => (typeof keys === 'string' ? [keys] : keys);

  globalThis.chrome = {
    tabs: {
      update: async (...args) => {
        calls.tabsUpdate.push(args);
        return {};
      },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (keys === null || keys === undefined) {
            return Object.fromEntries(store);
          }
          const out = {};
          for (const k of asKeyList(keys)) {
            if (store.has(k)) out[k] = structuredClone(store.get(k));
          }
          return out;
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) {
            store.set(k, structuredClone(v));
          }
        },
        remove: async (keys) => {
          for (const k of asKeyList(keys)) store.delete(k);
        },
        clear: async () => store.clear(),
      },
    },
  };
  return { calls, store, uninstall: () => { delete globalThis.chrome; } };
}
