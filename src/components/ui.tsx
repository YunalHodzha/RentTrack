import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, ScrollView, Modal, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Keyboard,
  type ViewStyle, type TextStyle, type TextInputProps, type StyleProp, type DimensionValue,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import ReAnimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, toneColors, spacing, radius, shadow, type Theme, type Tone } from '@/theme';
import { formatDate, formatPeriod, BG_MONTHS } from '@/lib/domain';
import { useToastStore, type ToastItem, type ToastType } from '@/store/toast';
import { useConfirmStore, type ConfirmRequest } from '@/store/confirm';

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

export function Screen({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
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
 * Swipeable row (swipe-to-delete)
 * ------------------------------------------------------------------ */

/**
 * Ред в списък, който при плъзване наляво разкрива червено действие „Изтрий“.
 *
 * Бизнес логиката живее изцяло в `onDelete` (проверки, confirm диалог,
 * soft-delete, toast) — то връща дали редът наистина е изтрит. При `true`
 * редът се анимира навън (височина+прозрачност) и накрая се вика `onDeleted`
 * (обикновено reload на списъка); при `false` действието се прибира обратно.
 */
export function SwipeableRow({ children, onDelete, onDeleted, deleteLabel = 'Изтрий', gap = spacing.md }: {
  children: React.ReactNode;
  onDelete: () => Promise<boolean>;
  onDeleted: () => void;
  deleteLabel?: string;
  /** Разстояние под реда — свива се заедно с него при изтриване. */
  gap?: number;
}) {
  const t = useTheme();
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const busyRef = useRef(false);
  const rowHeight = useSharedValue(0);
  // -1 = неактивно (auto височина); иначе текущата анимирана височина при свиване.
  const collapse = useSharedValue(-1);

  const containerStyle = useAnimatedStyle(() => {
    if (collapse.value < 0) return { marginBottom: gap };
    const f = rowHeight.value > 0 ? collapse.value / rowHeight.value : 0;
    return { height: collapse.value, marginBottom: gap * f, opacity: f, overflow: 'hidden' as const };
  });

  async function handleDelete() {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const deleted = await onDelete();
      if (!deleted) { swipeRef.current?.close(); return; }
      collapse.value = rowHeight.value;
      collapse.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(onDeleted)();
      });
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <ReAnimated.View
      style={containerStyle}
      onLayout={(e) => { if (collapse.value < 0) rowHeight.value = e.nativeEvent.layout.height; }}>
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleDelete}
            accessibilityRole="button"
            accessibilityLabel={deleteLabel}
            style={{
              width: 92, marginLeft: spacing.md, borderRadius: radius.lg,
              backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center',
            }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>{deleteLabel}</Text>
          </TouchableOpacity>
        )}>
        {children}
      </ReanimatedSwipeable>
    </ReAnimated.View>
  );
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
        shadowColor: t.primary,
      }}>
      <Text style={{ color: t.onPrimary, fontSize: 30, lineHeight: 34, fontWeight: '300', marginTop: -2 }}>{icon}</Text>
    </TouchableOpacity>
  );
}

/* ------------------------------------------------------------------ *
 * Form controls
 * ------------------------------------------------------------------ */

export function Field({ label, hint, error, children, style }: { label: string; hint?: string; error?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ marginBottom: spacing.xl }, style]}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: t.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.2 }}>{label}</Text>
      {children}
      {error ? (
        <Text accessibilityRole="alert" style={{ fontSize: 12, fontWeight: '600', color: t.danger, marginTop: 6 }}>{error}</Text>
      ) : hint ? (
        <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 6 }}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps & { multiline?: boolean; error?: boolean }) {
  const t = useTheme();
  const { style, multiline, error, ...rest } = props;
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
          borderColor: error ? t.danger : t.inputBorder,
        },
        multiline ? { minHeight: 92, textAlignVertical: 'top', paddingTop: 12 } : null,
        style as StyleProp<TextStyle>,
      ]}
    />
  );
}

