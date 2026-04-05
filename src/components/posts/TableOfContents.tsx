'use client';

import { useEffect, useState, useRef } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function TableOfContents() {
  const [headings, setHeadings] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const headingElementsRef = useRef<Element[]>([]);

  useEffect(() => {
    const article = document.querySelector('article');
    if (!article) return;

    const elements = Array.from(article.querySelectorAll('h2, h3'));
    headingElementsRef.current = elements;

    const items: TocItem[] = elements.map((el) => ({
      id: el.id,
      text: el.textContent ?? '',
      level: Number(el.tagName.charAt(1)),
    }));
    setHeadings(items);

    // Set initial active heading: the last heading that's above viewport center
    const setClosestHeading = () => {
      const scrollY = window.scrollY;
      const offset = 100;

      let current = '';
      for (const el of elements) {
        const top = (el as HTMLElement).offsetTop;
        if (top - offset <= scrollY) {
          current = el.id;
        }
      }
      // If no heading is above scroll position, use the first one
      if (!current && elements.length > 0) {
        current = elements[0].id;
      }
      setActiveId(current);
    };

    setClosestHeading();

    const handleScroll = () => {
      requestAnimationFrame(setClosestHeading);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (headings.length === 0) return null;

  return (
    <nav className="hidden xl:block sticky top-100 ml-40 w-220 max-h-[calc(100vh-120px)] overflow-y-auto">
      <p className="text-sm font-bold mb-12 text-gray-500 dark:text-gray-400">
        목차
      </p>
      <ul className="space-y-6 text-sm">
        {headings.map((heading) => (
          <li
            key={heading.id}
            style={{ paddingLeft: `${(heading.level - 2) * 12}px` }}
          >
            <a
              href={`#${heading.id}`}
              className={`block py-2 transition-colors ${
                activeId === heading.id
                  ? 'text-blue-500 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
