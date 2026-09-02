import { useEffect, useRef } from "react";

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  theme?: "light" | "dark" | "auto";
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

export function Turnstile({ siteKey, onVerify, onExpire, onError, theme = "dark" }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    const renderWidget = () => {
      if (!containerRef.current || !window.turnstile) return;
      // Remove existing widget
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: onVerify,
        "expired-callback": onExpire,
        "error-callback": onError,
        theme,
      });
    };

    // Load Turnstile script if not already loaded
    if (!document.querySelector('script[src*="turnstile"]')) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
      script.async = true;
      window.onTurnstileLoad = renderWidget;
      document.head.appendChild(script);
    } else if (window.turnstile) {
      renderWidget();
    } else {
      window.onTurnstileLoad = renderWidget;
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, [siteKey]);

  return <div ref={containerRef} className="flex justify-center my-4" />;
}
