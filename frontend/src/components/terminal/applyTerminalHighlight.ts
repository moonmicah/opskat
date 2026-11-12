import type { Terminal } from "@xterm/xterm";
import type { TerminalTheme } from "@/data/terminalThemes";
import { permissionsScheme, resolveScheme, type HighlightScheme } from "@/data/terminalHighlight";
import { CustomHighlightAddon } from "./addons/customHighlightAddon";

/**
 * 管理终端自定义高亮：
 * - 创建 / 持有 Addon
 * - 主题切换时重新 resolve 颜色并加载
 */
export class TerminalHighlightController {
  private addon: CustomHighlightAddon;
  private schemes: HighlightScheme[] = [permissionsScheme];
  private currentTheme: TerminalTheme | null = null;

  constructor(private terminal: Terminal) {
    this.addon = new CustomHighlightAddon();
    this.terminal.loadAddon(this.addon);
  }

  /** 设置要启用的高亮方案（默认只有 permissions） */
  setSchemes(schemes: HighlightScheme[]): void {
    this.schemes = schemes;
    this.reapply();
  }

  /** 主题变化时调用 */
  applyTheme(theme: TerminalTheme): void {
    this.currentTheme = theme;
    this.reapply();
  }

  /** 关闭所有自定义高亮 */
  disable(): void {
    this.addon.clear();
  }

  dispose(): void {
    this.addon.dispose();
  }

  private reapply(): void {
    if (!this.currentTheme) return;

    // 目前先合并所有 scheme 的 rules；以后可按开关过滤
    const allRules = this.schemes.flatMap((scheme) => {
      const resolved = resolveScheme(scheme, this.currentTheme!);
      return resolved.rules;
    });

    this.addon.setRules(allRules);
  }
}
