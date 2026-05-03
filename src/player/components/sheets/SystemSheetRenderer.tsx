import React from 'react';
import type { Actor, ColumnConfig } from '../../../types';
import { getSystemSheet } from '../../../components/Systems/SheetRegistry';

interface Props {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
}

/**
 * Диспетчер чарников для Player View.
 * Делегирует рендер к системному листу (или GenericLoreSheet как fallback).
 * Все листы здесь read-only по конструкции — нет обработчиков изменений.
 */
export function SystemSheetRenderer({ actor, columns, systemName }: Props) {
  const SheetComponent = getSystemSheet(systemName);
  return <SheetComponent actor={actor} columns={columns} systemName={systemName} />;
}
