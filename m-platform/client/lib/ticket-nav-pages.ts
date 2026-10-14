/** Serializable nav shape for building Raise Ticket page pickers (mirrors Navbar routes). */
export type TicketNavSourceItem = {
  label: string;
  path: string;
  hasDropdown?: boolean;
  dropdownItems?: {
    label: string;
    path: string;
    nestedItems?: { label: string; path: string }[];
  }[];
};

export type TicketNavPageOption = {
  label: string;
  path: string;
  /** Nested link under a navbar dropdown parent (indented like navbar nested menu). */
  isNested: boolean;
};

/** One navbar dropdown row (e.g. Scheduled Airlines) and its nested links. */
export type TicketNavDropdownGroup = {
  groupLabel: string;
  groupPath: string;
  hasNested: boolean;
  items: TicketNavPageOption[];
};

export type TicketNavSection = {
  sectionLabel: string;
  sectionPath: string;
  hasNavDropdown: boolean;
  groups: TicketNavDropdownGroup[];
};

export function buildTicketNavSections(items: TicketNavSourceItem[]): TicketNavSection[] {
  return items.map((item) => {
    if (!item.hasDropdown || !item.dropdownItems?.length) {
      return {
        sectionLabel: item.label,
        sectionPath: item.path,
        hasNavDropdown: false,
        groups: [
          {
            groupLabel: item.label,
            groupPath: item.path,
            hasNested: false,
            items: [{ label: item.label, path: item.path, isNested: false }],
          },
        ],
      };
    }

    const groups: TicketNavDropdownGroup[] = item.dropdownItems.map((sub) => {
      const nested = sub.nestedItems ?? [];
      return {
        groupLabel: sub.label,
        groupPath: sub.path,
        hasNested: nested.length > 0,
        items: [
          { label: sub.label, path: sub.path, isNested: false },
          ...nested.map((n) => ({ label: n.label, path: n.path, isNested: true })),
        ],
      };
    });

    return {
      sectionLabel: item.label,
      sectionPath: item.path,
      hasNavDropdown: true,
      groups,
    };
  });
}

export function ticketSectionPaths(section: TicketNavSection): string[] {
  return section.groups.flatMap((g) => g.items.map((i) => i.path));
}

export function findTicketPageInSection(
  section: TicketNavSection,
  path: string
): { group: TicketNavDropdownGroup; page: TicketNavPageOption } | null {
  for (const group of section.groups) {
    const page = group.items.find((i) => i.path === path);
    if (page) return { group, page };
  }
  return null;
}

export type TicketDropdownOption = { value: string; label: string };

export function buildSectionDropdownOptions(sections: TicketNavSection[]): TicketDropdownOption[] {
  return sections.map((s) => ({ value: s.sectionPath, label: s.sectionLabel }));
}

/** Flat options for AdminRadioDropdown — mirrors navbar grouping (Reports flat, others grouped labels). */
export function buildSubPageDropdownOptions(section: TicketNavSection | null): TicketDropdownOption[] {
  if (!section) return [];

  if (section.sectionLabel === 'Reports' || section.sectionLabel === 'MIS') {
    return section.groups.flatMap((group) =>
      group.items.map((page) => ({
        value: page.path,
        label: page.isNested ? `  ${page.label}` : page.label,
      }))
    );
  }

  const options: TicketDropdownOption[] = [];
  for (const group of section.groups) {
    for (const page of group.items) {
      if (page.isNested) {
        options.push({ value: page.path, label: `↳ ${page.label}` });
      } else {
        options.push({ value: page.path, label: page.label });
      }
    }
  }
  return options;
}

export function resolveTicketPath(
  navSections: TicketNavSection[],
  path: string
): { sectionPath: string; subPagePath: string } | null {
  for (const section of navSections) {
    if (section.sectionPath === path) {
      const first = section.groups[0]?.items[0]?.path ?? path;
      return { sectionPath: section.sectionPath, subPagePath: first };
    }
    const hit = findTicketPageInSection(section, path);
    if (hit) {
      return { sectionPath: section.sectionPath, subPagePath: hit.page.path };
    }
  }
  return null;
}

/** Map ModuleAppNav items → Raise Ticket page pickers. */
export function moduleNavItemsToTicketSource(
  items: Array<{
    label: string;
    href?: string;
    children?: Array<{ label: string; href: string }>;
  }>,
): TicketNavSourceItem[] {
  return items.map((item) => {
    const children = item.children ?? [];
    const fallbackPath = item.href || children[0]?.href || '/';
    if (!children.length) {
      return {
        label: item.label,
        path: fallbackPath,
        hasDropdown: false,
      };
    }
    return {
      label: item.label,
      path: fallbackPath,
      hasDropdown: true,
      dropdownItems: children.map((c) => ({
        label: c.label,
        path: c.href,
      })),
    };
  });
}
