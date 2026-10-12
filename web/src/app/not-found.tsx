import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="mt-4 text-2xl font-semibold">This page doesn&apos;t exist</h1>
      <p className="max-w-sm text-muted">The load may have expired or the link is wrong.</p>
      <div className="flex gap-2">
        <LinkButton href="/app/loads">Load board</LinkButton>
        <LinkButton href="/" variant="outline">Home</LinkButton>
      </div>
    </div>
  );
}
