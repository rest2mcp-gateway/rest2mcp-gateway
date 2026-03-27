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
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("h-5 w-5 text-white", iconClassName)}
        aria-hidden="true"
      >
        <ellipse cx="16" cy="8" rx="7.5" ry="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 8V15C8.5 16.933 11.858 18.5 16 18.5C20.142 18.5 23.5 16.933 23.5 15V8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8.5 15V22C8.5 23.933 11.858 25.5 16 25.5C20.142 25.5 23.5 23.933 23.5 22V15" stroke="currentColor" strokeWidth="1.8" />
        <path d="M20.5 11.75H25.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M23.125 9.125V14.375" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
