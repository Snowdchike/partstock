import { ulid } from 'ulid';

// Sortable, URL-safe, 26-char unique IDs.
// Time-prefixed so DB scans on recency are fast.

export function newId(): string {
  return ulid();
}
