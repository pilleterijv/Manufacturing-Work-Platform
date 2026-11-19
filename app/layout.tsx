import "./globals.css";
import InstallApp from "./components/install-app";
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e85208",
};
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Floorwork | Manufacturing work platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Floorwork", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  description: "Standard work, process timing, training, and DL/TL Standard Work",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {process.env.FLOORWORK_DEMO_MODE === "true" && (
          <div role="note" className="demo-banner">
            <strong>DEMO — FICTIONAL SAMPLE DATA</strong> · Separate practice database. Email, AI and company
            integrations are disabled.
          </div>
        )}
        <InstallApp />
        {children}
      </body>
    </html>
  );
}
