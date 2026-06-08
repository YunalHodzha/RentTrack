import React, { useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
  type ViewStyle, type TextStyle, type TextInputProps, type StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, toneColors, spacing, radius, shadow, type Theme, type Tone } from '@/theme';
import { useToastStore, type ToastItem, type ToastType } from '@/store/toast';

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

/** Large screen title block with safe-area top padding and an optional right action. */
export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + spacing.md,
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.lg,
        backgroundColor: t.bg,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          {subtitle ? (
            <Text style={{ fontSize: 13, fontWeight: '600', color: t.textSecondary, letterSpacing: 0.3 }}>
              {subtitle}
            </Text>
          ) : null}
          <Text style={{ fontSize: 32, fontWeight: '800', color: t.text, letterSpacing: -0.5, marginTop: 2 }}>
            {title}
          </Text>
        </View>
        {right}
      </View>
    </View>
  );
}

export function SectionTitle({ children, right, style }: { children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }, style]}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: t.text, letterSpacing: -0.3 }}>{children}</Text>
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Surfaces
 * ------------------------------------------------------------------ */

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: t.border,
    ...shadow.sm,
    shadowColor: t.shadowColor,
  };
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[base, style]}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

/* ------------------------------------------------------------------ *
 * Badge / pill
 * ------------------------------------------------------------------ */

export function Badge({ label, tone = 'primary' }: { label: string; tone?: Tone }) {
  const t = useTheme();
  const { fg, soft } = toneColors(t, tone);
  return (
    <View style={{ backgroundColor: soft, paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.full, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg, letterSpacing: 0.2 }}>{label}</Text>
    </View>
  );
}

/** A square tinted tile holding an emoji/glyph — used for property-type icons & list leading art. */
export function IconBadge({ icon, tone = 'primary', size = 44 }: { icon: string; tone?: Tone; size?: number }) {
  const t = useTheme();
  const { soft } = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.45 }}>{icon}</Text>
    </View>
  );
}

export function Avatar({ name, size = 46, tone = 'primary' }: { name: string; size?: number; tone?: Tone }) {
  const t = useTheme();
  const { fg, soft } = toneColors(t, tone);
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '800', color: fg }}>{initial}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Buttons
 * ------------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label, onPress, variant = 'primary', tone, fullWidth, style, disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Override text color (e.g. a warning-coloured secondary button). */
  tone?: Tone;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const t = useTheme();

  let bg = t.primary;
  let fg = t.onPrimary;
  let borderColor: string | undefined;

  if (variant === 'secondary') {
    bg = t.cardAlt;
    fg = tone ? toneColors(t, tone).fg : t.text;
    borderColor = t.border;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    fg = tone ? toneColors(t, tone).fg : t.primary;
  } else if (variant === 'danger') {
    bg = 'transparent';
    fg = t.danger;
    borderColor = t.danger;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingVertical: 14,
          paddingHorizontal: spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: spacing.sm,
          opacity: disabled ? 0.5 : 1,
          ...(borderColor ? { borderWidth: 1, borderColor } : null),
          ...(variant === 'primary' ? { ...shadow.sm, shadowColor: t.primary, shadowOpacity: 0.3 } : null),
        },
        fullWidth ? { flex: 1 } : null,
        style,
      ]}>
      <Text style={{ color: fg, fontSize: 15, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Floating action button anchored bottom-right. */
export function FAB({ onPress, icon = '+' }: { onPress: () => void; icon?: string }) {
  const t = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={{
        position: 'absolute', bottom: 28, right: 22,
        width: 58, height: 58, borderRadius: 29,
        backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center',
        ...shadow.lg,
      }}>
      <Text style={{ color: '#fff', fontSize: 30, lineHeight: 34, fontWeight: '300', marginTop: -2 }}>{icon}</Text>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ *
 * Form controls
 * ------------------------------------------------------------------ */

export function Field({ label, hint, children, style }: { label: string; hint?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.2 }}>{label}</Text>
      {children}
      {hint ? <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>{hint}</Text> : null}
    </View>
  );
}

export function Input(props: TextInputProps & { multiline?: boolean }) {
  const t = useTheme();
  const { style, multiline, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={t.textMuted}
      {...rest}
      multiline={multiline}
      style={[
        {
          backgroundColor: t.inputBg,
          borderRadius: radius.md,
          paddingHorizontal: 14,
          paddingVertical: 13,
          color: t.text,
          fontSize: 16,
          borderWidth: 1,
          borderColor: t.inputBorder,
        },
        multiline ? { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 } : null,
        style as StyleProp<TextStyle>,
      ]}
    />
  );
}

export type ChipOption<T extends string | number> = { value: T; label: string };

/** Horizontal-wrapping single-select pill group. */
export function ChipGroup<T extends string | number>({
  options, value, onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={String(opt.value)}
            activeOpacity={0.8}
            onPress={() => onChange(opt.value)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: radius.full,
              backgroundColor: active ? t.primary : t.inputBg,
              borderWidth: 1,
              borderColor: active ? t.primary : t.inputBorder,
            }}>
            <Text style={{ color: active ? t.onPrimary : t.text, fontSize: 14, fontWeight: active ? '700' : '500' }}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

export function InfoRow({ label, value, onPress, valueTone }: { label: string; value: string; onPress?: () => void; valueTone?: Tone }) {
  const t = useTheme();
  const color = valueTone ? toneColors(t, valueTone).fg : t.text;
  const valueNode = (
    <Text
      style={{ fontSize: 15, fontWeight: '700', color: onPress ? t.primary : color, flexShrink: 1, textAlign: 'right', marginLeft: spacing.lg }}>
      {value}{onPress ? '  ›' : ''}
    </Text>
  );
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 }}>
      <Text style={{ fontSize: 14, color: t.textSecondary }}>{label}</Text>
      {onPress ? <TouchableOpacity activeOpacity={0.6} onPress={onPress} style={{ flexShrink: 1 }}>{valueNode}</TouchableOpacity> : valueNode}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.border, marginVertical: spacing.md }} />;
}

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: Tone }) {
  const t = useTheme();
  const { fg } = toneColors(t, tone);
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height: 8, borderRadius: radius.full, backgroundColor: t.isDark ? '#0B1220' : '#E7ECF3', overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: fg, borderRadius: radius.full }} />
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: string; title: string; message?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 72 }}>
      <View
        style={{
          width: 92, height: 92, borderRadius: 46,
          backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
        }}>
        <Text style={{ fontSize: 42 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: 19, fontWeight: '800', color: t.text, textAlign: 'center' }}>{title}</Text>
      {message ? (
        <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
          {message}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: spacing.xl }}>{action}</View> : null}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={t.primary} size="large" />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Bottom-sheet style modal with a standard cancel / title / save header.
 * ------------------------------------------------------------------ */

