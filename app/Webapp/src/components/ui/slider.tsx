"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

// shadcn/ui-style Slider built on Radix UI primitives. Thumb is fixed at
// 16px (h-4 w-4) so layouts that need to align ticks or floating labels
// with the thumb's centre can rely on a thumb radius of exactly 8px,
// independent of the browser's native range-input styling.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
      <SliderPrimitive.Range className="absolute h-full bg-sky-400 dark:bg-sky-500" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        "block h-4 w-4 rounded-full border-2 border-sky-400 bg-white shadow",
        "ring-offset-white transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "dark:border-sky-300 dark:bg-slate-900",
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
