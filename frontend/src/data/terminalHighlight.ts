import type { TerminalTheme } from "./terminalThemes";

export interface HighlightRuleConfig {
  id: string;
  pattern: string;
  flags?: string;
  colorKey?: keyof Pick<
    TerminalTheme,
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "brightRed"
    | "brightGreen"
    | "brightYellow"
    | "brightBlue"
    | "brightMagenta"
    | "brightCyan"
    | "foreground"
    | "brightBlack"
    | "white"
  >;
  foreground?: string;
  background?: string;
  priority?: number;
  enabled?: boolean;
  /**
   * 若为 true：先匹配整段，再对匹配结果内部的每个字符单独上色
   * （用于权限位，避免污染用户名/文件名）
   */
  perChar?: boolean;
  /** perChar 时使用的字符→颜色映射（语义色） */
  charColors?: Partial<Record<string, HighlightRuleConfig["colorKey"]>>;
}

export interface HighlightScheme {
  id: string;
  name: string;
  rules: HighlightRuleConfig[];
}

export interface ResolvedHighlightRule {
  id: string;
  pattern: string;
  flags: string;
  foreground?: string;
  background?: string;
  priority: number;
  perChar?: boolean;
  /** 已解析的字符颜色 #RRGGBB */
  charColorMap?: Record<string, string>;
}

export interface ResolvedHighlightScheme {
  id: string;
  name: string;
  rules: ResolvedHighlightRule[];
}

/**
 * 只匹配 ls -l 行首的权限字段：
 * drwxr-xr-x  /  -rw-r--r--  /  lrwxrwxrwx  /  crw-rw-rw- 等
 * 后面必须跟空白，避免误伤
 */
export const permissionsScheme: HighlightScheme = {
  id: "permissions",
  name: "Permissions",
  rules: [
    // ① 权限位（你现在已有的）
    {
      id: "perm-mode",
      pattern: "^([dlsbcp-][rwxsStT-]{9})[.+@]?\\s",
      flags: "gm",
      perChar: true,
      priority: 10,
      charColors: {
        d: "blue",
        l: "cyan",
        b: "yellow",
        c: "yellow",
        p: "yellow",
        s: "magenta",
        "-": "brightBlack",
        r: "green",
        w: "yellow",
        x: "red",
        S: "cyan",
        T: "magenta",
      },
    },

    // ② 用户名：权限 + 可选.+@ + 空白 + 链接数 + 空白 + 用户名
    {
      id: "perm-user",
      pattern: "^[dlsbcp-][rwxsStT-]{9}[.+@]?\\s+\\d+\\s+(\\S+)\\s+",
      flags: "gm",
      colorKey: "cyan", // 用户名颜色，可改成 brightCyan / blue 等
      priority: 12,
      // 不要设 perChar
    },

    // ③ 组名：在用户名后再捕获一组
    {
      id: "perm-group",
      pattern: "^[dlsbcp-][rwxsStT-]{9}[.+@]?\\s+\\d+\\s+\\S+\\s+(\\S+)\\s+",
      flags: "gm", // Addon 里会再补 d
      colorKey: "yellow",
      priority: 12,
    },
  ],
};

export const builtinHighlightSchemes: HighlightScheme[] = [permissionsScheme];

export function resolveScheme(scheme: HighlightScheme, theme: TerminalTheme): ResolvedHighlightScheme {
  return {
    id: scheme.id,
    name: scheme.name,
    rules: scheme.rules
      .filter((r) => r.enabled !== false)
      .map((r) => {
        const charColorMap: Record<string, string> = {};
        if (r.charColors) {
          for (const [ch, key] of Object.entries(r.charColors)) {
            if (key) charColorMap[ch] = theme[key];
          }
          // setuid/setgid 的 s 再单独加强一点（可选）
          if (theme.cyan) {
            charColorMap["s"] = theme.cyan;
          }
        }

        return {
          id: r.id,
          pattern: r.pattern,
          flags: r.flags ?? "g",
          foreground: r.foreground ?? (r.colorKey ? theme[r.colorKey] : undefined),
          background: r.background,
          priority: r.priority ?? 0,
          perChar: r.perChar,
          charColorMap: Object.keys(charColorMap).length ? charColorMap : undefined,
        };
      })
      .sort((a, b) => a.priority - b.priority),
  };
}
