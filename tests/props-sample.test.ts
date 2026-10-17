/**
 * propsSample reads a component's own props type and writes starter
 * JSON — the "Sample props" button in the props editor. These tests use
 * the exact shapes from the snippet folders (drag order, 3d carousel,
 * scroll list) plus the common edge cases.
 */
import { describe, expect, it } from "vitest";
import { sampleProps } from "../src/core/propsSample";

const DRAG = `
"use client";

import React, { useEffect } from "react";
import { Reorder } from "framer-motion";

export interface DragItem {
  id: number;
  title: string;
  subtitle: string;
  date: string;
  link?: string;
}

interface DragOrderListProps {
  items: DragItem[];
  onReorder?: (items: DragItem[]) => void;
}

export function DragOrderList({ items, onReorder }: DragOrderListProps) {
  return <Reorder.Group values={items} />;
}
`;

const CAROUSEL = `
'use client'
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface Slide {
    id: number;
    src: string;
    href: string;
}

interface ThreeDImageCarouselProps {
    /** The array of image data for the slider. */
    slides: Slide[];
    /** Number of visible items in the slider (3 or 5). Default is 5. */
    itemCount?: 3 | 5;
    autoplay?: boolean;
    delay?: number;
    pauseOnHover?: boolean;
    className?: string;
}

export default function ThreeDImageCarousel({ slides, itemCount = 5 }: ThreeDImageCarouselProps) {
    return <div>{slides.length}</div>;
}
`;

const SCROLL = `
import React from "react";
import { motion, Variants } from "framer-motion";

interface ScrollListProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight?: number;
}

const ScrollList = <T,>({ data, renderItem, itemHeight = 155 }: ScrollListProps<T>) => {
  return <div>{data.map(renderItem)}</div>;
};

export default ScrollList;
`;

describe("sampleProps", () => {
  it("samples an array of a local interface (drag order)", () => {
    const sample = sampleProps(DRAG);
    expect(sample.skipped).toEqual([]);
    const items = sample.props.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(5);
    expect(items[0]).toEqual({
      id: 1,
      title: "Item 1",
      subtitle: "Sample subtitle 1",
      date: "2026-01-01",
    });
    /* optional props are left to the component's own defaults */
    expect("onReorder" in sample.props).toBe(false);
  });

  it("gives image fields a usable URL (3d carousel)", () => {
    const sample = sampleProps(CAROUSEL);
    const slides = sample.props.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(5);
    expect(slides[0].src).toMatch(/^https:\/\/picsum\.photos\//);
    expect(slides[2].href).toBe("https://example.com");
    expect(slides[0].id).toBe(1);
    /* the union-typed optionals stay out */
    expect("itemCount" in sample.props).toBe(false);
  });

  it("handles generic element types and function props (scroll list)", () => {
    const sample = sampleProps(SCROLL);
    const data = sample.props.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(5);
    expect(data[0]).toEqual({ id: 1, title: "Item 1" });
    const renderItem = sample.props.renderItem;
    expect(typeof renderItem).toBe("string");
    const revived = new Function(`return (${renderItem as string})`)() as (
      item: unknown,
      index: number,
    ) => string;
    expect(typeof revived).toBe("function");
    expect(revived({ title: "Hi" }, 0)).toBe("Hi");
    expect(revived(null, 4)).toBe("Item 5");
  });

  it("reads an inline destructured type on the default export", () => {
    const source = `
      export default function Chip({ label, count = 1 }: { label: string; count?: number }) {
        return <span>{label}{count}</span>;
      }
    `;
    const sample = sampleProps(source);
    expect(sample.props).toEqual({ label: "Item 1" });
  });

  it("picks the first literal of a union and keeps function props callable", () => {
    const source = `
      interface ButtonProps {
        variant: "solid" | "outline";
        tone?: "a" | "b";
        onPick: (id: number) => void;
      }
      export default function Btn(props: ButtonProps) { return null; }
    `;
    const sample = sampleProps(source);
    expect(sample.props.variant).toBe("solid");
    expect(typeof sample.props.onPick).toBe("string");
    expect(new Function(`return (${sample.props.onPick as string})`)()).toBeTypeOf("function");
  });

  it("reports required fields it cannot sample and ignores commented-out types", () => {
    const source = `
      /* interface Fake { a: string } */
      // type AlsoFake = { b: number }
      interface WidgetProps {
        weird: SomeUnknownType;
        note: string; // trailing comment
      }
      export default function Widget({ weird, note }: WidgetProps) { return null; }
    `;
    const sample = sampleProps(source);
    expect(sample.skipped).toEqual(["weird"]);
    expect(sample.props.note).toBe("Sample text");
  });

  it("returns nothing for a component without props", () => {
    const sample = sampleProps("export default function Plain() { return null; }");
    expect(sample).toEqual({ props: {}, skipped: [] });
  });
});
