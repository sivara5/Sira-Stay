import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NetworkBanner } from '@/components/network-banner';
import { PaymentRecovery } from '@/components/payment-recovery';
import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { useNetwork } from '@/lib/network';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <I18nProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </I18nProvider>
  );
}

function RootNavigator() {
  const { ready, user } = useAuth();
  const { ready: langReady, t } = useI18n();
  const insets = useSafeAreaInsets();
  const { online } = useNetwork();

  useEffect(() => {
    if (ready && langReady) SplashScreen.hideAsync();
  }, [ready, langReady]);

  if (!ready || !langReady) return null;
  const registered = user?.registrationStep === 'done';

  return (
    <View style={styles.root}>
      <StatusBar style={online ? 'dark' : 'light'} />
      <NetworkBanner topInset={insets.top} />
      {/* While offline the banner covers the status bar, so screens below must not add it again. */}
      <SafeAreaInsetsContext.Provider value={online ? insets : { ...insets, top: 0 }}>
        <Stack
          screenOptions={{
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Protected guard={!registered}>
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={registered}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="property/[id]" options={{ title: '' }} />
            <Stack.Screen name="property/new" options={{ title: t('new.title') }} />
            <Stack.Screen name="owner/verify" options={{ title: t('onb.kycTitle') }} />
            <Stack.Screen name="listing/[id]/photos" options={{ title: t('photos.manage') }} />
            <Stack.Screen name="messages" options={{ title: t('messages.title') }} />
            <Stack.Screen name="district-pass" options={{ title: t('pass.title') }} />
            <Stack.Screen name="unlock/[id]/report" options={{ title: t('report.title') }} />
            <Stack.Screen name="admin/reports" options={{ title: t('admin.title') }} />
            <Stack.Screen name="book/[id]" options={{ title: t('book.title') }} />
            <Stack.Screen name="checkout/[paymentId]" options={{ title: t('pay.title'), gestureEnabled: false }} />
            <Stack.Screen name="booking/[id]/index" options={{ title: t('bookings.detailsTitle') }} />
            <Stack.Screen name="booking/[id]/map" options={{ title: t('map.title') }} />
            <Stack.Screen name="chat/[propertyId]/[tenantId]" options={{ title: t('messages.title') }} />
            <Stack.Screen name="payments" options={{ title: t('payments.title') }} />
          </Stack.Protected>
        </Stack>
      </SafeAreaInsetsContext.Provider>
      {registered && <PaymentRecovery />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
});
