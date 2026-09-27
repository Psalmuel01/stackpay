export default function PageHeader({
  eyebrow = "Merchant workspace",
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8 space-y-3 md:mb-10">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-white/50">
        <span className="h-1.5 w-1.5 rounded-full bg-[#fc6532]" />
        {eyebrow}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h1>
      {subtitle && (
        <p className="max-w-2xl text-sm leading-6 text-white/60 md:text-base">
          {subtitle}
        </p>
      )}
    </div>
  );
}
