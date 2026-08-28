# Motion System & Animation Guidelines

## Motion Timing Constants

- **Page Transition**: `180ms` fade + `8px` Y movement
- **List Stagger**: `30ms` per row (staggered up to max 8 items)
- **Modal Entrance**: `220ms` scale `0.96` to `1` with slight spring overshoot
- **Live Finding Stream**: Enter from `-8px`, brief severity color flash, fade over `800ms`
- **Gradient Sweep**: `400ms` diagonal spectrum sweep animation

## Reduced Motion Accessibility

All Framer Motion variants and CSS keyframe animations respect `prefers-reduced-motion: reduce`. When reduced motion is requested by the OS, motion is replaced with simple fade transitions.