/** Поле за парола със текстов бутон „Покажи/Скрий" (проектът няма иконна библиотека). */
export function PasswordInput(props: TextInputProps & { error?: boolean }) {
  const t = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={{ position: 'relative' }}>
      <Input {...props} secureTextEntry={!visible} style={{ paddingRight: 76 }} />
      <Pressable
        onPress={() => setVisible((v) => !v)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Скрий паролата' : 'Покажи паролата'}
        style={{ position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.primary }}>
          {visible ? 'Скрий' : 'Покажи'}
        </Text>
      </Pressable>
    </View>
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
 * Date / month pickers
 *
 * `DateField` пази стойността като 'yyyy-MM-dd' (формата в базата) и отваря
 * нативния date picker: на Android — императивния диалог (следва системната
 * тема; платформата не позволява да я форсираме), на iOS — spinner в долен
 * лист с `themeVariant` от темата. `MonthField` е лек месец/година селектор
 * от дизайн системата ('yyyy-MM') — нативният picker няма чист „само месец"
 * режим кросплатформено.
 * ------------------------------------------------------------------ */

/** 'yyyy-MM-dd' -> локална Date (без UTC отместване); невалидно -> днес. */
function parseISODate(value: string | null | undefined): Date {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pressable в стила на `Input` — общата обвивка на двете picker полета. */
function PickerTrigger({ text, filled, onPress, onClear }: {
  text: string;
  filled: boolean;
  onPress: () => void;
  onClear?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => { Keyboard.dismiss(); onPress(); }}
      accessibilityRole="button"
      style={{
        backgroundColor: t.inputBg, borderRadius: radius.md, borderWidth: 1, borderColor: t.inputBorder,
        paddingHorizontal: 14, paddingVertical: 13,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
      <Text style={{ fontSize: 16, color: filled ? t.text : t.textMuted }}>{text}</Text>
      {onClear && filled ? (
        <TouchableOpacity onPress={onClear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Изчисти">
          <Text style={{ fontSize: 15, color: t.textMuted, fontWeight: '700' }}>✕</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ fontSize: 15 }}>📅</Text>
      )}
    </Pressable>
  );
}

export function DateField({ value, onChange, onClear, placeholder = 'Изберете дата' }: {
  value: string | null;
  /** Винаги получава валидно 'yyyy-MM-dd'; изчистването минава през `onClear`. */
  onChange: (value: string) => void;
  /** Ако е подаден, полето е „по избор" и показва ✕ за изчистване. */
  onClear?: () => void;
  placeholder?: string;
}) {
  const t = useTheme();
  // iOS: чернова в долния лист — commit чак на „Готово", backdrop = отказ.
  const [draft, setDraft] = useState<Date | null>(null);

  function open() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: parseISODate(value),
        mode: 'date',
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toISODate(date));
        },
      });
    } else {
      setDraft(parseISODate(value));
    }
  }

  return (
    <>
      <PickerTrigger text={value ? formatDate(value) : placeholder} filled={!!value} onPress={open} onClear={onClear} />
      {draft ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setDraft(null)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
            onPress={() => setDraft(null)}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: t.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
                padding: spacing.xl, paddingBottom: spacing.xxl,
              }}>
              <DateTimePicker
                value={draft}
                mode="date"
                display="spinner"
                locale="bg-BG"
                themeVariant={t.isDark ? 'dark' : 'light'}
                onChange={(_event, date) => { if (date) setDraft(date); }}
              />
              <Button label="Готово" onPress={() => { onChange(toISODate(draft)); setDraft(null); }} fullWidth />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

