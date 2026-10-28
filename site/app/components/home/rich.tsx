export function Rich({ text }: { text: string }) {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="home-code">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
