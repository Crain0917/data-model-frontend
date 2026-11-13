import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  toggle: () => undefined,
  setMode: () => undefined,
});

const STORAGE_KEY = 'astryx.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      setMode: setModeState,
      toggle: () => setModeState((m) => (m === 'light' ? 'dark' : 'light')),
    }),
    [mode],
  );

  const isDark = mode === 'dark';

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: isDark ? '#7c90ff' : '#4f6bff',
            colorInfo: isDark ? '#7c90ff' : '#4f6bff',
            colorSuccess: isDark ? '#34d399' : '#16a34a',
            colorWarning: isDark ? '#fbbf24' : '#d97706',
            colorError: isDark ? '#f87171' : '#dc2626',
            colorBgBase: isDark ? '#0e1120' : '#ffffff',
            colorBgContainer: isDark ? '#171b2e' : '#ffffff',
            colorBgElevated: isDark ? '#1b2036' : '#ffffff',
            colorBorder: isDark ? '#2a3048' : '#e6e8f0',
            colorBorderSecondary: isDark ? '#242a40' : '#eef0f6',
            colorText: isDark ? '#f1f3fb' : '#1f2333',
            colorTextSecondary: isDark ? '#a7aec4' : '#6b7280',
            colorTextTertiary: isDark ? '#737b93' : '#9ca3af',
            borderRadius: 8,
            controlHeight: 34,
            fontFamily:
              '"Inter", "PingFang SC", "Microsoft YaHei", "Segoe UI", system-ui, -apple-system, sans-serif',
            fontSize: 13,
            boxShadowSecondary: isDark
              ? '0 12px 32px rgba(0,0,0,.5)'
              : '0 12px 32px rgba(31,35,51,.14)',
          },
          components: {
            Button: {
              primaryShadow: '0 4px 12px rgba(79,107,255,.24)',
              fontWeight: 500,
            },
            Table: {
              headerBg: isDark ? '#1d2237' : '#f3f5fa',
              headerSplitColor: 'transparent',
              rowHoverBg: isDark ? 'rgba(124,144,255,.08)' : '#f8faff',
              cellPaddingBlock: 13,
            },
            Drawer: {
              paddingLG: 20,
            },
            Modal: {
              borderRadiusLG: 14,
            },
          },
        }}
      >
        <AntdApp>{children}</AntdApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
