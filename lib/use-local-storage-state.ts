"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const changeEvent = "eatry-hub-storage-change";

function subscribe(key: string, onChange: () => void) {
  const notify = (event: Event) => {
    if (event.type === "storage") {
      const storageEvent = event as StorageEvent;
      if (storageEvent.key !== key && storageEvent.key !== null) return;
    }
    onChange();
  };

  window.addEventListener("storage", notify);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(changeEvent, notify);
  };
}

export function useLocalStorageState<T>(
  key: string,
  initialValue: T,
  isValid: (value: unknown) => value is T,
) {
  const subscribeToKey = useCallback(
    (onChange: () => void) => subscribe(key, onChange),
    [key],
  );
  const getSnapshot = useCallback(() => window.localStorage.getItem(key), [key]);
  const getServerSnapshot = useCallback(() => null, []);
  const serialized = useSyncExternalStore(
    subscribeToKey,
    getSnapshot,
    getServerSnapshot,
  );

  const value = useMemo(() => {
    if (serialized === null) return initialValue;
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (isValid(parsed)) return parsed;
      console.error(`Stored value for "${key}" has an invalid shape.`);
    } catch (error) {
      console.error(`Could not parse stored value for "${key}".`, error);
    }
    return initialValue;
  }, [initialValue, isValid, key, serialized]);

  const setValue = useCallback(
    (nextValue: T | ((currentValue: T) => T)) => {
      const currentSerialized = window.localStorage.getItem(key);
      let currentValue = initialValue;
      if (currentSerialized !== null) {
        try {
          const parsed: unknown = JSON.parse(currentSerialized);
          if (isValid(parsed)) currentValue = parsed;
        } catch (error) {
          console.error(`Could not read stored value for "${key}".`, error);
        }
      }

      const valueToStore =
        typeof nextValue === "function"
          ? (nextValue as (currentValue: T) => T)(currentValue)
          : nextValue;
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      window.dispatchEvent(new Event(changeEvent));
    },
    [initialValue, isValid, key],
  );

  return [value, setValue] as const;
}
