import type { Terminal, ITerminalAddon, IMarker, IDecoration, IDisposable } from "@xterm/xterm";
import type { ResolvedHighlightScheme, ResolvedHighlightRule } from "@/data/terminalHighlight";

interface CompiledRule {
  id: string;
  regex: RegExp;
  foreground?: string;
  background?: string;
  priority: number;
  perChar?: boolean;
  charColorMap?: Record<string, string>;
}

interface ActiveDecoration {
  decoration: IDecoration;
  marker: IMarker;
}

/**
 * 自定义高亮 Addon
 * - 只消费已 resolve 的 scheme（颜色已是 #RRGGBB）
 * - 扫描当前视口 buffer，用 decoration 上色
 */
export class CustomHighlightAddon implements ITerminalAddon {
  private terminal: Terminal | undefined;
  private rules: CompiledRule[] = [];
  private decorations: ActiveDecoration[] = [];
  private disposables: IDisposable[] = [];
  private rafId = 0;

  activate(terminal: Terminal): void {
    this.terminal = terminal;
    this.disposables.push(
      terminal.onWriteParsed(() => this.scheduleUpdate()),
      terminal.onScroll(() => this.scheduleUpdate()),
      terminal.onResize(() => this.scheduleUpdate())
    );
  }

  dispose(): void {
    this.clearDecorations();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.terminal = undefined;
  }

  /** 加载已解析的方案 */
  loadScheme(scheme: ResolvedHighlightScheme): void {
    this.setRules(scheme.rules);
  }

  /** 直接设置已解析规则 */
  setRules(rules: ResolvedHighlightRule[]): void {
    this.rules = rules.map((r) => ({
      id: r.id,
      // 编译正则时带上 d，才能用 match.indices
      regex: new RegExp(
        r.pattern,
        (r.flags.includes("g") ? r.flags : `${r.flags}g`) + (r.flags.includes("d") ? "" : "d")
      ),
      foreground: r.foreground,
      background: r.background,
      priority: r.priority,
      perChar: r.perChar,
      charColorMap: r.charColorMap,
    }));
    this.scheduleUpdate();
  }

  /** 清空高亮 */
  clear(): void {
    this.rules = [];
    this.clearDecorations();
  }

  private scheduleUpdate(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      this.updateHighlights();
    });
  }

  private clearDecorations(): void {
    for (const item of this.decorations) {
      item.decoration.dispose();
      item.marker.dispose();
    }
    this.decorations = [];
  }

  private updateHighlights(): void {
    const term = this.terminal;
    if (!term || this.rules.length === 0) {
      this.clearDecorations();
      return;
    }

    this.clearDecorations();

    const buffer = term.buffer.active;
    const start = buffer.viewportY;
    const end = Math.min(start + term.rows, buffer.length);
    const cursorY = buffer.baseY + buffer.cursorY;

    for (let y = start; y < end; y++) {
      const line = buffer.getLine(y);
      if (!line) continue;

      let lineText = "";
      for (let x = 0; x < term.cols; x++) {
        const cell = line.getCell(x);
        lineText += cell ? cell.getChars() || " " : " ";
      }

      const trimmed = lineText.replace(/\s+$/, "");
      if (!trimmed) continue;

      for (const rule of this.rules) {
        rule.regex.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = rule.regex.exec(trimmed)) !== null) {
          const body = match[1] ?? match[0];
          if (!body || body.length <= 0) {
            rule.regex.lastIndex++;
            continue;
          }

          const full = match[0];
          // 组名用 lastIndexOf，避免 "root root" 时命中第一个
          // 用户名用 indexOf，命中第一个
          const isGroup = rule.id === "perm-group" || rule.id.endsWith("-group");
          const rel = isGroup ? full.lastIndexOf(body) : full.indexOf(body);
          const startCol = match.index + Math.max(0, rel);

          if (rule.perChar && rule.charColorMap) {
            for (let i = 0; i < body.length; i++) {
              const color = rule.charColorMap[body[i]];
              if (!color) continue;

              const marker = term.registerMarker(y - cursorY);
              if (!marker) continue;

              const decoration = term.registerDecoration({
                marker,
                x: startCol + i,
                width: 1,
                foregroundColor: color, // 必须是 #RRGGBB
                layer: "top",
              });

              if (decoration) {
                this.decorations.push({ decoration, marker });
              } else {
                marker.dispose();
              }
            }
          } else if (rule.foreground || rule.background) {
            const marker = term.registerMarker(y - cursorY);
            if (!marker) continue;

            const decoration = term.registerDecoration({
              marker,
              x: startCol,
              width: body.length,
              foregroundColor: rule.foreground,
              backgroundColor: rule.background,
              layer: "top",
            });

            if (decoration) {
              this.decorations.push({ decoration, marker });
            } else {
              marker.dispose();
            }
          }
        }
      }
    }
  }
}
