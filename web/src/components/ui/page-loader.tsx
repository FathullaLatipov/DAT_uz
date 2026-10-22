import { Logo } from "../logo";

/**
 * Centered preloader for a page that is still loading. It appears only after a short delay, so fast page
 * changes show nothing at all (no flicker), and slow ones show the mark with a spinning ring.
 */
export function PageLoader({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex min-h-[60dvh] items-center justify-center">
      <div className="animate-fade-up [animation-delay:180ms]">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-spin rounded-full border-[3px] border-brand/15 border-t-brand" aria-hidden />
          <Logo withText={false} className="[&_svg]:h-9 [&_svg]:w-9 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
