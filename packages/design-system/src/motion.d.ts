/**
 * SIRIUS Motion System & Framer Motion Animation Variants
 */
export declare const MOTION_TIMING: {
    page: number;
    stagger: number;
    modal: number;
    findingFlash: number;
    sweep: number;
};
export declare const pageTransitionVariants: {
    initial: {
        opacity: number;
        y: number;
    };
    animate: {
        opacity: number;
        y: number;
        transition: {
            duration: number;
            ease: string;
        };
    };
    exit: {
        opacity: number;
        y: number;
        transition: {
            duration: number;
            ease: string;
        };
    };
};
export declare const listStaggerContainerVariants: {
    initial: {
        opacity: number;
    };
    animate: {
        opacity: number;
        transition: {
            staggerChildren: number;
            delayChildren: number;
        };
    };
};
export declare const listStaggerItemVariants: {
    initial: {
        opacity: number;
        y: number;
    };
    animate: {
        opacity: number;
        y: number;
        transition: {
            duration: number;
            ease: string;
        };
    };
};
export declare const modalAnimationVariants: {
    initial: {
        opacity: number;
        scale: number;
        y: number;
    };
    animate: {
        opacity: number;
        scale: number;
        y: number;
        transition: {
            type: string;
            damping: number;
            stiffness: number;
            duration: number;
        };
    };
    exit: {
        opacity: number;
        scale: number;
        y: number;
        transition: {
            duration: number;
            ease: string;
        };
    };
};
export declare const liveFindingVariants: {
    initial: {
        opacity: number;
        y: number;
        backgroundColor: string;
    };
    animate: {
        opacity: number;
        y: number;
        backgroundColor: string;
        transition: {
            duration: number;
            ease: string;
        };
    };
};
export declare const reducedMotionVariants: {
    initial: {
        opacity: number;
    };
    animate: {
        opacity: number;
        transition: {
            duration: number;
        };
    };
    exit: {
        opacity: number;
        transition: {
            duration: number;
        };
    };
};
