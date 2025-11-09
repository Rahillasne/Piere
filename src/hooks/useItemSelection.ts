import { useState, useCallback } from 'react';

export interface SelectableItem {
  id: string;
  selected?: boolean;
}

/**
 * Hook for managing multi-item selection state
 * Useful for image galleries, file lists, etc.
 */
export function useItemSelection<T extends SelectableItem>(initialItems: T[] = []) {
  const [items, setItems] = useState<T[]>(initialItems);

  const toggleItem = useCallback((id: string) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  const selectItem = useCallback((id: string) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, selected: true } : item
      )
    );
  }, []);

  const deselectItem = useCallback((id: string) => {
    setItems((prevItems) =>
      prevItems.map((item) =>
        item.id === id ? { ...item, selected: false } : item
      )
    );
  }, []);

  const selectAll = useCallback(() => {
    setItems((prevItems) =>
      prevItems.map((item) => ({ ...item, selected: true }))
    );
  }, []);

  const deselectAll = useCallback(() => {
    setItems((prevItems) =>
      prevItems.map((item) => ({ ...item, selected: false }))
    );
  }, []);

  const getSelectedItems = useCallback(() => {
    return items.filter((item) => item.selected);
  }, [items]);

  const getSelectedIds = useCallback(() => {
    return items.filter((item) => item.selected).map((item) => item.id);
  }, [items]);

  const isSelected = useCallback(
    (id: string) => {
      return items.find((item) => item.id === id)?.selected || false;
    },
    [items]
  );

  return {
    items,
    setItems,
    toggleItem,
    selectItem,
    deselectItem,
    selectAll,
    deselectAll,
    getSelectedItems,
    getSelectedIds,
    isSelected,
  };
}
