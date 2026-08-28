/**
 * SIRIUS Editorial Security Command Center Motion System
 * Controlled, Meaningful Micro-interactions & Framer Motion Animation Variants
 */

export const MOTION_TIMING = {
  fast: 0.14, // 140ms quick action / press
  base: 0.20, // 200ms page / card transition
  slow: 0.32, // 320ms modal / overlay entrance
  page: 0.20,
  stagger: 0.03,
  modal: 0.24,
  findingFlash: 0.80,
  sweep: 0.40,
} as const;

// Page Entrance Variants (200ms ease-out)
export const pageTransitionVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: MOTION_TIMING.base, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -4, transition: { duration: MOTION_TIMING.fast, ease: 'easeIn' as const } },
};

// List Row Stagger Variants
export const listStaggerContainerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: MOTION_TIMING.stagger,
      delayChildren: 0.02,
    },
  },
};

export const listStaggerItemVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: MOTION_TIMING.fast, ease: 'easeOut' as const } },
};

// Modal Entrance Variants (240ms ease-out with soft spring)
export const modalAnimationVariants = {
  initial: { opacity: 0, scale: 0.97, y: 10 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      damping: 26,
      stiffness: 320,
      duration: MOTION_TIMING.modal,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: { duration: MOTION_TIMING.fast, ease: 'easeIn' as const },
  },
};

// Dropdown Entrance Variants (140ms ease-out)
export const dropdownAnimationVariants = {
  initial: { opacity: 0, scale: 0.95, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: MOTION_TIMING.fast, ease: 'easeOut' as const } },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: MOTION_TIMING.fast, ease: 'easeIn' as const } },
};

// Card Hover & Press Micro-interactions
export const cardHoverVariants = {
  initial: { y: 0, boxShadow: 'var(--shadow-small)' },
  hover: { y: -2, boxShadow: 'var(--shadow-medium)', transition: { duration: MOTION_TIMING.fast, ease: 'easeOut' as const } },
};

export const buttonPressVariants = {
  initial: { scale: 1 },
  tap: { scale: 0.98, transition: { duration: MOTION_TIMING.fast } },
};

// Live Stream Finding Entrance
export const liveFindingVariants = {
  initial: { opacity: 0, y: -8, backgroundColor: 'rgba(14, 107, 74, 0.12)' },
  animate: {
    opacity: 1,
    y: 0,
    backgroundColor: 'var(--color-bg-surface)',
    transition: { duration: MOTION_TIMING.findingFlash, ease: 'easeOut' as const },
  },
};

// Reduced Motion Fallbacks
export const reducedMotionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
