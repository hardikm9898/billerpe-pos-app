import type { CapacitorConfig } from "@capacitor/cli";

// BillerPe POS (Plan 2) talks only to the cloud over HTTPS. Printers on the
// outlet Wi-Fi are reached by the native printer plugin, not the WebView.
const config: CapacitorConfig = {
  appId: "com.billerpe.pos",
  appName: "BillerPe POS",
  webDir: "dist",
  server: { androidScheme: "https" },
  android: { backgroundColor: "#FAF9F7" },
  plugins: {
    // Android 15+ edge to edge: MainActivity pads the app natively (EdgeInsets.java).
    SystemBars: { insetsHandling: "disable" },
    StatusBar: { style: "LIGHT", backgroundColor: "#ffffff", overlaysWebView: false },
  },
};

export default config;
