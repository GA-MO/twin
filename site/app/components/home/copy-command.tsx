import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyCommand({ command, label, done }: { command: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  const code = useRef<HTMLElement>(null);

  function copy() {
    navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {
        if (code.current) window.getSelection()?.selectAllChildren(code.current);
      },
    );
  }

  return (
    <div className="flex items-stretch rounded-lg border border-fd-border bg-fd-card font-mono text-[0.8125rem]">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto px-3.5 py-2.5 whitespace-nowrap [scrollbar-width:none]">
        <span aria-hidden className="select-none text-fd-muted-foreground">
          $
        </span>
        <code ref={code}>{command}</code>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="flex w-11 shrink-0 items-center justify-center border-l border-fd-border text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fd-ring"
      >
        {copied ? <Check className="size-4 text-fd-primary" /> : <Copy className="size-4" />}
        <span className="sr-only" aria-live="polite">
          {copied ? done : ''}
        </span>
      </button>
    </div>
  );
}
