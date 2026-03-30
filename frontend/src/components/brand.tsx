import { Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  iconClassName?: string;
};

export function BrandMark({ className, iconClassName }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "relative grid place-items-center rounded-2xl bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.35),_transparent_60%),linear-gradient(180deg,rgba(109,91,255,1)_0%,rgba(77,62,212,1)_100%)] shadow-[0_18px_40px_-24px_rgba(108,92,231,0.85)] ring-1 ring-white/10",
        className
      )}
      >
      <Share2 className={cn("h-6.5 w-6.5 text-white stroke-[2.35]", iconClassName)} aria-hidden="true" />
    </div>
  );
}
