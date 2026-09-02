import { useState, useEffect, useCallback } from "react";
import { API_BASE } from "../lib/constants";
import { getAccessToken } from "../lib/api";

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);


  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setIsSupported(supported);
    if (supported) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setIsSubscribed(sub !== null);
        });
      });
    }
  }, []);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = useCallback(async () => {
    const token = getAccessToken();
    if (isSupported === false || token === null) return false;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setIsLoading(false); return false; }
      const vapidRes = await fetch(API_BASE + "/api/v1/push/vapid-key");
      const { publicKey } = await vapidRes.json();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subJson = sub.toJSON();
      await fetch(API_BASE + "/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: { p256dh: subJson.keys?.p256dh || "", auth: subJson.keys?.auth || "" } }),
      });
      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      setIsLoading(false);
      return false;
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    const token = getAccessToken();
    if (isSupported === false || token === null) return;
    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(API_BASE + "/api/v1/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
    }
    setIsLoading(false);
  }, [isSupported]);

  const sendTest = useCallback(async () => {
    const token = getAccessToken();
    if (token === null) return;
    await fetch(API_BASE + "/api/v1/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    });
  }, []);

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe, sendTest };
}
