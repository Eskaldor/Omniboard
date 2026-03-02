import React, { useEffect, useState } from 'react';

interface InlineInputProps {
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  className?: string;
  maxValue?: number;
}

export function InlineInput({
  value,
  onChange,
  type = 'text',
  className = '',
  maxValue,
}: InlineInputProps) {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const commitValue = () => {
    if (type !== 'number') {
      onChange(localVal.toString());
      return;
    }
    const str = localVal.toString().trim();
    const base = typeof value === 'string' ? parseFloat(value) || 0 : Number(value);
    let newNum: number;
    if (str.startsWith('+') || str.startsWith('-')) {
      const delta = parseFloat(str) || 0;
      newNum = base + delta;
    } else {
      const parsed = parseFloat(str);
      newNum = Number.isNaN(parsed) ? 0 : parsed;
    }
    if (maxValue !== undefined && maxValue !== null && !Number.isNaN(maxValue)) {
      newNum = Math.min(newNum, maxValue);
    }
    const newValStr = String(newNum);
    onChange(newValStr);
    setLocalVal(newValStr);
  };

  return (
    <input
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`${className} ${type === 'number' ? '[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : ''}`}
    />
  );
}
