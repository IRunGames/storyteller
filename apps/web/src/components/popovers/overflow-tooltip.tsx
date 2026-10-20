"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Portal, Text, Tooltip } from "@chakra-ui/react";

type Props = ComponentProps<typeof Text> & {
  /** The one line of text, which is also what the tooltip shows. */
  children: string;
};

/**
 * One truncated line of text that gives its whole self as a tooltip, but
 * only while it is cut off: a line that fits says nothing on hover, so the
 * tooltip is never noise over text that can be read as it is. Whether it
 * is cut off is measured from the element (scrollWidth past clientWidth),
 * as it mounts, when the text changes, and whenever its box is resized.
 * The pills' titles use it, which a long title or a narrow stack truncates.
 */
export function OverflowTooltip({ children, ...props }: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  const text = (
    <Text ref={ref} truncate {...props}>
      {children}
    </Text>
  );
  if (!overflows) return text;

  return (
    <Tooltip.Root openDelay={200} positioning={{ placement: "top" }}>
      <Tooltip.Trigger asChild>{text}</Tooltip.Trigger>
      <Portal>
        <Tooltip.Positioner>
          <Tooltip.Content>{children}</Tooltip.Content>
        </Tooltip.Positioner>
      </Portal>
    </Tooltip.Root>
  );
}
