package com.billerpe.pos;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.view.Window;

import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * Keeps the app clear of the status bar, a notch / camera cutout (portrait
 * and landscape), the gesture bar and the keyboard on every phone. Android
 * 15+ draws apps edge to edge; instead of each screen padding itself (which
 * left content under the notch on some phones), the page is padded natively
 * and the strips behind the bars are painted in the app's own colours:
 * the top strip like the header, the bottom strip like the bottom bar.
 * Capacitor's own SystemBars inset handling is off (capacitor.config.ts),
 * so the page sees no insets (env(safe-area-inset-*) = 0).
 */
public final class EdgeInsets {
    private static int top;
    private static int bottom;
    private static boolean dark;
    private static View content;
    private static Strips strips;

    private EdgeInsets() {}

    /** In MainActivity.onCreate, after super.onCreate. */
    public static void apply(Activity activity, int topColor, int bottomColor, boolean darkBars) {
        top = topColor;
        bottom = bottomColor;
        dark = darkBars;
        content = activity.findViewById(android.R.id.content);
        strips = new Strips();
        content.setBackground(strips);
        ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            int ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int padBottom = keyboard ? Math.max(ime, bars.bottom) : bars.bottom;
            v.setPadding(bars.left, bars.top, bars.right, padBottom);
            strips.setBottom(padBottom);
            icons(activity);
            // Zero (not CONSUMED) so the WebView recalculates: https://issues.chromium.org/issues/461332423
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
        icons(activity);
        ViewCompat.requestApplyInsets(content);
    }

    /** The app's theme changed (light / dark): new strip colours and icon colours. */
    public static void setColors(Activity activity, int topColor, int bottomColor, boolean darkBars) {
        top = topColor;
        bottom = bottomColor;
        dark = darkBars;
        if (strips != null) strips.invalidateSelf();
        icons(activity);
    }

    private static void icons(Activity activity) {
        Window window = activity.getWindow();
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, window.getDecorView());
        c.setAppearanceLightStatusBars(!dark);
        c.setAppearanceLightNavigationBars(!dark);
    }

    /** The top and side strips in the page / header colour; the bottom strip in the bottom bar's. */
    private static final class Strips extends Drawable {
        private final Paint paint = new Paint();
        private int bottomHeight;

        void setBottom(int h) {
            if (h != bottomHeight) {
                bottomHeight = h;
                invalidateSelf();
            }
        }

        @Override
        public void draw(@NonNull Canvas canvas) {
            int w = getBounds().width();
            int h = getBounds().height();
            paint.setColor(top);
            canvas.drawRect(0, 0, w, h, paint);
            if (bottomHeight > 0) {
                paint.setColor(bottom);
                canvas.drawRect(0, h - bottomHeight, w, h, paint);
            }
        }

        @Override
        public void setAlpha(int alpha) {}

        @Override
        public void setColorFilter(ColorFilter colorFilter) {}

        @Override
        public int getOpacity() {
            return PixelFormat.OPAQUE;
        }
    }
}
