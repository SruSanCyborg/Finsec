/**
 * SIRIUS Motion System & Framer Motion Animation Variants
 */
export const MOTION_TIMING = {
    page: 0.18, // 180ms page transition
    stagger: 0.03, // 30ms per list row
    modal: 0.22, // 220ms modal entrance
    findingFlash: 0.8, // 800ms live finding flash fade
    sweep: 0.4, // 400ms gradient sweep
};
// Page Transition: 180ms fade + 8px Y movement
export const pageTransitionVariants = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0, transition: { duration: MOTION_TIMING.page, ease: 'easeOut' } },
    exit: { opacity: 0, y: -4, transition: { duration: MOTION_TIMING.page * 0.75, ease: 'easeIn' } },
};
// List Stagger Container & Items (max 8 visible items staggered)
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
    animate: { opacity: 1, y: 0, transition: { duration: 0.15, ease: 'easeOut' } },
};
// Modal: Scale 0.96 -> 1, fade, 220ms with slight spring overshoot
export const modalAnimationVariants = {
    initial: { opacity: 0, scale: 0.96, y: 12 },
    animate: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: {
            type: 'spring',
            damping: 24,
            stiffness: 300,
            duration: MOTION_TIMING.modal,
        },
    },
    exit: {
        opacity: 0,
        scale: 0.97,
        y: 8,
        transition: { duration: 0.15, ease: 'easeIn' },
    },
};
// Live Finding Stream Entrance: Enter from -8px, fade over 800ms
export const liveFindingVariants = {
    initial: { opacity: 0, y: -8, backgroundColor: 'rgba(167, 139, 250, 0.25)' },
    animate: {
        opacity: 1,
        y: 0,
        backgroundColor: 'rgba(18, 20, 28, 0.75)',
        transition: { duration: MOTION_TIMING.findingFlash, ease: 'easeOut' },
    },
};
// Reduced Motion Fallbacks
export const reducedMotionVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.1 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
};
