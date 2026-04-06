# Stock Client Skill Assets

This directory contains reusable templates and code patterns for the stock-client project.

## Templates

### Component Template
当创建新的UI组件时，可以参考以下结构:

```tsx
import React from 'react';
import styles from './ComponentName.module.css';

interface ComponentNameProps {
  // props definition
}

export const ComponentName: React.FC<ComponentNameProps> = ({}) => {
  return (
    <div className={styles.container}>
      {/* component content */}
    </div>
  );
};
```

### Hook Template
自定义Hook模板:

```typescript
import { useState, useEffect, useCallback } from 'react';

export function useCustomHook<T>(initialValue: T) {
  const [state, setState] = useState<T>(initialValue);
  
  const updateState = useCallback((newValue: T) => {
    setState(newValue);
  }, []);
  
  return { state, updateState };
}
```

### Store Template (Zustand)
状态管理模板:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MyStore {
  data: any[];
  setData: (data: any[]) => void;
}

export const useMyStore = create<MyStore>()(
  persist(
    (set) => ({
      data: [],
      setData: (data) => set({ data }),
    }),
    {
      name: 'my-storage-key',
    }
  )
);
```
