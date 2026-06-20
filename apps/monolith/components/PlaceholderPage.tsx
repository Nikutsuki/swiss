type PlaceholderPageProps = {
  title: string;
  description?: string;
};

export default function PlaceholderPage({
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <div className="flex flex-col px-4 sm:px-8 lg:px-24 pt-8 sm:pt-12 lg:pt-24 pb-8 sm:pb-12 lg:pb-24">
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-4 max-w-2xl text-lg text-(--on-surface-variant)">
          {description}
        </p>
      ) : null}
      <p className="mt-8 rounded-xs border border-white/10 bg-(--surface-container-low) px-6 py-8 text-(--on-surface-variant)">
        This section is a placeholder. Content will be added later.
      </p>
    </div>
  );
}
