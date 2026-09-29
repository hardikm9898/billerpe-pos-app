package com.billerpe.pos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own printer driver (Wi-Fi / Bluetooth / USB / built-in / system print).
        registerPlugin(PosPrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
