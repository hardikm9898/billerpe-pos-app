package com.billerpe.pos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.text.Html;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

/**
 * Sends ESC/POS bytes to the outlet's printers, from the phone that acts
 * (owner decision: the phone that sends a KOT prints it).
 *
 *  wifi      raw TCP to ip:port (9100) - network thermal printers
 *  bluetooth SPP (RFCOMM) to a paired printer, by MAC
 *  usb       bulk OUT endpoint of a USB printer (OTG / terminal port)
 *  builtin   the terminal's own printer: most Android POS terminals expose
 *            it as a paired virtual Bluetooth printer (Sunmi "InnerPrinter"
 *            and similar) or as a USB printer - found by findBuiltIn()
 *  system    Android's print dialog (any printer app, or Save as PDF)
 *
 * Prints run one at a time on a background thread, so two KOTs never
 * interleave on the same printer.
 */
@CapacitorPlugin(
    name = "PosPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT }, alias = "bluetooth")
    }
)
public class PosPrinterPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String USB_PERMISSION = "com.billerpe.pos.USB_PERMISSION";
    /** Names built-in printers of Android POS terminals advertise over virtual Bluetooth. */
    private static final Pattern BUILT_IN_BT = Pattern.compile(
        "innerprinter|iposprinter|virtual ?bluetooth ?printer|built-?in|bluetooth ?printer|mpt-?ii|pos ?printer|printer001",
        Pattern.CASE_INSENSITIVE
    );

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    /** A failure the app shows to staff: code = unreachable | unsupported | permission | not-found. */
    private static class PrintFailure extends Exception {
        final String code;

        PrintFailure(String code, String message) {
            super(message);
            this.code = code;
        }
    }

    /* ------------------------------ print ------------------------------ */

    @PluginMethod
    public void print(PluginCall call) {
        String connection = call.getString("connection", "");
        if (needsBluetooth(connection, call.getString("address", "")) && !bluetoothAllowed()) {
            requestPermissionForAlias("bluetooth", call, "afterBluetoothPermission");
            return;
        }
        run(call);
    }

    @PermissionCallback
    private void afterBluetoothPermission(PluginCall call) {
        if (bluetoothAllowed()) run(call);
        else call.reject("Allow Nearby devices (Bluetooth) for BillerPe POS to use this printer.", "permission");
    }

    private void run(PluginCall call) {
        final String connection = call.getString("connection", "");
        final String address = call.getString("address", "");
        final String data = call.getString("data", "");
        io.execute(() -> {
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                switch (connection) {
                    case "wifi":
                        printTcp(address, bytes);
                        break;
                    case "bluetooth":
                        printBluetooth(address, bytes);
                        break;
                    case "usb":
                        printUsb(address, bytes);
                        break;
                    case "builtin":
                        printBuiltIn(address, bytes);
                        break;
                    default:
                        throw new PrintFailure("unsupported", "This printer connection is not supported.");
                }
                call.resolve();
            } catch (PrintFailure f) {
                call.reject(f.getMessage(), f.code);
            } catch (SecurityException e) {
                // Android refused a Bluetooth permission: say so plainly, not the raw text.
                call.reject("Allow Nearby devices (Bluetooth) for BillerPe POS in Android Settings > Apps > BillerPe POS > Permissions.", "permission");
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "Could not print", "unreachable");
            }
        });
    }

    /* ------------------------------ Wi-Fi ------------------------------ */

    private void printTcp(String address, byte[] bytes) throws PrintFailure {
        String host = address;
        int port = 9100;
        int colon = address.lastIndexOf(':');
        if (colon > 0) {
            host = address.substring(0, colon);
            try {
                port = Integer.parseInt(address.substring(colon + 1));
            } catch (NumberFormatException ignored) {
                port = 9100;
            }
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 5000);
            socket.setSoTimeout(10000);
            OutputStream out = socket.getOutputStream();
            out.write(bytes);
            out.flush();
            // Let the printer take the last bytes before the connection closes.
            Thread.sleep(200);
        } catch (IOException e) {
            throw new PrintFailure("unreachable", "not reachable at " + host + ":" + port);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /* ------------------------------ Bluetooth ------------------------------ */

    private boolean needsBluetooth(String connection, String address) {
        return "bluetooth".equals(connection) || ("builtin".equals(connection) && !address.startsWith("usb:"));
    }

    private boolean bluetoothAllowed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        return getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() throws PrintFailure {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
        if (adapter == null) throw new PrintFailure("unsupported", "This device has no Bluetooth.");
        if (!adapter.isEnabled()) throw new PrintFailure("unreachable", "Bluetooth is off - turn it on.");
        return adapter;
    }

    @SuppressLint("MissingPermission")
    private void printBluetooth(String mac, byte[] bytes) throws PrintFailure {
        if (mac == null || mac.isEmpty()) throw new PrintFailure("not-found", "no Bluetooth printer picked");
        BluetoothAdapter adapter = adapter();
        BluetoothDevice device;
        try {
            device = adapter.getRemoteDevice(mac.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new PrintFailure("not-found", "the Bluetooth address " + mac + " is not valid");
        }
        // Only paired printers are used, so there is no search to stop - but
        // if Android has one running it slows the connection down. Stopping
        // it needs BLUETOOTH_SCAN on Android 12+, which this app does not
        // ask for (it never scans): skipped when not allowed (owner bug list
        // 2026-09-26, "BLUETOOTH_SCAN permission" error on test print).
        try {
            if (adapter.isDiscovering()) adapter.cancelDiscovery();
        } catch (SecurityException ignored) {
            // not allowed to scan - connect anyway
        }
        BluetoothSocket socket = null;
        try {
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP);
                socket.connect();
            } catch (IOException first) {
                // Many cheap printers only accept an insecure RFCOMM link.
                closeQuietly(socket);
                socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
                socket.connect();
            }
            OutputStream out = socket.getOutputStream();
            // Small chunks: Bluetooth printers have tiny input buffers.
            for (int i = 0; i < bytes.length; i += 512) {
                out.write(bytes, i, Math.min(512, bytes.length - i));
                out.flush();
                Thread.sleep(20);
            }
            Thread.sleep(400);
        } catch (IOException e) {
            throw new PrintFailure("unreachable", "not reachable over Bluetooth - is it on and in range?");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            closeQuietly(socket);
        }
    }

    private static void closeQuietly(BluetoothSocket socket) {
        if (socket == null) return;
        try {
            socket.close();
        } catch (IOException ignored) {
            // nothing to do
        }
    }

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void listBluetooth(PluginCall call) {
        if (!bluetoothAllowed()) {
            requestPermissionForAlias("bluetooth", call, "afterListPermission");
            return;
        }
        try {
            JSArray list = new JSArray();
            Set<BluetoothDevice> bonded = adapter().getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice d : bonded) {
                    JSObject o = new JSObject();
                    o.put("name", d.getName() != null ? d.getName() : d.getAddress());
                    o.put("address", d.getAddress());
                    list.put(o);
                }
            }
            JSObject ret = new JSObject();
            ret.put("devices", list);
            call.resolve(ret);
        } catch (PrintFailure f) {
            call.reject(f.getMessage(), f.code);
        } catch (SecurityException e) {
            call.reject("Allow Nearby devices (Bluetooth) for BillerPe POS in Android Settings > Apps > BillerPe POS > Permissions.", "permission");
        }
    }

    @PermissionCallback
    private void afterListPermission(PluginCall call) {
        if (bluetoothAllowed()) listBluetooth(call);
        else call.reject("Allow Nearby devices (Bluetooth) for BillerPe POS to find printers.", "permission");
    }

    /* ------------------------------ USB ------------------------------ */

    private UsbManager usb() {
        return (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    }

    private static boolean isPrinter(UsbDevice d) {
        for (int i = 0; i < d.getInterfaceCount(); i++) {
            if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        }
        return false;
    }

    private static String usbAddress(UsbDevice d) {
        return String.format(Locale.ROOT, "usb:%04x:%04x", d.getVendorId(), d.getProductId());
    }

    private static String usbName(UsbDevice d) {
        String name = Build.VERSION.SDK_INT >= 21 && d.getProductName() != null ? d.getProductName() : "USB printer";
        return String.format(Locale.ROOT, "%s (0x%04x)", name, d.getVendorId());
    }

    /** The attached device for "usb:vvvv:pppp", or the first printer-class device. */
    private UsbDevice findUsb(String address) {
        UsbManager manager = usb();
        if (manager == null) return null;
        UsbDevice fallback = null;
        for (UsbDevice d : manager.getDeviceList().values()) {
            if (address != null && address.equalsIgnoreCase(usbAddress(d))) return d;
            if (fallback == null && isPrinter(d)) fallback = d;
        }
        return address == null || address.isEmpty() || !address.startsWith("usb:") ? fallback : null;
    }

    private boolean askUsbPermission(UsbDevice device) throws InterruptedException {
        UsbManager manager = usb();
        if (manager.hasPermission(device)) return true;
        final CountDownLatch done = new CountDownLatch(1);
        final boolean[] granted = { false };
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (USB_PERMISSION.equals(intent.getAction())) {
                    granted[0] = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                    done.countDown();
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(USB_PERMISSION), ContextCompat.RECEIVER_NOT_EXPORTED);
        try {
            Intent intent = new Intent(USB_PERMISSION).setPackage(getContext().getPackageName());
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
            manager.requestPermission(device, PendingIntent.getBroadcast(getContext(), 0, intent, flags));
            done.await(30, TimeUnit.SECONDS);
        } finally {
            getContext().unregisterReceiver(receiver);
        }
        return granted[0] || manager.hasPermission(device);
    }

    private void printUsb(String address, byte[] bytes) throws PrintFailure {
        UsbDevice device = findUsb(address);
        if (device == null) throw new PrintFailure("unreachable", "not connected - check the USB cable");
        UsbInterface iface = null;
        UsbEndpoint out = null;
        for (int i = 0; i < device.getInterfaceCount() && out == null; i++) {
            UsbInterface candidate = device.getInterface(i);
            for (int e = 0; e < candidate.getEndpointCount(); e++) {
                UsbEndpoint ep = candidate.getEndpoint(e);
                if (ep.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.getDirection() == UsbConstants.USB_DIR_OUT) {
                    iface = candidate;
                    out = ep;
                    break;
                }
            }
        }
        if (out == null) throw new PrintFailure("unsupported", "this USB device is not a printer this app can drive");
        try {
            if (!askUsbPermission(device)) throw new PrintFailure("permission", "USB access was not allowed");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new PrintFailure("unreachable", "USB access was interrupted");
        }
        UsbDeviceConnection conn = usb().openDevice(device);
        if (conn == null) throw new PrintFailure("unreachable", "could not open the USB printer");
        try {
            if (!conn.claimInterface(iface, true)) throw new PrintFailure("unreachable", "the USB printer is busy");
            for (int i = 0; i < bytes.length; i += 16384) {
                int len = Math.min(16384, bytes.length - i);
                byte[] chunk = new byte[len];
                System.arraycopy(bytes, i, chunk, 0, len);
                if (conn.bulkTransfer(out, chunk, len, 5000) < 0) throw new PrintFailure("unreachable", "the USB printer did not take the data");
            }
        } finally {
            conn.releaseInterface(iface);
            conn.close();
        }
    }

    @PluginMethod
    public void listUsb(PluginCall call) {
        JSArray list = new JSArray();
        UsbManager manager = usb();
        if (manager != null) {
            for (UsbDevice d : manager.getDeviceList().values()) {
                JSObject o = new JSObject();
                o.put("name", usbName(d));
                o.put("address", usbAddress(d));
                list.put(o);
            }
        }
        JSObject ret = new JSObject();
        ret.put("devices", list);
        call.resolve(ret);
    }

    /* ------------------------------ built-in ------------------------------ */

    private void printBuiltIn(String address, byte[] bytes) throws PrintFailure {
        if (address != null && address.startsWith("usb:")) {
            printUsb(address, bytes);
            return;
        }
        if (address != null && !address.isEmpty()) {
            printBluetooth(address, bytes);
            return;
        }
        JSObject found = detectBuiltIn();
        if (!Boolean.TRUE.equals(found.getBool("found"))) throw new PrintFailure("not-found", "no built-in printer found on this terminal");
        printBuiltIn(found.getString("address"), bytes);
    }

    @SuppressLint("MissingPermission")
    private JSObject detectBuiltIn() {
        JSObject ret = new JSObject();
        ret.put("found", false);
        try {
            if (bluetoothAllowed()) {
                BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
                BluetoothAdapter adapter = manager != null ? manager.getAdapter() : null;
                if (adapter != null && adapter.isEnabled() && adapter.getBondedDevices() != null) {
                    for (BluetoothDevice d : adapter.getBondedDevices()) {
                        String name = d.getName() != null ? d.getName() : "";
                        if (BUILT_IN_BT.matcher(name).find()) {
                            ret.put("found", true);
                            ret.put("driver", "Virtual Bluetooth (" + name + ")");
                            ret.put("name", "Built-in printer");
                            ret.put("connection", "builtin");
                            ret.put("address", d.getAddress());
                            return ret;
                        }
                    }
                }
            }
        } catch (SecurityException ignored) {
            // Bluetooth not allowed: try USB below.
        }
        UsbDevice device = findUsb("");
        if (device != null) {
            ret.put("found", true);
            ret.put("driver", "USB (" + usbName(device) + ")");
            ret.put("name", "Built-in printer");
            ret.put("connection", "builtin");
            ret.put("address", usbAddress(device));
        }
        ret.put("model", Build.MANUFACTURER + " " + Build.MODEL);
        return ret;
    }

    @PluginMethod
    public void findBuiltIn(PluginCall call) {
        if (!bluetoothAllowed()) {
            requestPermissionForAlias("bluetooth", call, "afterFindPermission");
            return;
        }
        io.execute(() -> call.resolve(detectBuiltIn()));
    }

    @PermissionCallback
    private void afterFindPermission(PluginCall call) {
        // Without Bluetooth only a USB built-in printer can be found.
        io.execute(() -> call.resolve(detectBuiltIn()));
    }

    /* ------------------------------ system print ------------------------------ */

    /** Android's print dialog for the receipt text (any printer app, or Save as PDF). */
    @PluginMethod
    public void printText(PluginCall call) {
        final String title = call.getString("title", "BillerPe");
        final String text = call.getString("text", "");
        getActivity().runOnUiThread(() -> {
            try {
                final WebView web = new WebView(getActivity());
                web.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(title);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                            .setMediaSize(PrintAttributes.MediaSize.ISO_A6)
                            .build();
                        pm.print(title, adapter, attrs);
                        call.resolve();
                    }
                });
                String html = "<html><body style='margin:0'><pre style='font:13px monospace;white-space:pre-wrap'>"
                    + Html.escapeHtml(text) + "</pre></body></html>";
                web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject("Could not open Android printing", "unsupported");
            }
        });
    }
}
