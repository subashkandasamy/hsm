import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.uyirly.app',
  appName: 'Uyirly',

  // The native WebView loads the first-launch entry screen from the live server.
  // Once a hospital slug is selected and saved in Preferences, the app navigates
  // the WebView to https://{slug}.uyirly.com — no app-store resubmission needed
  // for regular feature updates, since those ship via the hosted Next.js app.
  server: {
    url: 'https://app.uyirly.com',
    cleartext: false,
    // Allow in-WebView navigation to tenant subdomains after hospital selection
    allowNavigation: ['*.uyirly.com'],
  },

  ios: {
    // Privacy manifest required by Apple — see ios/App/App/PrivacyInfo.xcprivacy
    // contentInset: 'always' ensures content doesn't hide under the notch
    contentInset: 'always',
    scrollEnabled: true,
  },

  android: {
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#F8FAFC',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Camera: {
      // Permissions declared in AndroidManifest.xml and Info.plist
    },
  },
}

export default config
