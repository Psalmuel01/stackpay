"use client";

import { motion, useInView } from "framer-motion";
import { useMemo, useRef, ReactNode, ElementType } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: ElementType;
  once?: boolean;
}

export function FadeIn({ children, delay = 0, className, as: Component = "div", once = true }: FadeInProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "-40px" });
  const MotionComponent = useMemo(() => motion(Component as any), [Component]);

  return (
    <MotionComponent
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >
      {children}
    </MotionComponent>
  );
}

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  delayChildren?: number;
  staggerChildren?: number;
  as?: ElementType;
  once?: boolean;
}

export function StaggerContainer({
  children,
  className,
  delayChildren = 0.1,
  staggerChildren = 0.1,
  as: Component = "div",
  once = true,
}: StaggerContainerProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "-40px" });
  const MotionComponent = useMemo(() => motion(Component as any), [Component]);

  const containerVariants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren,
        delayChildren,
      },
    },
  };

  return (
    <MotionComponent
      ref={ref}
      variants={containerVariants}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      className={className}
    >
      {children}
    </MotionComponent>
  );
}

interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export function StaggerItem({ children, className, as: Component = "div" }: StaggerItemProps) {
  const MotionComponent = useMemo(() => motion(Component as any), [Component]);
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }
    },
  };

  return (
    <MotionComponent variants={itemVariants} className={className}>
      {children}
    </MotionComponent>
  );
}

interface HoverCardProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

export function HoverCard({ children, className, as: Component = "div" }: HoverCardProps) {
  const MotionComponent = useMemo(() => motion(Component as any), [Component]);

  return (
    <MotionComponent
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={className}
    >
      {children}
    </MotionComponent>
  );
}
