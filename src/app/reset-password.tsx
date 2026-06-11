import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { ResetPasswordScreen } from '@/components/reset-password-screen';

/**
 * Route вариант на екрана за нова парола — за случая, в който линкът е отворен
 * при вече монтиран Stack (потребител с активна сесия). Без сесия Stack-ът не
 * съществува (auth gate в root layout-а), затова там същият екран се рендира
 * директно от gate-а при засечен recovery URL.
 */
export default function ResetPasswordRoute() {
  const url = Linking.useURL();
  return <ResetPasswordScreen url={url} onDone={() => router.replace('/')} />;
}
