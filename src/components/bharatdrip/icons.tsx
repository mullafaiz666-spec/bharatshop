import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (props: IconProps) => ({
  width: props.size ?? 20,
  height: props.size ?? 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export function ArrowUpRight(props: IconProps) {
  return <svg {...base(props)}><path d="M5 19 19 5M8 5h11v11" /></svg>;
}

export function ArrowRight(props: IconProps) {
  return <svg {...base(props)}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
}

export function ArrowLeft(props: IconProps) {
  return <svg {...base(props)}><path d="M20 12H5m6 6-6-6 6-6" /></svg>;
}

export function Bag(props: IconProps) {
  return <svg {...base(props)}><path d="M5.5 8.5h13l1 12h-15l1-12Z" /><path d="M9 9V6.8a3 3 0 0 1 6 0V9" /></svg>;
}

export function Search(props: IconProps) {
  return <svg {...base(props)}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
}

export function User(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="8" r="3.3" /><path d="M5.5 20c.6-3.2 3-5 6.5-5s5.9 1.8 6.5 5" /></svg>;
}

export function Heart(props: IconProps) {
  return <svg {...base(props)}><path d="M20.8 8.8c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z" /></svg>;
}

export function Menu(props: IconProps) {
  return <svg {...base(props)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
}

export function X(props: IconProps) {
  return <svg {...base(props)}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

export function Plus(props: IconProps) {
  return <svg {...base(props)}><path d="M12 5v14M5 12h14" /></svg>;
}

export function Minus(props: IconProps) {
  return <svg {...base(props)}><path d="M5 12h14" /></svg>;
}

export function ChevronDown(props: IconProps) {
  return <svg {...base(props)}><path d="m6 9 6 6 6-6" /></svg>;
}

export function ChevronUp(props: IconProps) {
  return <svg {...base(props)}><path d="m6 15 6-6 6 6" /></svg>;
}

export function ChevronRight(props: IconProps) {
  return <svg {...base(props)}><path d="m9 18 6-6-6-6" /></svg>;
}

export function Star(props: IconProps) {
  return <svg {...base(props)} fill="currentColor" stroke="none"><path d="m12 2.8 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9L12 2.8Z" /></svg>;
}

export function Sliders(props: IconProps) {
  return <svg {...base(props)}><path d="M4 6h8M16 6h4M4 12h3M11 12h9M4 18h8M16 18h4" /><circle cx="14" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></svg>;
}

export function Truck(props: IconProps) {
  return <svg {...base(props)}><path d="M3 6h11v10H3zM14 10h3l4 4v2h-7z" /><circle cx="7" cy="18" r="1.7" /><circle cx="18" cy="18" r="1.7" /></svg>;
}

export function Shield(props: IconProps) {
  return <svg {...base(props)}><path d="M12 3 19 6v5c0 4.7-3 8.1-7 10-4-1.9-7-5.3-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></svg>;
}

export function Sparkle(props: IconProps) {
  return <svg {...base(props)}><path d="m12 2 1.4 7.2L20 12l-6.6 2.8L12 22l-1.4-7.2L4 12l6.6-2.8L12 2Z" /><path d="m19 3 .5 2.5L22 6l-2.5.5L19 9l-.5-2.5L16 6l2.5-.5L19 3Z" /></svg>;
}

export function Check(props: IconProps) {
  return <svg {...base(props)}><path d="m5 12 4.5 4.5L19 7" /></svg>;
}

export function Lock(props: IconProps) {
  return <svg {...base(props)}><rect x="5" y="10" width="14" height="11" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}