export function SheetModal({
  visible, onClose, onSave, title, saveLabel = 'Запази', saveDisabled, children,
}: {
  visible: boolean;
  onClose: () => void;
  onSave?: () => void;
  title: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, paddingTop: spacing.xl,
            backgroundColor: t.card, borderBottomWidth: 1, borderBottomColor: t.border,
          }}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={{ color: t.textSecondary, fontSize: 16, fontWeight: '600' }}>Отказ</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{title}</Text>
          {onSave ? (
            <TouchableOpacity onPress={onSave} hitSlop={8} disabled={saveDisabled}>
              <Text style={{ color: saveDisabled ? t.textMuted : t.primary, fontSize: 16, fontWeight: '800' }}>{saveLabel}</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Toast / snackbar — единна обратна връзка.
 *
 * `ToastHost` се монтира веднъж в root layout-а и слуша toast store-а.
 * Стои абсолютно позициониран най-отгоре (под status bar-а, със safe-area
 * отстъп) и не блокира докосванията под себе си (`box-none`). Цветовете идват
 * от темата, така че се спазва dark/light.
 *
 * Забележка: RN `Modal` се рендира над root-а, затова toast от тук НЕ се вижда
 * над отворен `SheetModal`. Затова резултатните toast-ове се показват след
 * затваряне на модала, а валидацията вътре в модал остава inline.
 * ------------------------------------------------------------------ */

/** Колко да стои на екрана според важността (грешките — малко по-дълго). */
const TOAST_DURATION: Record<ToastType, number> = { success: 3000, info: 3500, error: 4500 };

function toastAccent(t: Theme, type: ToastType): string {
  if (type === 'success') return t.success;
  if (type === 'error') return t.danger;
  return t.primary;
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const t = useTheme();
  const accent = toastAccent(t, item.type);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDismiss(item.id));
    }, TOAST_DURATION[item.type]);
    return () => clearTimeout(timer);
  }, [anim, item.id, item.type, onDismiss]);

  function handlePress() {
    Animated.timing(anim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => onDismiss(item.id));
  }

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
      }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handlePress}
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          backgroundColor: t.card,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: t.border,
          borderLeftWidth: 4,
          borderLeftColor: accent,
          paddingVertical: 13,
          paddingHorizontal: spacing.lg,
          ...shadow.md,
          shadowColor: t.shadowColor,
        }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: accent }} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.text, lineHeight: 19 }}>
          {item.message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Mount once near the app root (inside the SafeAreaProvider). */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + spacing.sm,
        left: spacing.lg,
        right: spacing.lg,
        gap: spacing.sm,
      }}>
      {toasts.map((item) => (
        <ToastView key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </View>
  );
}

/** Re-export tokens so screens can `import { ..., spacing } from '@/components/ui'`. */
export { useTheme, spacing, radius, shadow, toneColors };
export type { Theme, Tone };
