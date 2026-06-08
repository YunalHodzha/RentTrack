import { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  Screen, Card, SectionTitle, Button, useTheme, spacing, toneColors,
} from '@/components/ui';
import { formatMoney, formatPeriod } from '@/lib/domain';
import { generateMonthlyReport, generateYearlyReport, type MonthlyReport, type YearlyReport } from '@/services/reports';

export default function ReportsScreen() {
  const t = useTheme();
  const [view, setView] = useState<'yearly' | 'monthly'>('yearly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(`${year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [yearlyData, setYearlyData] = useState<YearlyReport | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyReport | null>(null);
  // Скелетоните/спинърите за зареждане идват в следваща част на 4.5.3; засега
  // пазим само сетъра, за да остане scaffold-ингът на място.
  const [, setLoading] = useState(false);

  const loadYearlyReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await generateYearlyReport(year);
      setYearlyData(data);
    } catch (error) {
      console.error('Error loading yearly report:', error);
    } finally {
      setLoading(false);
    }
  }, [year]);

  const loadMonthlyReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await generateMonthlyReport(month);
      setMonthlyData(data);
    } catch (error) {
      console.error('Error loading monthly report:', error);
    } finally {
      setLoading(false);
    }
  }, [month]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Справки',
          headerBackTitle: 'Назад',
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.primary,
          headerTitleStyle: { color: t.text, fontWeight: '800' },
          headerShadowVisible: false,
        }}
      />
      <Screen>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
          {/* View selector */}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            <Button
              label="Годишно"
              variant={view === 'yearly' ? 'primary' : 'secondary'}
              onPress={() => setView('yearly')}
              fullWidth
            />
            <Button
              label="Месечно"
              variant={view === 'monthly' ? 'primary' : 'secondary'}
              onPress={() => setView('monthly')}
              fullWidth
            />
          </View>

          {view === 'yearly' ? (
            <>
              {/* Year selector */}
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                <Button
                  label="←"
                  variant="secondary"
                  onPress={() => setYear(year - 1)}
                  style={{ width: 50 }}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: t.text }}>{year}</Text>
                </View>
                <Button
                  label="→"
                  variant="secondary"
                  onPress={() => setYear(year + 1)}
                  style={{ width: 50 }}
                />
              </View>

              <Button label="Зареди справка" onPress={loadYearlyReport} fullWidth style={{ marginBottom: spacing.lg }} />

              {yearlyData && (
                <>
                  <SectionTitle>Годишно резюме {year}</SectionTitle>
                  <Card style={{ marginBottom: spacing.lg }}>
                    <StatRow label="Очакван доход" value={formatMoney(yearlyData.totalIncome)} />
                    <StatRow label="Събрано" value={formatMoney(yearlyData.totalCollected)} tone="success" />
                    <StatRow label="Дължимо" value={formatMoney(yearlyData.totalOutstanding)} tone={yearlyData.totalOutstanding > 0 ? 'warning' : 'success'} />
                  </Card>

                  <SectionTitle>По месеци</SectionTitle>
                  {yearlyData.months.map((monthReport) => (
                    <Card key={monthReport.period} style={{ marginBottom: spacing.md }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>
                          {formatPeriod(monthReport.period)}
                        </Text>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: t.text }}>
                            {formatMoney(monthReport.collected)} / {formatMoney(monthReport.income)}
                          </Text>
                          <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                            {monthReport.outstanding > 0 ? `Дължимо: ${formatMoney(monthReport.outstanding)}` : 'Събрано'}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              {/* Month selector */}
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                <Button
                  label="←"
                  variant="secondary"
                  onPress={() => {
                    const [y, m] = month.split('-').map(Number);
                    const prev = new Date(y, m - 2);
                    setMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  style={{ width: 50 }}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>
                    {formatPeriod(month)}
                  </Text>
                </View>
                <Button
                  label="→"
                  variant="secondary"
                  onPress={() => {
                    const [y, m] = month.split('-').map(Number);
                    const next = new Date(y, m);
                    setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                  }}
                  style={{ width: 50 }}
                />
              </View>

              <Button label="Зареди справка" onPress={loadMonthlyReport} fullWidth style={{ marginBottom: spacing.lg }} />

              {monthlyData && (
                <>
                  <SectionTitle>Месечно резюме</SectionTitle>
                  <Card style={{ marginBottom: spacing.lg }}>
                    <StatRow label="Очакван доход" value={formatMoney(monthlyData.income)} />
                    <StatRow label="Събрано" value={formatMoney(monthlyData.collected)} tone="success" />
                    <StatRow label="Дължимо" value={formatMoney(monthlyData.outstanding)} tone={monthlyData.outstanding > 0 ? 'warning' : 'success'} />
                  </Card>

                  <SectionTitle>По имоти</SectionTitle>
                  {monthlyData.propertyBreakdown.map((prop) => (
                    <Card key={prop.propertyId} style={{ marginBottom: spacing.md }}>
                      <View style={{ marginBottom: spacing.md }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: t.text }}>
                          {prop.propertyName}
                        </Text>
                      </View>
                      <StatRow label="Наем" value={formatMoney(prop.rentAmount)} />
                      <StatRow label="Събрано" value={formatMoney(prop.collected)} tone="success" />
                      <StatRow label="Дължимо" value={formatMoney(prop.outstanding)} tone={prop.outstanding > 0 ? 'warning' : 'success'} />
                    </Card>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      </Screen>
    </>
  );
}

function StatRow({ label, value, tone = 'primary' }: { label: string; value: string; tone?: 'primary' | 'success' | 'warning' }) {
  const t = useTheme();
  const color = toneColors(t, tone).fg;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm }}>
      <Text style={{ fontSize: 14, color: t.textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '700', color }}>{value}</Text>
    </View>
  );
}
