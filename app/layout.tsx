import "./globals.css";
import InstallApp from "./components/install-app";
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#e85208",
};
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Floorwork | Manufacturing work platform",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Floorwork", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
  description:
    "Standard work, process timing, training, and DL/TL Standard Work",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InstallApp />
        {children}
      </body>
    </html>
  );
}
