"use client";
import { useEffect, useState, useRef } from "react";
type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function InstallApp() {
  const banner = useRef<HTMLElement | null>(null);
  const help = useRef<HTMLDialogElement | null>(null);
  const [installError, setInstallError] = useState("");
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
  useEffect(() => {
    if (!show || !banner.current) return;
    const update = () =>
      document.documentElement.style.setProperty(
        "--install-banner-height",
        `${banner.current?.getBoundingClientRect().height ?? 0}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(banner.current);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--install-banner-height");
    };
  }, [show]);
  return (
    <>
      {!show && (
        <button
          className="install-help-toggle outline"
          onClick={() => help.current?.showModal()}
        >
          Install app / Help
        </button>
      )}
      {show && (
        <aside
          ref={banner}
          className="install-banner"
          aria-label="Install Floorwork"
        >
          <span>
            {ios
              ? "Install on iPad or iPhone: open in Safari, tap Share, then Add to Home Screen."
              : "Add Floorwork to your tablet or computer from your browser’s Install app or Add to Home Screen menu."}
          </span>
          {prompt && (
            <button
              className="primary"
              onClick={async () => {
                const available = prompt;
                setPrompt(null);
                try {
                  await available.prompt();
                  const choice = await available.userChoice;
                  if (choice.outcome === "accepted") setShow(false);
                } catch {
                  setInstallError(
                    "The browser could not open installation. Use the instructions below.",
                  );
                  help.current?.showModal();
                }
              }}
            >
              Install app
            </button>
          )}
          <button className="outline" onClick={() => help.current?.showModal()}>
            Installation help
          </button>
          <button
            className="outline"
            aria-label="Dismiss installation help"
            onClick={() => setShow(false)}
          >
            Dismiss
          </button>
        </aside>
      )}
      <dialog
        ref={help}
        className="install-help-dialog"
        aria-labelledby="install-help-title"
      >
        <h2 id="install-help-title">Install on your device</h2>
        {installError && <p role="status">{installError}</p>}
        <p>Open the app’s HTTPS web address on the device you want to use.</p>
        <h3>iPad or iPhone</h3>
        <p>
          Open in Safari. Tap Share (the square with an arrow), then Add to Home
          Screen. Scroll down in the Share menu if needed. Keep Open as Web App
          enabled if offered, then tap Add.
        </p>
        <h3>Android tablet or phone</h3>
        <p>
          Open in Chrome. Tap the three-dot menu, then Install app or Add to
          Home screen, and follow the prompts.
        </p>
        <h3>Windows or Mac</h3>
        <p>
          In Chrome, open the three-dot menu and look under Cast, save, and
          share → Install page as app. In Edge, use the menu → Apps → Install
          this site as an app. Menu names can vary.
        </p>
        <h3>If the install option is missing</h3>
        <p>
          Use a normal browser tab, check whether the app is already installed,
          and refresh the page. Installation may be restricted by your company’s
          browser policy. The browser controls whether an Install button is
          offered; this help remains available.
        </p>
        <p>
          The server must stay running to use the app. A Codespace must be
          running too, and a private preview may require your GitHub sign-in. A
          localhost address from a computer will not work on your tablet.
        </p>
        <form method="dialog">
          <button className="primary">Close installation help</button>
        </form>
      </dialog>
    </>
  );
}
