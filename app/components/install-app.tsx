"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    if (!window.isSecureContext) return;
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    const standalone =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone;
    const apple =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIos(apple);
    setShow(!standalone);
    const before = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const installed = () => {
      setShow(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", before);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", before);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  if (!show) return null;
  return (
    <aside className="install-banner" aria-label="Install Floorwork">
      <span>
        {ios
          ? "Install on iPad or iPhone: open in Safari, tap Share, then Add to Home Screen."
          : "Add Floorwork to your tablet or computer from your browser’s Install app or Add to Home Screen menu."}
      </span>
      {prompt && (
        <button
          className="primary"
          onClick={async () => {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            setPrompt(null);
            if (choice.outcome === "accepted") setShow(false);
          }}
        >
          Install app
        </button>
      )}
      <button
        className="outline"
        aria-label="Dismiss installation help"
        onClick={() => setShow(false)}
      >
        Dismiss
      </button>
    </aside>
  );
}
