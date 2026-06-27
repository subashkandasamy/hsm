package com.uyirly.app;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Prevent WebView from drawing behind the status bar and navigation bar
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    }
}