export function MonthField({ value, onChange }: {
  /** 'yyyy-MM' */
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());

  function handleOpen() {
    const m = /^(\d{4})-(\d{2})$/.exec(value);
    setYear(m ? Number(m[1]) : new Date().getFullYear());
    setOpen(true);
  }

  return (
    <>
      <PickerTrigger
        text={/^\d{4}-\d{2}$/.test(value) ? formatPeriod(value) : 'Изберете месец'}
        filled={/^\d{4}-\d{2}$/.test(value)}
        onPress={handleOpen}
      />
      {open ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setOpen(false)}>
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.xxl }}
            onPress={() => setOpen(false)}>
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: t.card, borderRadius: radius.lg, padding: spacing.xl,
                borderWidth: 1, borderColor: t.border, ...shadow.sm, shadowColor: t.shadowColor,
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                <TouchableOpacity onPress={() => setYear((y) => y - 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Предишна година">
                  <Text style={{ fontSize: 20, fontWeight: '800', color: t.primary, paddingHorizontal: spacing.md }}>‹</Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{year}</Text>
                <TouchableOpacity onPress={() => setYear((y) => y + 1)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Следваща година">
                  <Text style={{ fontSize: 20, fontWeight: '800', color: t.primary, paddingHorizontal: spacing.md }}>›</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {BG_MONTHS.map((name, i) => {
                  const period = `${year}-${String(i + 1).padStart(2, '0')}`;
                  const active = period === value;
                  return (
                    <View key={period} style={{ width: '25%', padding: spacing.xs }}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => { onChange(period); setOpen(false); }}
                        style={{
                          paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
                          backgroundColor: active ? t.primary : t.inputBg,
                          borderWidth: 1, borderColor: active ? t.primary : t.inputBorder,
                        }}>
                        <Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? t.onPrimary : t.text }}>
                          {name.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
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
 * Loading skeletons + error state.
 * ------------------------------------------------------------------ */

/** Лек пулсиращ плейсхолдър блок. Композирай го за skeleton оформления. */
export function Skeleton({ height = 14, width = '100%', style }: { height?: number; width?: DimensionValue; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ height, width, borderRadius: radius.sm, backgroundColor: t.cardAlt, opacity: pulse }, style]} />;
}

/** Skeleton, наподобяващ редовете на списък (имоти / наематели). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border,
            padding: spacing.lg,
          }}>
          <Skeleton width={44} height={44} style={{ borderRadius: radius.md }} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="35%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Грешка с разбираемо съобщение и бутон „Опитай отново". */
export function ErrorState({ title = 'Нещо се обърка', message, onRetry, retryLabel = 'Опитай отново' }: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 72 }}>
      <View
        style={{
          width: 92, height: 92, borderRadius: 46,
          backgroundColor: t.dangerSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
        }}>
        <Text style={{ fontSize: 42 }}>⚠️</Text>
      </View>
      <Text style={{ fontSize: 19, fontWeight: '800', color: t.text, textAlign: 'center' }}>{title}</Text>
      {message ? (
        <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 20, maxWidth: 280 }}>
          {message}
        </Text>
      ) : null}
      {onRetry ? <View style={{ marginTop: spacing.xl }}><Button label={retryLabel} onPress={onRetry} /></View> : null}
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
  const insets = useSafeAreaInsets();
  // На Android модалът е цял екран (edge-to-edge от SDK 54 → рисува под status
  // bar-а), затова хедърът „Отказ / Запази" се бута под него с горния safe-area
  // inset. На iOS pageSheet-ът стои под status bar-а, а вътре useSafeAreaInsets
  // връща root (устройствения) inset → добавянето му тук би пре-паднало; затова
  // там оставяме оригиналния отстъп.
  const headerTopPad = Platform.OS === 'android' ? insets.top + spacing.md : spacing.xl;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <View
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, paddingTop: headerTopPad,
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
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
    // Toast-ове с действие стоят по-дълго, за да са натискаеми.
    const duration = item.action ? 6000 : TOAST_DURATION[item.type];
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDismiss(item.id));
    }, duration);
    return () => clearTimeout(timer);
  }, [anim, item.id, item.type, item.action, onDismiss]);

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
        {item.action ? (
          <TouchableOpacity
            onPress={() => { item.action!.onPress(); onDismiss(item.id); }}
            hitSlop={8}
            accessibilityRole="button"
            style={{ paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: accent + '22' }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>{item.action.label}</Text>
          </TouchableOpacity>
        ) : null}
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

/* ------------------------------------------------------------------ *
 * ConfirmDialog — единно потвърждение за разрушителни действия.
 *
 * Императивен API като toast-а (`confirm()` → `Promise<boolean>`), но за разлика
 * от toast-а това е същински RN `Modal` (transparent), за да се показва НАД
 * отворен `SheetModal` — приключване на договор например се пуска отвътре в sheet.
 * Цветовете/типографията/радиусите идват от темата (dark/light), а разрушителното
 * действие е във `danger` тон (червено), не в акцентното емералд зелено.
 * ------------------------------------------------------------------ */

function ConfirmCard({ request, onResolve }: { request: ConfirmRequest; onResolve: (result: boolean) => void }) {
  const t = useTheme();
  const tone: Tone = request.tone === 'danger' ? 'danger' : 'primary';
  const accent = toneColors(t, tone).fg;
  // White reads on the red danger button; on the emerald accent use onPrimary
  // (dark text in dark mode) so the label stays legible on the bright accent.
  const onAccent = tone === 'danger' ? '#fff' : t.onPrimary;
  return (
    <View
      style={{
        width: '100%',
        maxWidth: 380,
        backgroundColor: t.card,
        borderRadius: radius.lg,
        padding: spacing.xl,
        borderWidth: 1,
        borderColor: t.border,
        ...shadow.lg,
        shadowColor: t.shadowColor,
      }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: t.text, letterSpacing: -0.3 }}>{request.title}</Text>
      {request.message ? (
        <Text style={{ fontSize: 14, color: t.textSecondary, marginTop: spacing.sm, lineHeight: 20 }}>{request.message}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
        <Button label={request.cancelLabel ?? 'Отказ'} variant="secondary" onPress={() => onResolve(false)} fullWidth />
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onResolve(true)}
          style={{
            flex: 1,
            backgroundColor: accent,
            borderRadius: radius.md,
            paddingVertical: 14,
            paddingHorizontal: spacing.xl,
            alignItems: 'center',
            justifyContent: 'center',
            ...shadow.sm,
            shadowColor: accent,
            shadowOpacity: 0.3,
          }}>
          <Text style={{ color: onAccent, fontSize: 15, fontWeight: '700' }}>{request.confirmLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Mount once near the app root (inside the SafeAreaProvider), alongside `ToastHost`. */
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current);
  const close = useConfirmStore((s) => s.close);
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={!!current}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={() => close(false)}>
      <View style={{ flex: 1 }}>
        {/* Тап извън картата = отказ (безопасният избор). */}
        <Pressable
          onPress={() => close(false)}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]}
        />
        <View
          pointerEvents="box-none"
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: spacing.xl,
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
          }}>
          {current ? <ConfirmCard request={current} onResolve={close} /> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Re-export tokens so screens can `import { ..., spacing } from '@/components/ui'`. */
export { useTheme, spacing, radius, shadow, toneColors };
export type { Theme, Tone };
