export function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <pre aria-label={label} tabIndex={0} className="m-0 overflow-x-auto rounded-lg border border-spire-panel-edge bg-spire-bg p-3 text-sm leading-relaxed text-spire-ink">
      <code>{children}</code>
    </pre>
  );
}
