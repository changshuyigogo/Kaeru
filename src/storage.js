/*
  App.jsx 用 window.storage 存資料。
  這個檔案在本機環境補上同樣介面的實作。
  - 用 Capacitor 包成 app、跑在原生殼裡時：走 @capacitor/preferences（原生層儲存，
    不會被系統當「網頁快取」清掉，比 localStorage 穩）。
  - 純網頁（開發時的 vite dev server、或還沒包殼之前）：走 localStorage，行為不變。
  之後要換成 SQLite 或後端 API，只要改這裡。
*/

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const PREFIX = "kaeru:";
const isNative = Capacitor.isNativePlatform();

const wait = () => new Promise((r) => setTimeout(r, 0));

export const storage = {
  async get(key) {
    if (isNative) {
      const { value } = await Preferences.get({ key: PREFIX + key });
      if (value === null || value === undefined)
        throw new Error(`key not found: ${key}`);
      return { key, value, shared: false };
    }
    await wait();
    const value = localStorage.getItem(PREFIX + key);
    if (value === null) throw new Error(`key not found: ${key}`);
    return { key, value, shared: false };
  },

  async set(key, value) {
    if (isNative) {
      await Preferences.set({ key: PREFIX + key, value });
      return { key, value, shared: false };
    }
    await wait();
    localStorage.setItem(PREFIX + key, value);
    return { key, value, shared: false };
  },

  async delete(key) {
    if (isNative) {
      await Preferences.remove({ key: PREFIX + key });
      return { key, deleted: true, shared: false };
    }
    await wait();
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true, shared: false };
  },

  async list(prefix = "") {
    if (isNative) {
      const { keys: allKeys } = await Preferences.keys();
      const keys = allKeys
        .filter((k) => k.startsWith(PREFIX + prefix))
        .map((k) => k.slice(PREFIX.length));
      return { keys, prefix, shared: false };
    }
    await wait();
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys, prefix, shared: false };
  },
};

export function installStorage() {
  if (typeof window !== "undefined" && !window.storage) {
    window.storage = storage;
  }
}
