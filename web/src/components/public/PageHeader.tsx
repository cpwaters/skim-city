export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
}) {
  return (
    <section className="border-b border-noir-700 spotlight hatch">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h1 className="display text-4xl sm:text-6xl text-bone">{title}</h1>
        {intro && <p className="mt-5 text-smoke max-w-2xl leading-relaxed sm:text-lg">{intro}</p>}
      </div>
    </section>
  );
}
