package com.uyirly.app;

import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        applySystemBarAppearance();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarAppearance();
    }

    private void applySystemBarAppearance() {
        boolean isDark = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getWindow(), getWindow().getDecorView());

        // Status bar: always teal background with white icons
        getWindow().setStatusBarColor(Color.parseColor("#0D9488"));
        controller.setAppearanceLightStatusBars(false); // false = white icons

        // Navigation bar: match phone theme so icons are always visible
        if (isDark) {
            getWindow().setNavigationBarColor(Color.parseColor("#1E293B")); // dark bg
            controller.setAppearanceLightNavigationBars(false); // white icons on dark
        } else {
            getWindow().setNavigationBarColor(Color.parseColor("#F8FAFC")); // light bg
            controller.setAppearanceLightNavigationBars(true); // dark icons on light
        }
    }
}
