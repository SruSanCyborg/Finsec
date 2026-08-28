"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
        {
          primary: "bg-zinc-100 text-zinc-950 hover:bg-white",
          secondary: "border border-line bg-raise text-zinc-200 hover:bg-[#1A1A1E]",
          ghost: "text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.04]",
          danger: "bg-severity-critical text-white hover:brightness-110",
          outline: "border border-line-strong text-zinc-100 hover:border-zinc-500 hover:bg-white/[0.02]",
        }[variant],
        {
          sm: "h-8 px-3 text-xs",
          md: "h-10 px-4 text-sm",
          lg: "h-12 px-6 text-base",
          icon: "h-9 w-9",
        }[size],
        className
      )}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn("input", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("input min-h-[90px] resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select
      {...props}
      className={cn(
        "w-full appearance-none rounded-lg border border-line bg-[#101013] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-accent/60 [&>option]:bg-panel",
        props.className
      )}
    />
}

export function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn("label", className)}>{children}</label>;
}

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card p-5", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="text-sm font-medium tracking-tight text-zinc-200">{children}</h3>
      {right}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center py-16", className)}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line py-14 text-center">
      {icon && <div className="text-zinc-600">{icon}</div>}
      <div>
        <p className="font-medium text-zinc-300">{title}</p>
        {subtitle && <p className="mt-1 max-w-sm text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
