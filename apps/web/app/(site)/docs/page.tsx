import { BookOpen } from "lucide-react";
import { DocPage } from "./components";
import { SECTIONS } from "./sections";

const Overview = SECTIONS[""];

export default function DocsHome() {
  return (
    <div className="min-w-0">
      <div className="mb-10 border-b border-line pb-10">
        <p className="mb-4 flex items-center gap-2 text-sm font-medium text-accent-text">
          <BookOpen size={16} aria-hidden="true" />
          StackPay documentation
        </p>
        <p className="max-w-3xl text-4xl font-semibold tracking-tight text-fg md:text-5xl">From first connection to confirmed payment.</p>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-fg-2">
          Step-by-step guides for merchants, implementation details for developers, and a clear view of what works today and what’s still in progress.
        </p>
      </div>
      <DocPage slug="">
        <Overview />
      </DocPage>
    </div>
  );
}
